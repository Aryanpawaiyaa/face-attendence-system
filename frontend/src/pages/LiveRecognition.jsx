import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Cpu,
  Gauge,
  Globe,
  Laptop,
  Play,
  Radio,
  RefreshCw,
  ScanFace,
  Square,
  Video,
  Wifi,
} from 'lucide-react';
import { asList, authedUrl, errMsg, get, post } from '../lib/api';
import { drawFaces, useCamera, useFetch } from '../lib/hooks';
import { fmtTime } from '../lib/format';
import { Empty, Field, PageHead, StatusBadge, Switch, useToast } from '../components/UI';

const CODE_BADGE = {
  MARKED: 'b-green',
  ALREADY_MARKED: 'b-blue',
  VERIFYING: 'b-violet',
  HOLIDAY: 'b-amber',
  INACTIVE_STUDENT: 'b-red',
  SPOOF_SUSPECTED: 'b-red',
  UNKNOWN_STUDENT: 'b-red',
};

/**
 * Normalizes user inputs like:
 * - "http://192.168.29.201:8080/"
 * - "192.168.29.201:8080"
 * - "http://192.168.29.201:8080/video"
 * - "192.168.29.201"
 * into accurate stream and snapshot URLs.
 */
function normalizeCameraUrls(input, mode = 'ip_camera', preset = 'phone') {
  if (!input) return { snapshotUrl: '', streamUrl: '', rawUrl: '' };
  let raw = input.trim();

  // If user entered rtsp://...
  if (raw.startsWith('rtsp://') || raw.startsWith('rtsps://')) {
    return { snapshotUrl: raw, streamUrl: raw, rawUrl: raw };
  }

  // Prepend http:// if missing
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    raw = `http://${raw}`;
  }

  try {
    const u = new URL(raw);
    const host = u.hostname;
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    let path = u.pathname || '/';

    // If path is root or empty:
    if (!path || path === '/') {
      if (mode === 'amb82_mini') {
        return {
          snapshotUrl: `http://${host}:${port}/snapshot.jpg`,
          streamUrl: `http://${host}:${port}/mjpeg`,
          rawUrl: raw,
        };
      }
      // IP Camera / Phone Webcam
      if (preset === 'mjpeg') {
        return {
          snapshotUrl: `http://${host}:${port}/video`,
          streamUrl: `http://${host}:${port}/video`,
          rawUrl: raw,
        };
      }
      return {
        snapshotUrl: `http://${host}:${port}/shot.jpg`,
        streamUrl: `http://${host}:${port}/video`,
        rawUrl: raw,
      };
    }

    // Specific endpoints entered by user:
    if (path.endsWith('/video')) {
      return {
        snapshotUrl: `http://${host}:${port}/shot.jpg`,
        streamUrl: raw,
        rawUrl: raw,
      };
    }
    if (path.endsWith('/shot.jpg')) {
      return {
        snapshotUrl: raw,
        streamUrl: `http://${host}:${port}/video`,
        rawUrl: raw,
      };
    }
    if (path.endsWith('/mjpeg')) {
      return {
        snapshotUrl: `http://${host}:${port}/snapshot.jpg`,
        streamUrl: raw,
        rawUrl: raw,
      };
    }
    if (path.endsWith('/snapshot.jpg')) {
      return {
        snapshotUrl: raw,
        streamUrl: `http://${host}:${port}/mjpeg`,
        rawUrl: raw,
      };
    }

    return {
      snapshotUrl: raw,
      streamUrl: raw,
      rawUrl: raw,
    };
  } catch {
    return { snapshotUrl: raw, streamUrl: raw, rawUrl: raw };
  }
}

