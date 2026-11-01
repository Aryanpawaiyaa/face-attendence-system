import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authedUrl, errMsg, get } from './api';

/** Fetch helper with loading / error / reload. */
export function useFetch(url, params, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const key = JSON.stringify(params || {});
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      setData(await get(url, params));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key, ...deps]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, error, reload: load, setData };
}

/* ------------------------------------------------------------------
 * ONE shared EventSource for the whole app (previously every component
 * opened its own connection). Ref-counted: opens with the first
 * subscriber, closes with the last. On error it refreshes the access
 * token (EventSource cannot send headers, so an expired ?token= would
 * otherwise reconnect-loop forever with 401s).
 * ------------------------------------------------------------------ */
const LIVE_TYPES = ['attendance', 'unknown_face', 'device', 'session', 'enrollment'];
const live = { es: null, subs: new Set(), statusSubs: new Set(), connected: false, retry: null, attempts: 0 };

function setLiveStatus(v) {
  live.connected = v;
  live.statusSubs.forEach((fn) => fn(v));
}

function openLive() {
  if (live.es || !live.subs.size) return;
  const es = new EventSource(authedUrl('/live/events'));
  live.es = es;
  es.onopen = () => {
    live.attempts = 0;
    setLiveStatus(true);
  };
  es.onerror = async () => {
    setLiveStatus(false);
    es.close();
    live.es = null;
    live.attempts += 1;
    // Any authenticated call triggers the axios refresh interceptor
    await get('/auth/me').catch(() => null);
    const delay = Math.min(30000, 2000 * 2 ** Math.min(live.attempts, 4));
    live.retry = setTimeout(openLive, delay);
  };
  LIVE_TYPES.forEach((type) =>
    es.addEventListener(type, (e) => {
      let data;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      live.subs.forEach((ref) => ref.current?.[type]?.(data));
    })
  );
}

function closeLiveIfIdle() {
  if (live.subs.size) return;
  clearTimeout(live.retry);
  live.es?.close();
  live.es = null;
  setLiveStatus(false);
}

/** Subscribe to server-sent live events. Returns connection state. */
export function useLiveEvents(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  const [connected, setConnected] = useState(live.connected);
  useEffect(() => {
    live.subs.add(ref);
    live.statusSubs.add(setConnected);
    openLive();
    return () => {
      live.subs.delete(ref);
      live.statusSubs.delete(setConnected);
      closeLiveIfIdle();
    };
  }, []);
  return connected;
}

/** Webcam access + frame capture as base64 JPEG. */
export function useCamera({ width = 1280, height = 720, facingMode = 'user' } = {}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    try {
      stop();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId }, width, height } : { width, height, facingMode },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => null);
      }
      setActive(true);
      setError(null);
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'videoinput'));
    } catch (e) {
      setError(e.name === 'NotAllowedError' ? 'Camera permission denied' : e.message || 'Camera unavailable');
      setActive(false);
    }
  }, [deviceId, width, height, facingMode, stop]);

  useEffect(() => stop, [stop]);

  const capture = useCallback((maxW = 960, quality = 0.85) => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const scale = Math.min(1, maxW / v.videoWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', quality), width: c.width, height: c.height };
  }, []);

  // Memoised so consumers can safely put it in effect dependency lists
  return useMemo(
    () => ({ videoRef, start, stop, capture, active, error, devices, deviceId, setDeviceId }),
    [start, stop, capture, active, error, devices, deviceId]
  );
}

/** Converts a File to a compressed base64 data URL (prevents Payload Too Large errors). */
export function fileToDataUrl(file, maxDimension = 1280, quality = 0.88) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => {
      const dataUrl = e.target.result;
      if (!file.type || !file.type.startsWith('image/')) {
        return resolve(dataUrl);
      }
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxDimension && height <= maxDimension) {
          return resolve(dataUrl);
        }
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Draws recognition boxes on an overlay canvas (scaled to the displayed element). */
export function drawFaces(canvas, faces, frameW, frameH, { mirror = false, fit = 'cover' } = {}) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  if (!faces?.length || !frameW) return;
  // map frame pixels to the displayed element (object-fit cover / contain)
  const s = fit === 'contain' ? Math.min(rect.width / frameW, rect.height / frameH) : Math.max(rect.width / frameW, rect.height / frameH);
  const ox = (rect.width - frameW * s) / 2;
  const oy = (rect.height - frameH * s) / 2;
  for (const f of faces) {
    let [x1, y1, x2, y2] = f.bbox;
    if (mirror) [x1, x2] = [frameW - x2, frameW - x1];
    const x = ox + x1 * s;
    const y = oy + y1 * s;
    const w = (x2 - x1) * s;
    const h = (y2 - y1) * s;
    const code = f.attendance?.code;
    const color = f.spoofSuspected ? '#f472b6' : f.matched ? (code === 'MARKED' || code === 'ALREADY_MARKED' ? '#34d399' : '#22d3ee') : '#f87171';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    const r = 12;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const label = f.spoofSuspected
      ? 'Spoof suspected'
      : f.matched
        ? `${f.attendance?.studentName || f.name || f.faceId}  ${Math.round((f.confidence || 0) * 100)}%`
        : `Unknown  ${Math.round(Math.max(f.confidence || 0, 0) * 100)}%`;
    const sub = f.attendance ? f.attendance.code.replace('_', ' ') + (f.attendance.status ? ` - ${f.attendance.status}` : '') : '';
    ctx.font = '600 13px Inter, sans-serif';
    const tw = Math.max(ctx.measureText(label).width, sub ? ctx.measureText(sub).width : 0) + 16;
    const th = sub ? 40 : 24;
    ctx.fillStyle = 'rgba(6,9,20,0.82)';
    ctx.fillRect(x, Math.max(0, y - th - 6), tw, th);
    ctx.fillStyle = color;
    ctx.fillText(label, x + 8, Math.max(16, y - th + 11));
    if (sub) {
      ctx.fillStyle = '#a3acd1';
      ctx.font = '500 11px Inter, sans-serif';
      ctx.fillText(sub, x + 8, Math.max(32, y - 12));
    }
  }
}
