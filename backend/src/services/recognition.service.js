/**
 * Turns face-recognition results (from any camera source) into attendance
 * records and unknown-face reviews. Shared by:
 *   - POST /api/ml/recognize      (browser camera, kiosk, group photo)
 *   - POST /api/devices/frame     (AMB82 Mini pushing JPEG frames)
 *   - POST /api/internal/ml/events (RTSP / MJPEG stream workers)
 */
const attendanceService = require('./attendance.service');
const settingsService = require('./settings.service');
const realtime = require('./realtime.service');
const mlClient = require('./mlClient');
const { UnknownFace, Device } = require('../models');
const { saveJpeg } = require('../utils/imageStore');
const auditLogRepository = require('../repositories/auditLog.repository');
const ApiError = require('../utils/ApiError');

/**
 * Requires `required` hits for a key within `windowMs` (anti-flicker).
 * Each hit can carry the face's signed yaw + centre so we can run an
 * active liveness check: a printed photo / phone screen held in front of
 * the camera stays rigid, a real person's head moves a little between
 * frames. Entries are pruned so the map cannot grow forever.
 */
class HitTracker {
  constructor(required = 2, windowMs = 6000) {
    this.required = required;
    this.windowMs = windowMs;
    this.hits = new Map();
    this.lastPrune = Date.now();
  }

  prune(now) {
    if (now - this.lastPrune < 30000) return;
    this.lastPrune = now;
    for (const [k, arr] of this.hits) if (!arr.length || now - arr[arr.length - 1].t > this.windowMs) this.hits.delete(k);
  }

  /** @returns {{ confirmed: boolean, hits: number, motion: number }} */
  observe(key, sample = {}) {
    const now = Date.now();
    this.prune(now);
    const arr = (this.hits.get(key) || []).filter((h) => now - h.t <= this.windowMs);
    arr.push({ t: now, ...sample });
    this.hits.set(key, arr);
    const yaws = arr.map((h) => h.yaw).filter((v) => typeof v === 'number');
    const motion = yaws.length > 1 ? Math.max(...yaws) - Math.min(...yaws) : 0;
    if (arr.length >= this.required) {
      return { confirmed: true, hits: arr.length, motion, reset: () => this.hits.delete(key) };
    }
    return { confirmed: false, hits: arr.length, motion, reset: () => this.hits.delete(key) };
  }

  get size() {
    return this.hits.size;
  }
}

const pushTracker = new HitTracker(2, 8000);
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of lastUnknownAt) if (now - t > UNKNOWN_COOLDOWN_MS * 3) lastUnknownAt.delete(k);
}, 60000).unref();
const lastUnknownAt = new Map();
const UNKNOWN_COOLDOWN_MS = 20000;
// Minimum head-yaw change across the confirmation frames for the active
// liveness check (yaw is the nose offset relative to the eyes, 0 = frontal).
const MIN_LIVENESS_MOTION = Number(process.env.ACTIVE_LIVENESS_MIN_MOTION || 0.04);

async function recordUnknown({ face, snapshot, device, sessionId }) {
  const settings = await settingsService.get();
  const key = device?.id || 'web';
  if (Date.now() - (lastUnknownAt.get(key) || 0) < UNKNOWN_COOLDOWN_MS) return null;
  lastUnknownAt.set(key, Date.now());
  const snapshotUrl = snapshot ? await saveJpeg('unknown', snapshot).catch(() => null) : null;
  const doc = await UnknownFace.create({
    deviceId: device?.id || null,
    sessionId: sessionId || null,
    snapshotUrl,
    bestCandidateFaceId: face.candidate || null,
    bestScore: face.confidence ?? null,
    qualityScore: face.quality?.score ?? (typeof face.quality === 'number' ? face.quality : null),
    spoofSuspected: !!face.spoofSuspected || (face.liveness?.checked && !face.liveness?.live) || false,
  });
  if (settings.unknownFaceAlerts) {
    realtime.publish('unknown_face', {
      id: doc._id,
      snapshotUrl,
      device: device ? { id: device.id, deviceName: device.deviceName } : null,
      spoofSuspected: doc.spoofSuspected,
    });
  }
  auditLogRepository.record({ action: 'UNKNOWN_FACE', entity: 'UnknownFace', entityId: doc._id, metadata: { deviceId: device?.id } }).catch(() => null);
  return doc;
}

