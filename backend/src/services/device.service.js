const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const logger = require('../config/logger');
const deviceRepository = require('../repositories/device.repository');
const mlClient = require('./mlClient');
const realtime = require('./realtime.service');
const settingsService = require('./settings.service');
const notificationService = require('./notification.service');

const SAFE_FIELDS = ['deviceName', 'building', 'room', 'cameraType', 'connectionMode', 'streamUrl', 'ipAddress', 'defaultCourseId', 'status', 'firmwareVersion'];

function newApiKey() {
  return `amb82_${crypto.randomBytes(24).toString('hex')}`;
}

function sanitize(device) {
  if (!device) return device;
  const { apiKeyHash, ...rest } = device;
  return rest;
}

// Short-lived cache of verified credentials: AMB82 frame pushes arrive every
// second and bcrypt.compare is intentionally slow.
const credCache = new Map();
const CRED_TTL_MS = 60 * 1000;

const deviceService = {
  sanitize,

  async register(data) {
    const deviceCode = String(data.deviceCode).toUpperCase();
    const existing = await deviceRepository.findByCode(deviceCode);
    if (existing) throw ApiError.conflict('A device with this deviceCode is already registered');

    const apiKey = newApiKey();
    const apiKeyHash = await bcrypt.hash(apiKey, env.bcryptSaltRounds);
    const payload = { deviceCode, apiKeyHash, status: 'ACTIVE' };
    for (const k of SAFE_FIELDS) if (data[k] !== undefined && k !== 'status') payload[k] = data[k] || null;
    payload.deviceName = data.deviceName;
    const device = await deviceRepository.create(payload);
    return { device: sanitize(device), apiKey };
  },

  async getById(id) {
    const device = await deviceRepository.findById(id);
    if (!device) throw ApiError.notFound('Device not found');
    return sanitize(device);
  },

  async list({ search, status, page = 1, limit = 20 }) {
    const { items, total } = await deviceRepository.findAll({ search, status, page, limit });
    return { items: items.map(sanitize), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  async setStatus(id, status) {
    await deviceService.getById(id);
    credCache.clear();
    if (status !== 'ACTIVE') await deviceService.stopStream(id).catch(() => null);
    return sanitize(await deviceRepository.update(id, { status }));
  },

  async update(id, data) {
    await deviceService.getById(id);
    const patch = {};
    for (const k of SAFE_FIELDS) if (data[k] !== undefined) patch[k] = data[k] === '' ? null : data[k];
    credCache.clear();
    return sanitize(await deviceRepository.update(id, patch));
  },

  async remove(id) {
    await deviceService.getById(id);
    await deviceService.stopStream(id).catch(() => null);
    credCache.clear();
    await deviceRepository.delete(id);
  },

  async rotateKey(id) {
    await deviceService.getById(id);
    const apiKey = newApiKey();
    await deviceRepository.update(id, { apiKeyHash: await bcrypt.hash(apiKey, env.bcryptSaltRounds) });
    credCache.clear();
    return { apiKey };
  },

  async verifyCredentials(deviceCode, apiKey) {
    if (!deviceCode || !apiKey) throw ApiError.unauthorized('Missing device credentials');
    const code = String(deviceCode).toUpperCase();
    const cacheKey = `${code}:${crypto.createHash('sha256').update(apiKey).digest('hex')}`;
    const cached = credCache.get(cacheKey);
    if (cached && Date.now() - cached.at < CRED_TTL_MS) return cached.device;

    const device = await deviceRepository.findByCode(code);
    if (!device) throw ApiError.unauthorized('Unknown device');
    if (device.status !== 'ACTIVE') throw ApiError.forbidden(`Device is ${device.status.toLowerCase()} and cannot submit data`);
    const isMatch = await bcrypt.compare(apiKey, device.apiKeyHash);
    if (!isMatch) throw ApiError.unauthorized('Invalid device API key');
    credCache.set(cacheKey, { device, at: Date.now() });
    return device;
  },

  async heartbeat(device, meta = {}) {
    const patch = { lastActiveAt: new Date() };
    if (meta.firmwareVersion) patch.firmwareVersion = String(meta.firmwareVersion).slice(0, 40);
    if (meta.ipAddress) patch.ipAddress = String(meta.ipAddress).slice(0, 45);
    const updated = await deviceRepository.update(device.id, patch);
    realtime.publish('device', { id: device.id, deviceName: device.deviceName, online: true, lastActiveAt: patch.lastActiveAt });
    return updated;
  },

  async touchFrame(deviceId) {
    await deviceRepository.updateLastActive(deviceId).catch(() => null);
  },

  // ------------------------------------------------------------ RTSP / MJPEG pull streams
  async startStream(id) {
    const device = await deviceRepository.findById(id);
    if (!device) throw ApiError.notFound('Device not found');
    if (device.status !== 'ACTIVE') throw ApiError.badRequest('Device is not active');
    if (!device.streamUrl) throw ApiError.badRequest('Set a streamUrl (e.g. rtsp://192.168.1.50:554) for this device first');
    const settings = await settingsService.get();
    const ml = await mlClient.startStream({
      streamId: device.id,
      url: device.streamUrl,
      label: device.deviceName,
      threshold: settings.recognitionThreshold,
      requireMotion: !!settings.requireLiveness,
      callbackUrl: `${env.internalBaseUrl}/internal/ml/events`,
    });
    if (!ml.ok) throw new ApiError(502, ml.data?.error || 'ML service refused to start stream');
    await deviceRepository.update(id, { streaming: true });
    realtime.publish('device', { id, streaming: true });
    return ml.data.stream;
  },

  async stopStream(id) {
    await mlClient.stopStream(id).catch(() => null);
    await deviceRepository.update(id, { streaming: false }).catch(() => null);
    realtime.publish('device', { id, streaming: false });
    return { stopped: true };
  },

  async streamStatus(id) {
    const ml = await mlClient.streams().catch(() => ({ data: { items: [] } }));
    return (ml.data.items || []).find((s) => s.streamId === id) || null;
  },

  /** Re-attaches streams flagged streaming=true after a restart (ML may start later). */
  async restoreStreams() {
    const devices = await deviceRepository.findAll({ limit: 100 }).catch(() => ({ items: [] }));
    const activeStreaming = (devices.items || []).filter((d) => d.streaming && d.status === 'ACTIVE' && d.streamUrl);
    for (const d of activeStreaming) {
      // eslint-disable-next-line no-await-in-loop
      await deviceService.startStream(d.id).catch((err) => logger.warn({ err: err.message, device: d.id }, 'stream restore failed'));
    }
    return activeStreaming.length;
  },

  /** Raises DEVICE_OFFLINE once per outage. Called by the scheduler. */
  _offline: new Set(),
  async checkOffline() {
    const s = await settingsService.get();
    const cutoff = new Date(Date.now() - (s.deviceOfflineMinutes || 15) * 60000);
    const { items: devices = [] } = await deviceRepository.findAll({ status: 'ACTIVE', limit: 1000 }).catch(() => ({ items: [] }));
    for (const d of devices) {
      const id = d._id || d.id;
      const offline = !d.lastActiveAt || new Date(d.lastActiveAt) < cutoff;
      if (offline && !deviceService._offline.has(id) && d.lastActiveAt) {
        deviceService._offline.add(id);
        realtime.publish('device', { id, deviceName: d.deviceName, online: false });
        // eslint-disable-next-line no-await-in-loop
        await notificationService
          .create({ type: 'DEVICE_OFFLINE', title: `${d.deviceName} is offline`, message: `${d.deviceCode} has not reported since ${new Date(d.lastActiveAt).toISOString()}` })
          .catch(() => null);
      } else if (!offline) {
        deviceService._offline.delete(id);
      }
    }
  },
};

module.exports = deviceService;