export default function LiveRecognition() {
  const toast = useToast();
  const cam = useCamera();
  const canvasRef = useRef(null);
  const feedImgRef = useRef(null);
  const busy = useRef(false);
  const lastSpoofToast = useRef(0);

  // Camera Input Selection: 'amb82_mini' (Default), 'laptop', 'ip_camera'
  const [mode, setMode] = useState('amb82_mini');
  const [running, setRunning] = useState(false);
  const [autoMark, setAutoMark] = useState(true);
  const [sessionId, setSessionId] = useState('');
  const [faces, setFaces] = useState([]);
  const [stats, setStats] = useState({ ms: 0, frames: 0 });
  const [log, setLog] = useState([]);

  // IP Camera State
  const [ipInput, setIpInput] = useState('');
  const [ipPreset, setIpPreset] = useState('phone'); // 'phone', 'mjpeg', 'rtsp'
  const [ipDeviceId, setIpDeviceId] = useState('');

  // AMB82 Mini State
  const [amb82Ip, setAmb82Ip] = useState('172.24.16.20');
  const [amb82Mode, setAmb82Mode] = useState('rtsp'); // 'rtsp', 'mjpeg', 'push'
  const [amb82DeviceId, setAmb82DeviceId] = useState('');

  // Stream preview & Error state for IP / AMB82
  const [liveStreamUrl, setLiveStreamUrl] = useState('');
  const [directStreamUrl, setDirectStreamUrl] = useState('');
  const [streamFrameUrl, setStreamFrameUrl] = useState('');
  const [streamError, setStreamError] = useState('');

  const { data: sessions } = useFetch('/sessions/active');
  const { data: devices } = useFetch('/devices', { limit: 100 });
  const allDevices = asList(devices);
  const ipDevices = allDevices.filter(
    (d) => d.cameraType === 'IP_CAMERA' || (d.streamUrl && !d.cameraType?.includes('AMB82'))
  );
  const amb82Devices = allDevices.filter(
    (d) => d.cameraType === 'AMB82_MINI' || d.deviceCode?.startsWith('AMB82')
  );

  const tick = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      let res = null;
      let frameW = 640;
      let frameH = 480;
      let isMirrored = false;

      if (mode === 'laptop') {
        const frame = cam.capture(960, 0.82);
        if (!frame) return;
        frameW = frame.width;
        frameH = frame.height;
        isMirrored = true;
        res = await post('/ml/recognize', {
          image: frame.dataUrl,
          autoMark,
          sessionId: sessionId || undefined,
          source: 'WEB_CAMERA',
        });
      } else {
        // IP Camera or AMB82 Mini frame capture
        const currentInput = mode === 'ip_camera' ? ipInput : amb82Ip;
        if (!currentInput) return;

        const urls = normalizeCameraUrls(
          currentInput,
          mode,
          mode === 'ip_camera' ? ipPreset : amb82Mode
        );

        let capturedDataUrl = null;
        // Priority 1: High-Speed Direct Canvas Capture from the running video element!
        // This avoids making ANY extra network requests to the camera!
        if (feedImgRef.current && (feedImgRef.current.naturalWidth > 0 || feedImgRef.current.width > 0)) {
          try {
            const nw = feedImgRef.current.naturalWidth || feedImgRef.current.width || 640;
            const nh = feedImgRef.current.naturalHeight || feedImgRef.current.height || 480;
            const maxW = 960;
            const scale = Math.min(1, maxW / nw);
            const targetW = Math.round(nw * scale);
            const targetH = Math.round(nh * scale);

            const offscreen = document.createElement('canvas');
            offscreen.width = targetW;
            offscreen.height = targetH;
            const ctx = offscreen.getContext('2d');
            ctx.drawImage(feedImgRef.current, 0, 0, targetW, targetH);
            capturedDataUrl = offscreen.toDataURL('image/jpeg', 0.82);
            frameW = targetW;
            frameH = targetH;
            isMirrored = false;
          } catch {
            capturedDataUrl = null;
          }
        }

        if (capturedDataUrl) {
          // Send captured frame directly to ML engine (exact same zero-lag path as webcam!)
          res = await post('/ml/recognize', {
            image: capturedDataUrl,
            autoMark,
            sessionId: sessionId || undefined,
            source: mode === 'amb82_mini' ? 'AMB82_MINI' : 'IP_CAMERA',
          });
        } else {
          // Priority 2: Fallback to lightweight server-side snapshot fetch
          res = await post('/devices/stream-frame', {
            url: urls.snapshotUrl || urls.rawUrl || currentInput,
            autoMark,
            sessionId: sessionId || undefined,
            source: mode === 'amb82_mini' ? 'AMB82_MINI' : 'IP_CAMERA',
            returnImage: false, // Do not send 1MB base64 back; keep video feed smooth!
          });
          frameW = 640;
          frameH = 480;
          isMirrored = false;
        }

        if (res && res.error) {
          setStreamError(res.error);
        } else {
          setStreamError('');
        }
      }

      if (res && res.faces) {
        setFaces(res.faces);
        setStats((s) => ({ ms: res.processTimeMs || 0, frames: s.frames + 1 }));
        drawFaces(canvasRef.current, res.faces, frameW, frameH, {
          mirror: isMirrored,
          fit: mode === 'laptop' ? 'cover' : 'contain',
        });

        const events = res.faces.filter(
          (f) =>
            f.attendance &&
            ['MARKED', 'ALREADY_MARKED', 'HOLIDAY', 'INACTIVE_STUDENT', 'SPOOF_SUSPECTED'].includes(
              f.attendance.code
            )
        );
        if (events.length) {
          setLog((l) => {
            const next = [...l];
            for (const f of events) {
              const key = `${f.faceId || 'spoof'}-${f.attendance.code}`;
              if (!next.slice(0, 8).some((x) => x.key === key)) {
                next.unshift({
                  key,
                  at: new Date(),
                  name: f.attendance.studentName || 'Photo/Screen Attack',
                  code: f.attendance.code,
                  status: f.attendance.status,
                  conf: f.confidence || 0,
                });
              }
            }
            return next.slice(0, 40);
          });
          events
            .filter((f) => f.attendance.code === 'MARKED')
            .forEach((f) => toast(`${f.attendance.studentName} - ${f.attendance.status}`, 'success'));
          events
            .filter((f) => f.attendance.code === 'SPOOF_SUSPECTED')
            .forEach(() => {
              if (Date.now() - lastSpoofToast.current > 4000) {
                lastSpoofToast.current = Date.now();
                toast('Anti-spoofing alert: Screen or photo attack detected!', 'error');
              }
            });
        }
      }
    } catch (e) {
      if (mode === 'laptop') setRunning(false);
      toast(errMsg(e), 'error');
    } finally {
      busy.current = false;
    }
  }, [mode, cam.capture, autoMark, sessionId, ipInput, ipPreset, amb82Ip, amb82Mode, liveStreamUrl, toast]);

  useEffect(() => {
    if (!running) return undefined;
    const intervalMs = mode === 'laptop' ? 500 : 350;
    const t = setInterval(tick, intervalMs);
    return () => clearInterval(t);
  }, [running, tick, mode]);

  useEffect(() => {
    // When switching camera mode, pause running & release webcam
    setRunning(false);
    setFaces([]);
    setLiveStreamUrl('');
    setDirectStreamUrl('');
    setStreamFrameUrl('');
    setStreamError('');
    if (mode !== 'laptop') {
      cam.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Toggle Laptop Camera recognition
  const toggleLaptopCam = async () => {
    if (running) {
      setRunning(false);
      return;
    }
    if (!cam.active) await cam.start();
    setRunning(true);
  };

  // Toggle IP Camera / AMB82 Stream
  const toggleExternalStream = async () => {
    if (running) {
      setRunning(false);
      setLiveStreamUrl('');
      setDirectStreamUrl('');
      setStreamFrameUrl('');
      return;
    }

    const currentInput = mode === 'ip_camera' ? ipInput : amb82Ip;
    if (!currentInput && mode === 'ip_camera' && !ipDeviceId) {
      toast('Please enter the IP address of your IP camera (e.g. http://192.168.29.201:8080/)', 'error');
      return;
    }
    if (!currentInput && mode === 'amb82_mini' && !amb82DeviceId && amb82Mode !== 'push') {
      toast('Please enter the IP address of your AMB82 Mini board', 'error');
      return;
    }

    const urls = normalizeCameraUrls(
      currentInput,
      mode,
      mode === 'ip_camera' ? ipPreset : amb82Mode
    );

    setStreamError('');
    // Start DIRECT stream first for native 30+ FPS speed (zero-lag!)
    if (urls.streamUrl) {
      setDirectStreamUrl(urls.streamUrl);
      setLiveStreamUrl(urls.streamUrl);
    }
    setRunning(true);
    toast(`Connecting to ${mode === 'ip_camera' ? 'IP Camera' : 'AMB82 Mini'}...`, 'info');
  };

  return (
    <>
      <PageHead
        title="Live recognition"
        subtitle="Recognise students via AMB82 Mini IoT camera (Default), Laptop Camera, or IP Camera."
      >
        <div className="segmented">
          <button
            className={mode === 'amb82_mini' ? 'on' : ''}
            onClick={() => setMode('amb82_mini')}
            title="Connect Realtek AMB82 Mini IoT camera via RTSP, HTTP, or Push"
          >
            <Cpu size={14} /> AMB82 Mini (Default)
          </button>
          <button
            className={mode === 'laptop' ? 'on' : ''}
            onClick={() => setMode('laptop')}
            title="Use built-in laptop camera or plugged-in USB webcam"
          >
            <Laptop size={14} /> Laptop camera
          </button>
          <button
            className={mode === 'ip_camera' ? 'on' : ''}
            onClick={() => setMode('ip_camera')}
            title="Connect an IP camera, phone webcam, or CCTV on Wi-Fi"
          >
            <Globe size={14} /> IP camera
          </button>
        </div>
      </PageHead>

      <div className="split">
        <div className="col" style={{ gap: 16 }}>
          {/* Main Stage View */}
          <div className="stage">
            {mode === 'laptop' ? (
              <>
                <video ref={cam.videoRef} muted playsInline style={{ transform: 'scaleX(-1)' }} />
                <canvas ref={canvasRef} className="overlay" />
                {running && <div className="scanline" />}
                {!cam.active && (
                  <div className="placeholder">
                    <div className="col" style={{ alignItems: 'center' }}>
                      <ScanFace size={46} />
                      <div>{cam.error || 'Laptop camera is idle. Click "Start recognition" below to begin.'}</div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {running ? (
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#000',
                    }}
                  >
                    <img
                      ref={feedImgRef}
                      className="feed-img"
                      src={liveStreamUrl || streamFrameUrl || ''}
                      alt="Live camera feed"
                      crossOrigin="anonymous"
                      onError={() => {
                        // If direct connection fails (e.g. mixed content), fall back to backend proxy!
                        if (liveStreamUrl === directStreamUrl && directStreamUrl) {
                          setLiveStreamUrl(authedUrl(`/devices/live-feed?url=${encodeURIComponent(directStreamUrl)}`));
                        } else if (liveStreamUrl) {
                          setLiveStreamUrl('');
                        }
                      }}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        display: liveStreamUrl || streamFrameUrl ? 'block' : 'none',
                      }}
                    />
                    {!liveStreamUrl && !streamFrameUrl && (
                      <div className="placeholder" style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
                        <div className="col" style={{ alignItems: 'center' }}>
                          <div className="spinner" style={{ width: 32, height: 32, marginBottom: 12 }} />
                          <div style={{ fontWeight: 600 }}>Connecting to camera feed...</div>
                          <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
                            {mode === 'ip_camera' ? (ipInput || 'IP Camera') : (amb82Ip || 'AMB82 Mini')}
                          </div>
                        </div>
                      </div>
                    )}
                    <canvas ref={canvasRef} className="overlay" />
                    <div className="scanline" />
                  </div>
                ) : (
                  <div className="placeholder">
                    <div className="col" style={{ alignItems: 'center', maxWidth: 440, textAlign: 'center' }}>
                      {mode === 'ip_camera' ? <Globe size={46} /> : <Cpu size={46} />}
                      <div style={{ marginTop: 10, fontWeight: 600 }}>
                        {mode === 'ip_camera' ? 'IP Camera / Phone Webcam' : 'AMB82 Mini AI Camera'}
                      </div>
                      <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
                        {mode === 'ip_camera'
                          ? 'Enter camera link (e.g. http://192.168.29.201:8080/ or phone IP) and click Connect & Start.'
                          : amb82Mode === 'push'
                          ? 'AMB82 Mini board uploads frames directly to this PC over Wi-Fi.'
                          : 'Enter the AMB82 Mini board IP address and click Connect & Start.'}
                      </div>
                      {streamError && (
                        <div className="notice err" style={{ marginTop: 12, textAlign: 'left', width: '100%' }}>
                          {streamError}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            <span className="corner tl" />
            <span className="corner tr" />
            <span className="corner bl" />
            <span className="corner br" />

            {/* Stage HUD Status */}
            <div className="hud">
              <span className={`badge ${running ? 'b-green' : 'b-gray'}`}>
                <span className={`dot ${running ? 'pulse' : ''}`} />
                {running ? 'Recognising' : 'Paused'}
              </span>
              <span className="badge b-gray">
                <Gauge size={12} /> {stats.ms} ms - {faces.length} face(s)
              </span>
              {mode !== 'laptop' && (
                <span className={`badge ${running && !streamError ? 'b-blue' : 'b-gray'}`}>
                  {mode === 'ip_camera' ? 'IP Camera' : 'AMB82 Mini'}
                </span>
              )}
            </div>
          </div>

          {/* Controls Panel */}
          <div className="panel">
            {mode === 'laptop' && (
              <div className="row wrap" style={{ gap: 16 }}>
                <button
                  className={`btn ${running ? 'btn-danger' : 'btn-primary'}`}
                  onClick={toggleLaptopCam}
                >
                  {running ? (
                    <>
                      <Square size={16} /> Stop
                    </>
                  ) : (
                    <>
                      <Play size={16} /> Start recognition
                    </>
                  )}
                </button>
                {cam.active && !running && (
                  <button className="btn" onClick={cam.stop}>
                    <CameraOff size={16} /> Release camera
                  </button>
                )}
                {cam.devices.length > 1 && (
                  <select
                    className="select"
                    style={{ width: 220 }}
                    value={cam.deviceId}
                    onChange={(e) => {
                      cam.setDeviceId(e.target.value);
                      setTimeout(cam.start, 50);
                    }}
                  >
                    <option value="">Default laptop camera</option>
                    {cam.devices.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                )}
                <div className="row" style={{ gap: 10 }}>
                  <Switch on={autoMark} onChange={setAutoMark} />
                  <span className="muted" style={{ fontSize: 14 }}>
                    Auto-mark attendance
                  </span>
                </div>
                <select
                  className="select"
                  style={{ width: 260 }}
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                >
                  <option value="">No session (daily attendance)</option>
                  {(sessions || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {mode === 'ip_camera' && (
              <div className="col" style={{ gap: 14 }}>
                <div className="row wrap" style={{ gap: 12 }}>
                  <Field label="Camera IP or Stream URL (from phone or browser)" className="grow">
                    <input
                      className="input mono"
                      value={ipInput}
                      onChange={(e) => setIpInput(e.target.value)}
                      placeholder="e.g. http://192.168.29.201:8080/  or  192.168.29.201:8080"
                    />
                  </Field>
                  <div className="row" style={{ alignSelf: 'flex-end', gap: 8 }}>
                    <button
                      className={`btn ${running ? 'btn-danger' : 'btn-primary'}`}
                      disabled={!ipInput && !ipDeviceId}
                      onClick={toggleExternalStream}
                    >
                      {running ? (
                        <>
                          <Square size={16} /> Disconnect
                        </>
                      ) : (
                        <>
                          <Play size={16} /> Connect & Start
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="row wrap" style={{ gap: 12, alignItems: 'center' }}>
                  <span className="faint" style={{ fontSize: 13 }}>
                    Preset:
                  </span>
                  <div className="segmented">
                    <button
                      className={ipPreset === 'phone' ? 'on' : ''}
                      onClick={() => setIpPreset('phone')}
                      title="Phone IP Webcam app (auto-converts http://ip:8080/ to live feed)"
                    >
                      Phone IP Webcam (:8080)
                    </button>
                    <button
                      className={ipPreset === 'mjpeg' ? 'on' : ''}
                      onClick={() => setIpPreset('mjpeg')}
                      title="HTTP MJPEG Video stream"
                    >
                      HTTP MJPEG (:8080/video)
                    </button>
                    <button
                      className={ipPreset === 'rtsp' ? 'on' : ''}
                      onClick={() => setIpPreset('rtsp')}
                      title="RTSP stream (Port 554)"
                    >
                      RTSP (:554)
                    </button>
                  </div>

                  {ipDevices.length > 0 && (
                    <select
                      className="select"
                      style={{ width: 220 }}
                      value={ipDeviceId}
                      onChange={(e) => {
                        setIpDeviceId(e.target.value);
                        const dev = ipDevices.find((d) => d.id === e.target.value);
                        if (dev) setIpInput(dev.streamUrl || dev.ipAddress || '');
                      }}
                    >
                      <option value="">Or choose registered device...</option>
                      {ipDevices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.deviceName} ({d.ipAddress || d.deviceCode})
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="row" style={{ gap: 10, marginLeft: 'auto' }}>
                    <Switch on={autoMark} onChange={setAutoMark} />
                    <span className="muted" style={{ fontSize: 14 }}>
                      Auto-mark
                    </span>
                  </div>
                </div>

                {streamError && (
                  <div className="notice err" style={{ fontSize: 12 }}>
                    ⚠️ {streamError}
                  </div>
                )}
                <div className="notice" style={{ fontSize: 12 }}>
                  💡 <b>Phone Webcam Tip</b>: Just paste the exact link shown in your phone screen (e.g.{' '}
                  <span className="kbd mono">http://192.168.29.201:8080/</span>) and click <b>Connect & Start</b>. The
                  system will automatically detect the video feed and run AI recognition.
                </div>
              </div>
            )}

            {mode === 'amb82_mini' && (
              <div className="col" style={{ gap: 14 }}>
                <div className="row wrap" style={{ gap: 12 }}>
                  <Field label="AMB82 Mini Board IP" className="grow">
                    <input
                      className="input mono"
                      value={amb82Ip}
                      onChange={(e) => setAmb82Ip(e.target.value)}
                      placeholder="192.168.29.201  or  http://192.168.29.201/"
                    />
                  </Field>
                  <div className="row" style={{ alignSelf: 'flex-end', gap: 8 }}>
                    <button
                      className={`btn ${running ? 'btn-danger' : 'btn-primary'}`}
                      disabled={!amb82Ip && !amb82DeviceId && amb82Mode !== 'push'}
                      onClick={toggleExternalStream}
                    >
                      {running ? (
                        <>
                          <Square size={16} /> Disconnect
                        </>
                      ) : (
                        <>
                          <Play size={16} /> Connect & Start
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="row wrap" style={{ gap: 12, alignItems: 'center' }}>
                  <span className="faint" style={{ fontSize: 13 }}>
                    Mode:
                  </span>
                  <div className="segmented">
                    <button
                      className={amb82Mode === 'mjpeg' ? 'on' : ''}
                      onClick={() => setAmb82Mode('mjpeg')}
                      title="AmebaPro2 HTTP MJPEG stream (http://board-ip/mjpeg)"
                    >
                      HTTP MJPEG (:80/mjpeg)
                    </button>
                    <button
                      className={amb82Mode === 'rtsp' ? 'on' : ''}
                      onClick={() => setAmb82Mode('rtsp')}
                      title="AmebaPro2 RTSP stream (rtsp://board-ip:554/unicast)"
                    >
                      RTSP (:554)
                    </button>
                    <button
                      className={amb82Mode === 'push' ? 'on' : ''}
                      onClick={() => setAmb82Mode('push')}
                      title="AMB82 Mini uploads frames to PC backend via Wi-Fi"
                    >
                      Wi-Fi Push Mode
                    </button>
                  </div>

                  {amb82Devices.length > 0 && (
                    <select
                      className="select"
                      style={{ width: 220 }}
                      value={amb82DeviceId}
                      onChange={(e) => {
                        setAmb82DeviceId(e.target.value);
                        const dev = amb82Devices.find((d) => d.id === e.target.value);
                        if (dev) {
                          setAmb82Ip(dev.ipAddress || dev.streamUrl || '');
                          if (dev.connectionMode === 'PUSH') setAmb82Mode('push');
                          else if (dev.connectionMode === 'MJPEG') setAmb82Mode('mjpeg');
                          else setAmb82Mode('rtsp');
                        }
                      }}
                    >
                      <option value="">Or choose registered board...</option>
                      {amb82Devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.deviceName} ({d.deviceCode})
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="row" style={{ gap: 10, marginLeft: 'auto' }}>
                    <Switch on={autoMark} onChange={setAutoMark} />
                    <span className="muted" style={{ fontSize: 14 }}>
                      Auto-mark
                    </span>
                  </div>
                </div>

                {amb82Mode === 'push' && (
                  <div className="notice" style={{ fontSize: 12 }}>
                    🤖 <b>Push Mode Configuration</b>: AMB82 Mini firmware uploads JPEG frames directly to{' '}
                    <span className="kbd mono">POST /api/devices/frame</span>. Flash the board using the code in{' '}
                    <span className="kbd">firmware/amb82_faceattend</span> with your Wi-Fi credentials.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: In Frame & Session Log */}
        <div className="col" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-title">
              <ScanFace size={18} /> In frame now
            </div>
            {faces.length === 0 ? (
              <Empty title="No faces detected" hint="Face the camera in good light, about 0.5 - 2 m away." />
            ) : (
              <div className="col" style={{ gap: 10 }}>
                {faces.map((f, i) => (
                  <div key={i} className="feed-item">
                    <span className="avatar">{(f.name || '?')[0]}</span>
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>
                        {f.spoofSuspected ? 'Spoof suspected' : f.matched ? f.name || f.faceId : 'Unknown face'}
                      </div>
                      <div className="faint" style={{ fontSize: 12 }}>
                        match {Math.round(Math.max(0, f.confidence) * 100)}% - quality{' '}
                        {Math.round((f.quality?.score || 0) * 100)}%
                        {f.quality?.issues?.length ? ` - ${f.quality.issues.join(', ').replace(/_/g, ' ')}` : ''}
                      </div>
                    </div>
                    {f.attendance && (
                      <span
                        className={`badge ${CODE_BADGE[f.attendance.code] || 'b-gray'}`}
                        title={f.attendance.message}
                      >
                        {f.attendance.livenessChallenge ? 'TURN HEAD' : f.attendance.code.replace('_', ' ')}
                      </span>
                    )}
                    {!f.attendance && f.rejectReason && (
                      <span className="badge b-amber">{f.rejectReason.replace(/_/g, ' ')}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="panel">
            <div className="panel-title">
              <Gauge size={18} /> Session log
            </div>
            {log.length === 0 ? (
              <Empty title="Nothing marked yet" />
            ) : (
              <div className="feed">
                {log.map((l) => (
                  <div key={`${l.key}-${l.at.getTime()}`} className="feed-item">
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{l.name}</div>
                      <div className="faint" style={{ fontSize: 12 }}>
                        {fmtTime(l.at)} - {Math.round(l.conf * 100)}% match
                      </div>
                    </div>
                    {l.status ? (
                      <StatusBadge status={l.status} />
                    ) : (
                      <span className={`badge ${CODE_BADGE[l.code]}`}>{l.code}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