const recognitionService = {
  HitTracker,

  /**
   * Runs recognition on one image and (optionally) marks attendance.
   * @returns {Promise<{faces: Array, processTimeMs: number, frameSize: number[]}>}
   */
  async recognizeImage({ image, autoMark = false, sessionId, courseId, device, user, source = 'WEB_CAMERA', requireConsistency = false, recordUnknowns = false }) {
    const settings = await settingsService.get();
    const ml = await mlClient.recognize(image, {
      threshold: settings.recognitionThreshold,
      multi: true,
      liveness: true,
      returnCrops: autoMark || recordUnknowns,
    });
    if (!ml.ok) {
      const msg = ml.data?.error || ml.data?.message || 'Recognition failed';
      throw new ApiError(ml.status >= 400 && ml.status < 600 ? ml.status : 502, msg);
    }
    const faces = ml.data.faces || [];
    for (const face of faces) {
      const crop = face.crop;
      delete face.crop;

      // Anti-spoofing guard: block attendance on screens or printed photos only if requireLiveness is enabled
      if (settings.requireLiveness && ((face.liveness && face.liveness.checked && !face.liveness.live) || face.spoofSuspected)) {
        face.spoofSuspected = true;
        face.attendance = {
          code: 'SPOOF_SUSPECTED',
          success: false,
          message: 'Anti-spoofing alert: Digital screen or photo attack detected',
        };
        if (recordUnknowns) {
          await recordUnknown({ face: { ...face, spoofSuspected: true }, snapshot: crop, device, sessionId });
        }
        continue;
      } else if (!settings.requireLiveness) {
        face.spoofSuspected = false;
        if (face.liveness) face.liveness.live = true;
      }

      if (face.matched && face.faceId && autoMark) {
        // Active liveness is used only when liveness is required AND no
        // anti-spoof model judged this face.
        const needMotion = settings.requireLiveness && !face.liveness?.checked && source !== 'GROUP_PHOTO';
        if (requireConsistency || needMotion) {
          const obs = pushTracker.observe(`${device?.id || user?.id || 'web'}:${face.faceId}`, {
            yaw: face.quality?.metrics?.yawSigned,
          });
          if (!obs.confirmed) {
            face.attendance = { code: 'VERIFYING', message: 'Confirming identity on next frame' };
            continue;
          }
          if (needMotion && obs.motion < MIN_LIVENESS_MOTION) {
            face.attendance = {
              code: 'VERIFYING',
              message: 'Liveness check: please turn your head slightly',
              livenessChallenge: true,
            };
            if (obs.hits > 12) obs.reset(); // give up on this window, start fresh
            continue;
          }
          obs.reset();
        }
        face.attendance = await attendanceService.markRecognized({
          faceId: face.faceId,
          confidenceScore: face.confidence,
          liveness: face.liveness,
          snapshot: crop,
          device,
          sessionId,
          courseId,
          userId: user?.id || null,
          source,
        });
      } else if (!face.matched && recordUnknowns && face.quality?.ok) {
        await recordUnknown({ face, snapshot: crop, device, sessionId });
      }
    }
    return { faces, processTimeMs: ml.data.processTimeMs, frameSize: ml.data.frameSize };
  },

  /** Events posted by Python stream workers (already consistency-filtered). */
  async handleStreamEvents({ streamId, events = [] }) {
    const device = await Device.findById(streamId).lean();
    if (!device) return { processed: 0, error: 'Unknown stream/device' };
    const dev = { ...device, id: device._id };
    await Device.updateOne({ _id: device._id }, { $set: { lastActiveAt: new Date(), lastFrameAt: new Date() } });
    const results = [];
    for (const e of events) {
      if (e.type === 'MATCH' && e.faceId) {
        results.push(
          await attendanceService.markRecognized({
            faceId: e.faceId,
            confidenceScore: e.confidence,
            liveness: e.liveness,
            snapshot: e.snapshot,
            device: dev,
            source: 'STREAM',
          })
        );
      } else if (e.type === 'UNKNOWN') {
        await recordUnknown({ face: e, snapshot: e.snapshot, device: dev });
        results.push({ code: 'UNKNOWN_RECORDED' });
      }
    }
    return { processed: results.length, results };
  },
};

module.exports = recognitionService;
