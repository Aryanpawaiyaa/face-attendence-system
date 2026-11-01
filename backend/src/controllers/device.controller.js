const deviceService = require('../services/device.service');
const attendanceService = require('../services/attendance.service');
const recognitionService = require('../services/recognition.service');
const mlClient = require('../services/mlClient');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const auditLogRepository = require('../repositories/auditLog.repository');
const deviceRepository = require('../repositories/device.repository');
const http = require('http');
const https = require('https');

function fetchSingleFrame(targetUrl, timeoutMs = 3000, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 3) {
      return reject(new Error('Too many redirects'));
    }
    const isHttps = targetUrl.startsWith('https://');
    const client = isHttps ? https : http;
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        req.destroy();
        reject(new Error(`Camera request timed out (${timeoutMs}ms)`));
      }
    }, timeoutMs);

    const req = client.get(targetUrl, (res) => {
      // Follow HTTP redirects (301, 302, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        clearTimeout(timer);
        finished = true;
        req.destroy();
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
          const parsed = new URL(targetUrl);
          redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl.startsWith('/') ? '' : '/'}${redirectUrl}`;
        }
        return fetchSingleFrame(redirectUrl, timeoutMs, redirectCount + 1).then(resolve).catch(reject);
      }

      if (res.statusCode >= 400) {
        finished = true;
        clearTimeout(timer);
        req.destroy();
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Camera error'}`));
      }

      const contentType = String(res.headers['content-type'] || '').toLowerCase();

      // Case 1: Direct single image
      if (contentType.includes('image/jpeg') || contentType.includes('image/jpg') || contentType.includes('image/png')) {
        const chunks = [];
        let totalBytes = 0;
        const expectedBytes = Number(res.headers['content-length'] || 0);

        res.on('data', (chunk) => {
          if (finished) return;
          chunks.push(chunk);
          totalBytes += chunk.length;
          // Fast-return if content-length is reached
          if (expectedBytes > 0 && totalBytes >= expectedBytes) {
            finished = true;
            clearTimeout(timer);
            req.destroy();
            resolve(Buffer.concat(chunks));
          }
        });
        res.on('end', () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolve(Buffer.concat(chunks));
        });
        return;
      }

      // Case 2: HTML webpage (e.g. root web interface of IP webcam)
      if (contentType.includes('text/html')) {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          req.destroy();
          reject(new Error('URL returned an HTML webpage'));
        }
        return;
      }

      // Case 3: Multipart MJPEG stream (e.g. /video or /mjpeg)
      let buffer = Buffer.alloc(0);
      let foundStart = -1;

      res.on('data', (chunk) => {
        if (finished) return;
        buffer = Buffer.concat([buffer, chunk]);

        if (foundStart === -1) {
          for (let i = 0; i < buffer.length - 1; i++) {
            if (buffer[i] === 0xff && buffer[i + 1] === 0xd8) {
              foundStart = i;
              break;
            }
          }
        }

        if (foundStart !== -1) {
          for (let i = foundStart + 2; i < buffer.length - 1; i++) {
            if (buffer[i] === 0xff && buffer[i + 1] === 0xd9) {
              finished = true;
              clearTimeout(timer);
              const jpegFrame = buffer.subarray(foundStart, i + 2);
              req.destroy();
              return resolve(jpegFrame);
            }
          }
        }
      });

      res.on('error', (err) => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

const workingUrlCache = new Map();

async function fetchCameraFrame(rawInput) {
  let url = String(rawInput).trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `http://${url}`;
  }

  const parsed = new URL(url);
  const host = parsed.hostname;
  const port = parsed.port;
  const isDefaultPort = !port || (parsed.protocol === 'http:' && port === '80') || (parsed.protocol === 'https:' && port === '443');
  const baseHost = isDefaultPort ? host : `${host}:${port}`;
  const path = parsed.pathname || '/';

  // Fast-path: Check cached working URL first to avoid candidate discovery delay!
  const cached = workingUrlCache.get(baseHost);
  if (cached) {
    try {
      const buffer = await fetchSingleFrame(cached, 2000);
      if (buffer && buffer.length > 20 && buffer[0] === 0xff && buffer[1] === 0xd8) {
        return { buffer, workingUrl: cached };
      }
    } catch {
      workingUrlCache.delete(baseHost);
    }
  }

  const candidates = [];
  if (path !== '/' && path !== '') {
    candidates.push(url);
  }

  // Common IP webcam & camera snapshot/stream endpoints (prefer lightweight snapshots first)
  candidates.push(`http://${baseHost}/shot.jpg`);
  candidates.push(`http://${baseHost}/snapshot.jpg`);
  candidates.push(`http://${baseHost}/video`);
  candidates.push(`http://${baseHost}/mjpeg`);
  candidates.push(`http://${baseHost}/videofeed`);
  if (!candidates.includes(url)) {
    candidates.push(url);
  }

  const uniqueCandidates = [...new Set(candidates)];
  let lastError = null;

  for (const candidate of uniqueCandidates) {
    try {
      const buffer = await fetchSingleFrame(candidate, 2000);
      if (buffer && buffer.length > 20 && buffer[0] === 0xff && buffer[1] === 0xd8) {
        workingUrlCache.set(baseHost, candidate);
        return { buffer, workingUrl: candidate };
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`Cannot retrieve camera feed from ${url} (${lastError?.message || 'No valid JPEG frame received'})`);
}

const MIN_FRAME_INTERVAL_MS = Number(process.env.DEVICE_MIN_FRAME_INTERVAL_MS || 400);
const lastFrameAt = new Map(); // bounded by the number of registered devices

const deviceController = {
  register: asyncHandler(async (req, res) => {
    const { device, apiKey } = await deviceService.register(req.body);
    await auditLogRepository.record({ userId: req.user?.id, action: 'DEVICE_REGISTERED', entity: 'Device', entityId: device.id, ipAddress: req.ip });
    return new ApiResponse(201, { device, apiKey }, 'Device registered - store this API key now, it will not be shown again').send(res);
  }),

  list: asyncHandler(async (req, res) => {
    const { search, status, page = 1, limit = 50 } = req.query;
    return new ApiResponse(200, await deviceService.list({ search, status, page, limit }), 'Devices retrieved').send(res);
  }),

  getById: asyncHandler(async (req, res) => {
    const device = await deviceService.getById(req.params.id);
    const stream = device.streaming ? await deviceService.streamStatus(device.id) : null;
    return new ApiResponse(200, { ...device, stream }, 'Device retrieved').send(res);
  }),

  update: asyncHandler(async (req, res) => new ApiResponse(200, await deviceService.update(req.params.id, req.body), 'Device updated').send(res)),
  enable: asyncHandler(async (req, res) => new ApiResponse(200, await deviceService.setStatus(req.params.id, 'ACTIVE'), 'Device enabled').send(res)),
  disable: asyncHandler(async (req, res) => new ApiResponse(200, await deviceService.setStatus(req.params.id, 'INACTIVE'), 'Device disabled').send(res)),

  remove: asyncHandler(async (req, res) => {
    await deviceService.remove(req.params.id);
    return new ApiResponse(200, null, 'Device removed').send(res);
  }),

  rotateKey: asyncHandler(async (req, res) => {
    const { apiKey } = await deviceService.rotateKey(req.params.id);
    await auditLogRepository.record({ userId: req.user.id, action: 'DEVICE_KEY_ROTATED', entity: 'Device', entityId: req.params.id });
    return new ApiResponse(200, { apiKey }, 'New API key generated - update the device firmware').send(res);
  }),

  firmwareConfig: asyncHandler(async (req, res) => {
    const device = await deviceService.getById(req.params.id);
    const host = String(req.query.host || req.hostname || '192.168.1.10').replace(/[^A-Za-z0-9.-]/g, '');
    const port = Number(req.query.port) || Number(process.env.PORT) || 5001;
    const header = [
      '// ===== FaceAttend Pro - AMB82 Mini configuration (config.h) =====',
      '#pragma once',
      '#define WIFI_SSID        "YOUR_WIFI_SSID"',
      '#define WIFI_PASSWORD    "YOUR_WIFI_PASSWORD"',
      `#define SERVER_HOST      "${host}"   // PC running the backend (same Wi-Fi)`,
      `#define SERVER_PORT      ${port}`,
      `#define DEVICE_CODE      "${device.deviceCode}"`,
      '#define DEVICE_API_KEY   "PASTE_THE_API_KEY_SHOWN_AT_REGISTRATION"',
      `#define PUSH_FRAMES       ${device.connectionMode === 'PUSH' ? 1 : 0}`,
      `#define ENABLE_RTSP       ${device.connectionMode === 'RTSP' ? 1 : 0}`,
      '#define FRAME_INTERVAL_MS 1200   // how often a JPEG is pushed',
      '#define HEARTBEAT_MS      60000',
      '',
    ].join('\n');
    res.type('text/plain').send(header);
  }),

  verify: asyncHandler(async (req, res) =>
    new ApiResponse(200, { deviceId: req.device.id, deviceCode: req.device.deviceCode, status: req.device.status, serverTime: new Date().toISOString() }, 'Device credentials verified').send(res)
  ),

  heartbeat: asyncHandler(async (req, res) => {
    const device = await deviceService.heartbeat(req.device, {
      firmwareVersion: req.body?.firmwareVersion || req.header('x-firmware-version'),
      ipAddress: req.body?.ip || req.ip,
    });
    return new ApiResponse(200, { lastActiveAt: device.lastActiveAt, serverTime: new Date().toISOString() }, 'Heartbeat received').send(res);
  }),

  /** On-device recognition result (device already computed faceId). */
  submitAttendance: asyncHandler(async (req, res) => {
    const { faceId, confidenceScore, timestamp, courseId } = req.body;
    const result = await attendanceService.markFromDevice({ device: req.device, faceId, confidenceScore, timestamp, courseId });
    return new ApiResponse(200, result, result.attendance).send(res);
  }),

  /**
   * AMB82 Mini push mode: raw JPEG body (Content-Type: image/jpeg).
   * Server-side buffalo_l recognition -> attendance. Response is kept small
   * so the board can parse it with minimal RAM.
   */
  submitFrame: asyncHandler(async (req, res) => {
    // Per-device throttle: a buggy/compromised board looping without delay
    // would otherwise saturate the face engine for every other camera.
    const now = Date.now();
    const last = lastFrameAt.get(req.device.id) || 0;
    if (now - last < MIN_FRAME_INTERVAL_MS) {
      return res.status(429).json({ ok: false, error: 'Too many frames', retryAfterMs: MIN_FRAME_INTERVAL_MS - (now - last) });
    }
    lastFrameAt.set(req.device.id, now);
    let image = null;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) image = req.body.toString('base64');
    else if (req.body?.image) image = req.body.image;
    if (!image) throw ApiError.badRequest('Send a JPEG body with Content-Type: image/jpeg');

    await deviceService.touchFrame(req.device.id);
    const result = await recognitionService.recognizeImage({
      image,
      autoMark: true,
      device: req.device,
      sessionId: req.query.session || null,
      source: 'DEVICE',
      requireConsistency: process.env.DEVICE_REQUIRE_CONSISTENCY === 'true',
      recordUnknowns: true,
    });
    const marked = result.faces
      .filter((f) => f.attendance && ['MARKED', 'ALREADY_MARKED'].includes(f.attendance.code))
      .map((f) => ({ name: f.attendance.studentName, code: f.attendance.code, status: f.attendance.status }));
    return res.status(200).json({
      ok: true,
      faces: result.faces.length,
      recognized: result.faces.filter((f) => f.matched).length,
      marked,
      led: marked.some((m) => m.code === 'MARKED') ? 'GREEN' : result.faces.some((f) => !f.matched) ? 'RED' : 'OFF',
      ms: result.processTimeMs,
    });
  }),

  startStream: asyncHandler(async (req, res) => {
    const stream = await deviceService.startStream(req.params.id);
    await auditLogRepository.record({ userId: req.user.id, action: 'STREAM_STARTED', entity: 'Device', entityId: req.params.id });
    return new ApiResponse(200, stream, 'Stream started').send(res);
  }),

  stopStream: asyncHandler(async (req, res) => {
    await deviceService.stopStream(req.params.id);
    await auditLogRepository.record({ userId: req.user.id, action: 'STREAM_STOPPED', entity: 'Device', entityId: req.params.id });
    return new ApiResponse(200, { stopped: true }, 'Stream stopped').send(res);
  }),

  streamStatus: asyncHandler(async (req, res) => new ApiResponse(200, await deviceService.streamStatus(req.params.id), 'Stream status').send(res)),

  /** Live annotated MJPEG preview (use as <img src>; auth via ?token=). */
  streamPreview: (req, res) => mlClient.pipe(`/streams/${encodeURIComponent(req.params.id)}/mjpeg`, res),
  streamSnapshot: (req, res) => mlClient.pipe(`/streams/${encodeURIComponent(req.params.id)}/snapshot`, res),

  /** Quick-connect or auto-register IP camera / AMB82 Mini from IP or URL */
  quickConnect: asyncHandler(async (req, res) => {
    let { ip, url, cameraType = 'IP_CAMERA', connectionMode = 'RTSP', deviceName } = req.body;
    if (!ip && !url) throw ApiError.badRequest('Either IP address or stream URL is required');

    let cleanIp = ip ? String(ip).trim().replace(/^https?:\/\//, '').split('/')[0].split(':')[0] : null;

    if (cleanIp && !url) {
      if (cameraType === 'AMB82_MINI') {
        url = connectionMode === 'MJPEG' ? `http://${cleanIp}/mjpeg` : `rtsp://${cleanIp}:554/unicast`;
      } else {
        url = connectionMode === 'MJPEG' ? `http://${cleanIp}:8080/video` : `rtsp://${cleanIp}:554/live/ch0`;
      }
    } else if (url && !cleanIp) {
      const match = url.match(/(?:https?|rtsp):\/\/([^:/]+)/);
      if (match) cleanIp = match[1];
    }

    let device = cleanIp ? await deviceRepository.findByIp(cleanIp) : null;
    if (!device && url) {
      const all = await deviceRepository.findAll({ limit: 100 });
      device = (all.items || []).find((d) => d.streamUrl === url || (cleanIp && d.ipAddress === cleanIp));
    }

    if (!device) {
      const rawCode = (cameraType === 'AMB82_MINI' ? 'AMB82-' : 'CAM-') + (cleanIp ? cleanIp.replace(/[^0-9]/g, '').slice(-6) : Math.floor(1000 + Math.random() * 9000));
      const registered = await deviceService.register({
        deviceName: deviceName || `${cameraType === 'AMB82_MINI' ? 'AMB82 Mini' : 'IP Camera'} (${cleanIp || 'Stream'})`,
        deviceCode: rawCode,
        cameraType,
        connectionMode,
        streamUrl: url,
        ipAddress: cleanIp,
        status: 'ACTIVE',
      });
      device = registered.device;
    }

    let stream = null;
    if (device?.streamUrl) {
      try {
        stream = await deviceService.startStream(device.id);
      } catch {
        // ML stream standby mode
      }
    }

    return new ApiResponse(200, { device, stream, previewUrl: `/api/devices/${device.id}/stream/preview` }, 'Camera connected').send(res);
  }),

  /** Grab frame from IP / snapshot URL and recognize faces */
  streamFrame: asyncHandler(async (req, res) => {
    let { url, ip, port, path, autoMark = true, sessionId, source = 'IP_CAMERA', returnImage = false } = req.body;
    let targetUrl = url ? String(url).trim() : null;
    if (!targetUrl && ip) {
      targetUrl = `http://${String(ip).trim()}:${port || 8080}${path ? (path.startsWith('/') ? path : `/${path}`) : ''}`;
    }
    if (!targetUrl) throw ApiError.badRequest('Target url or ip is required');

    try {
      const { buffer, workingUrl } = await fetchCameraFrame(targetUrl);
      const base64 = buffer.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64}`;

      const result = await recognitionService.recognizeImage({
        image: dataUrl,
        autoMark: !!autoMark,
        sessionId: sessionId || undefined,
        source: source || 'IP_CAMERA',
        requireConsistency: false,
      });

      return res.status(200).json({
        ok: true,
        image: returnImage ? dataUrl : null,
        workingUrl,
        faces: result.faces,
        processTimeMs: result.processTimeMs,
      });
    } catch (err) {
      return res.status(200).json({
        ok: false,
        error: `Camera unreachable: ${err.message}`,
        faces: [],
      });
    }
  }),

  /** Live proxy video stream from IP camera / phone webcam / AMB82 Mini */
  liveFeed: (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url parameter');
    targetUrl = String(targetUrl).trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `http://${targetUrl}`;
    }

    try {
      const parsed = new URL(targetUrl);
      let streamUrl = targetUrl;
      // Auto-detect stream path if root or empty
      if (parsed.pathname === '/' || parsed.pathname === '') {
        const port = parsed.port || '8080';
        streamUrl = port === '80' ? `http://${parsed.hostname}/mjpeg` : `http://${parsed.hostname}:${port}/video`;
      }

      const isHttps = streamUrl.startsWith('https://');
      const client = isHttps ? https : http;

      const proxyReq = client.get(streamUrl, { timeout: 12000 }, (upstream) => {
        // Follow redirect if 301/302
        if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
          proxyReq.destroy();
          const redirect = upstream.headers.location;
          const fullRedirect = redirect.startsWith('http') ? redirect : new URL(redirect, streamUrl).href;
          return res.redirect(fullRedirect);
        }

        // If upstream error or returned HTML webpage, abort so frontend cleanly falls back to snapshot frames
        if (upstream.statusCode >= 400 || (upstream.headers['content-type'] && upstream.headers['content-type'].includes('text/html'))) {
          proxyReq.destroy();
          if (!res.headersSent) {
            return res.status(502).json({ error: 'Upstream returned non-stream content' });
          }
          return;
        }

        const contentType = upstream.headers['content-type'] || 'multipart/x-mixed-replace; boundary=--myboundary';
        res.writeHead(upstream.statusCode || 200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Connection': 'keep-alive',
        });
        if (res.socket) res.socket.setNoDelay(true);
        if (upstream.socket) upstream.socket.setNoDelay(true);
        upstream.pipe(res);
      });

      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.status(502).json({ error: `Cannot reach camera stream: ${err.message}` });
        }
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!res.headersSent) {
          res.status(504).json({ error: 'Camera stream connection timed out' });
        }
      });

      req.on('close', () => {
        proxyReq.destroy();
      });
    } catch (err) {
      if (!res.headersSent) {
        res.status(400).json({ error: `Invalid stream URL: ${err.message}` });
      }
    }
  },

  /** Proxy a single frame / image from IP camera to prevent browser CORS issues */
  proxyFrame: asyncHandler(async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) throw ApiError.badRequest('Missing url parameter');
    try {
      const { buffer } = await fetchCameraFrame(targetUrl);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'no-cache, no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(buffer);
    } catch (err) {
      return res.status(502).json({ error: `Cannot reach camera: ${err.message}` });
    }
  }),
};

module.exports = deviceController;
