import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  Cpu,
  Globe,
  Laptop,
  Lock,
  Maximize2,
  ScanFace,
  ShieldCheck,
  Unlock,
  Video,
  X,
} from 'lucide-react';
import { authedUrl, errMsg, post } from '../lib/api';
import { drawFaces, useCamera, useFetch } from '../lib/hooks';
import { fmtTime } from '../lib/format';
import { Modal, useToast } from '../components/UI';

/**
 * Normalizes user inputs like:
 * - "http://192.168.29.201:8080/"
 * - "192.168.29.201:8080"
 * - "http://192.168.29.201:8080/video"
 * - "192.168.29.201"
 * into accurate stream and snapshot URLs.
 */
function normalizeKioskUrls(input, mode = 'ip_camera', preset = 'phone') {
  if (!input) return { snapshotUrl: '', streamUrl: '', rawUrl: '' };
  let raw = input.trim();

  if (raw.startsWith('rtsp://') || raw.startsWith('rtsps://')) {
    return { snapshotUrl: raw, streamUrl: raw, rawUrl: raw };
  }

  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    raw = `http://${raw}`;
  }

  try {
    const u = new URL(raw);
    const host = u.hostname;
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    let path = u.pathname || '/';

    if (!path || path === '/') {
      if (mode === 'amb82_mini') {
        return {
          snapshotUrl: `http://${host}:${port}/snapshot.jpg`,
          streamUrl: `http://${host}:${port}/mjpeg`,
          rawUrl: raw,
        };
      }
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

    return { snapshotUrl: raw, streamUrl: raw, rawUrl: raw };
  } catch {
    return { snapshotUrl: raw, streamUrl: raw, rawUrl: raw };
  }
}

/**
 * Self check-in kiosk for a tablet / monitor at the classroom door.
 * Features OS Lockdown (Kiosk Mode) to prevent unauthorized exits,
 * and multi-camera input support (Laptop Camera Default, IP Camera, AMB82 Mini).
 */
export default function Kiosk() {
  const cam = useCamera({ width: 1280, height: 720 });
  const canvasRef = useRef(null);
  const feedImgRef = useRef(null);
  const busy = useRef(false);
  const navigate = useNavigate();
  const toast = useToast();

  const [sessionId, setSessionId] = useState('');
  const { data: sessions } = useFetch('/sessions/active');
  const [welcome, setWelcome] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(new Date());

  // Camera Input Selection: 'amb82_mini' (Default), 'laptop', 'ip_camera'
  const [cameraMode, setCameraMode] = useState('amb82_mini');
  const [cameraIp, setCameraIp] = useState('172.24.16.20');
  const [cameraPreset, setCameraPreset] = useState('phone');
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [liveStreamUrl, setLiveStreamUrl] = useState('');
  const [directStreamUrl, setDirectStreamUrl] = useState('');
  const [streamFrameUrl, setStreamFrameUrl] = useState('');

  // Kiosk OS Lockdown State
  const [isLocked, setIsLocked] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const isDesktop = typeof window !== 'undefined' && Boolean(window.desktopApp?.isElectron);

  useEffect(() => {
    if (cameraMode === 'laptop') {
      cam.start();
      setLiveStreamUrl('');
      setDirectStreamUrl('');
      setStreamFrameUrl('');
    } else {
      cam.stop();
      if (cameraIp) {
        const urls = normalizeKioskUrls(cameraIp, cameraMode, cameraPreset);
        if (urls.streamUrl) {
          setDirectStreamUrl(urls.streamUrl);
          setLiveStreamUrl(urls.streamUrl); // Direct stream first for native zero-lag FPS!
        }
      }
    }
    return cam.stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraMode, cameraIp, cameraPreset]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Check initial kiosk status if running in desktop app
  useEffect(() => {
    if (isDesktop && window.desktopApp?.getKioskStatus) {
      window.desktopApp
        .getKioskStatus()
        .then((res) => {
          if (res?.locked) setIsLocked(true);
        })
        .catch(() => null);
    }
  }, [isDesktop]);

  // Lock down keyboard events when OS Lockdown is active
  useEffect(() => {
    if (!isLocked) return undefined;

    const handleKeyDown = (e) => {
      // Prevent Alt+F4, F11, Escape breakout
      if (e.key === 'Escape' || e.key === 'F11' || (e.altKey && e.key === 'F4')) {
        e.preventDefault();
        setShowUnlockModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked]);

  const tick = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      let res = null;
      let frameW = 800;
      let frameH = 600;
      let isMirrored = false;

      if (cameraMode === 'laptop') {
        const frame = cam.capture(800, 0.8);
        if (!frame) return;
        frameW = frame.width;
        frameH = frame.height;
        isMirrored = true;
        res = await post('/ml/recognize', {
          image: frame.dataUrl,
          autoMark: true,
          sessionId: sessionId || undefined,
          source: 'KIOSK',
        });
      } else {
        if (!cameraIp) return;
        const urls = normalizeKioskUrls(cameraIp, cameraMode, cameraPreset);

        let capturedDataUrl = null;
        // Priority 1: High-Speed Direct Canvas Capture from the running video element!
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
          res = await post('/ml/recognize', {
            image: capturedDataUrl,
            autoMark: true,
            sessionId: sessionId || undefined,
            source: 'KIOSK',
          });
        } else {
          // Priority 2: Fallback to lightweight server snapshot
          res = await post('/devices/stream-frame', {
            url: urls.snapshotUrl || urls.rawUrl || cameraIp,
            autoMark: true,
            sessionId: sessionId || undefined,
            source: 'KIOSK',
            returnImage: false,
          });
          frameW = 640;
          frameH = 480;
          isMirrored = false;
        }
      }

      if (res && res.faces) {
        drawFaces(canvasRef.current, res.faces, frameW, frameH, {
          mirror: isMirrored,
          fit: cameraMode === 'laptop' ? 'cover' : 'contain',
        });
        setError('');
        const hit = res.faces.find((f) => ['MARKED', 'ALREADY_MARKED'].includes(f.attendance?.code));
        if (hit) {
          const w = {
            name: hit.attendance.studentName,
            code: hit.attendance.code,
            status: hit.attendance.status,
            at: new Date(),
          };
          setWelcome(w);
          if (hit.attendance.code === 'MARKED') setRecent((r) => [w, ...r].slice(0, 8));
        }
        const blocked = res.faces.find((f) =>
          ['HOLIDAY', 'INACTIVE_STUDENT', 'SPOOF_SUSPECTED'].includes(f.attendance?.code)
        );
        const challenge = res.faces.find((f) => f.attendance?.livenessChallenge);
        if (blocked) setError(blocked.attendance.message);
        else if (challenge) setError('Liveness check - please turn your head slightly left or right');
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      busy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraMode, cameraIp, cameraPreset, liveStreamUrl, cam.capture, sessionId]);

  useEffect(() => {
    const isReady = cameraMode === 'laptop' ? cam.active : Boolean(cameraIp);
    if (!isReady) return undefined;
    const t = setInterval(tick, 400);
    return () => clearInterval(t);
  }, [cameraMode, cam.active, cameraIp, tick]);

  useEffect(() => {
    if (!welcome) return undefined;
    const t = setTimeout(() => setWelcome(null), 3500);
    return () => clearTimeout(t);
  }, [welcome]);

  // Activate OS Lockdown
  const handleLockdown = async (pin = '1234') => {
    if (isDesktop && window.desktopApp?.lockKiosk) {
      await window.desktopApp.lockKiosk({ pin });
    } else if (document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch (err) {
        // ignore
      }
    }
    setIsLocked(true);
    setShowLockModal(false);
    toast('Kiosk OS Lockdown Activated — Device locked to attendance mode', 'success');
  };

  // Unlock OS Lockdown
  const handleUnlock = async () => {
    const pin = pinInput.trim();
    if (!pin) {
      setPinError('Please enter administrator PIN');
      return;
    }

    if (isDesktop && window.desktopApp?.unlockKiosk) {
      const res = await window.desktopApp.unlockKiosk({ pin });
      if (!res.success) {
        setPinError(res.error || 'Incorrect PIN');
        return;
      }
    } else {
      if (pin !== '123456789' && pin !== '12345678' && pin !== '1234' && pin !== 'admin') {
        setPinError('Incorrect PIN');
        return;
      }
      if (document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch (err) {
          // ignore
        }
      }
    }

    setIsLocked(false);
    setShowUnlockModal(false);
    setPinInput('');
    setPinError('');
    toast('OS Lockdown Released', 'info');
  };

  return (
    <div className="kiosk">
      <div className="stage">
        {cameraMode === 'laptop' ? (
          <>
            <video ref={cam.videoRef} muted playsInline style={{ transform: 'scaleX(-1)' }} />
            {!cam.active && <div className="placeholder">{cam.error || 'Starting laptop camera...'}</div>}
          </>
        ) : (
          <>
            {liveStreamUrl || streamFrameUrl ? (
              <img
                ref={feedImgRef}
                src={liveStreamUrl || streamFrameUrl || ''}
                alt="Camera stream"
                crossOrigin="anonymous"
                onError={() => {
                  if (liveStreamUrl === directStreamUrl && directStreamUrl) {
                    setLiveStreamUrl(authedUrl(`/devices/live-feed?url=${encodeURIComponent(directStreamUrl)}`));
                  } else if (liveStreamUrl) {
                    setLiveStreamUrl('');
                  }
                }}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div className="placeholder">
                <div className="col" style={{ alignItems: 'center' }}>
                  {cameraMode === 'ip_camera' ? <Globe size={46} /> : <Cpu size={46} />}
                  <div style={{ marginTop: 10 }}>
                    {cameraIp ? `Connecting to ${cameraIp}...` : 'Configure Camera IP in settings'}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <canvas ref={canvasRef} className="overlay" />
        <div className="scanline" />
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner bl" />
        <span className="corner br" />

        {isLocked && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 10,
              background: 'rgba(239, 68, 68, 0.25)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              backdropFilter: 'blur(8px)',
              padding: '6px 14px',
              borderRadius: 20,
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Lock size={14} /> OS Lockdown Active
          </div>
        )}
      </div>

      <div className="kiosk-side">
        <div className="row-between">
          {!isLocked ? (
            <div className="row" style={{ gap: 8 }}>
              <Link to="/app" className="btn btn-ghost btn-sm">
                <ArrowLeft size={14} /> Console
              </Link>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowCameraModal(true)}
                title="Change Camera Input Source"
              >
                {cameraMode === 'laptop' ? <Laptop size={14} /> : cameraMode === 'ip_camera' ? <Globe size={14} /> : <Cpu size={14} />}
                {cameraMode === 'laptop' ? 'Laptop Cam' : cameraMode === 'ip_camera' ? 'IP Cam' : 'AMB82'}
              </button>
            </div>
          ) : (
            <button
              className="btn btn-sm btn-ghost"
              style={{ color: '#ef4444' }}
              onClick={() => {
                setPinInput('');
                setPinError('');
                setShowUnlockModal(true);
              }}
            >
              <Unlock size={14} /> Exit Kiosk
            </button>
          )}

          <div className="row" style={{ gap: 8 }}>
            {!isLocked ? (
              <button
                className="btn btn-sm btn-primary"
                style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)' }}
                onClick={() => setShowLockModal(true)}
              >
                <Lock size={14} /> Lock Kiosk OS
              </button>
            ) : (
              <button
                className="btn btn-sm btn-danger"
                onClick={() => {
                  setPinInput('');
                  setPinError('');
                  setShowUnlockModal(true);
                }}
              >
                <Unlock size={14} /> Unlock Device
              </button>
            )}
          </div>
        </div>

        <div className="col" style={{ gap: 4, marginTop: 20 }}>
          <div className="kiosk-clock">
            {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="faint" style={{ fontSize: 13 }}>
            {clock.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        <div className="grow col" style={{ justifyContent: 'center' }}>
          <AnimatePresence mode="wait">
            {welcome ? (
              <motion.div
                key={welcome.name}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="welcome-card"
              >
                <div className="avatar-lg" style={{ margin: '0 auto 16px' }}>
                  {welcome.name[0]}
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 700 }}>Welcome, {welcome.name}!</h2>
                <div className="badge b-green" style={{ display: 'inline-flex', marginTop: 10, fontSize: 13 }}>
                  {welcome.status || 'PRESENT'} - {fmtTime(welcome.at)}
                </div>
              </motion.div>
            ) : (
              <div className="welcome-placeholder">
                <ScanFace size={60} strokeWidth={1.5} color="var(--primary)" />
                <h3 style={{ fontSize: 20, marginTop: 14 }}>Please face the camera</h3>
                <p className="faint" style={{ fontSize: 13, marginTop: 6 }}>
                  {cameraMode === 'laptop'
                    ? 'Position your face inside the frame to check in automatically.'
                    : `Streaming from ${cameraMode === 'ip_camera' ? 'IP Camera' : 'AMB82 Mini'} (${cameraIp || 'Local'}).`}
                </p>
              </div>
            )}
          </AnimatePresence>

          {error && (
            <div className="notice err" style={{ marginTop: 16 }}>
              {error}
            </div>
          )}
        </div>

        <div>
          <div className="faint" style={{ fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Recent Check-ins
          </div>
          <div className="col" style={{ gap: 6 }}>
            {recent.slice(0, 4).map((r, i) => (
              <div key={i} className="feed-item" style={{ padding: '8px 12px', borderRadius: 8 }}>
                <span className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>
                  {r.name[0]}
                </span>
                <div className="grow" style={{ fontSize: 13, fontWeight: 500 }}>
                  {r.name}
                </div>
                <span className="faint" style={{ fontSize: 11 }}>
                  {fmtTime(r.at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Camera Input Modal */}
      {showCameraModal && (
        <Modal onClose={() => setShowCameraModal(false)}>
          <div className="panel modal-card" style={{ maxWidth: 440 }}>
            <div className="row-between">
              <h3 className="row" style={{ gap: 8 }}>
                <Camera size={20} color="var(--primary)" /> Camera Input Source
              </h3>
              <button className="btn btn-ghost icon-btn" onClick={() => setShowCameraModal(false)}>
                <X size={16} />
              </button>
            </div>
            <p className="faint" style={{ fontSize: 13, marginTop: 8 }}>
              Select the camera input to use for the check-in kiosk:
            </p>

            <div className="col" style={{ gap: 12, marginTop: 16 }}>
              <div className="segmented" style={{ width: '100%' }}>
                <button
                  className={cameraMode === 'laptop' ? 'on' : ''}
                  onClick={() => setCameraMode('laptop')}
                  style={{ flex: 1 }}
                >
                  <Laptop size={14} /> Laptop (Default)
                </button>
                <button
                  className={cameraMode === 'ip_camera' ? 'on' : ''}
                  onClick={() => setCameraMode('ip_camera')}
                  style={{ flex: 1 }}
                >
                  <Globe size={14} /> IP Camera
                </button>
                <button
                  className={cameraMode === 'amb82_mini' ? 'on' : ''}
                  onClick={() => setCameraMode('amb82_mini')}
                  style={{ flex: 1 }}
                >
                  <Cpu size={14} /> AMB82
                </button>
              </div>

              {cameraMode !== 'laptop' && (
                <div className="col" style={{ gap: 10, marginTop: 6 }}>
                  <label className="label">
                    {cameraMode === 'ip_camera' ? 'Camera Link or IP Address' : 'AMB82 Mini Board IP'}
                  </label>
                  <input
                    className="input mono"
                    placeholder={
                      cameraMode === 'ip_camera'
                        ? 'e.g. http://192.168.29.201:8080/ or 192.168.29.201:8080'
                        : '192.168.29.201  or  http://192.168.29.201/'
                    }
                    value={cameraIp}
                    onChange={(e) => setCameraIp(e.target.value)}
                  />
                  {cameraMode === 'ip_camera' && (
                    <div className="segmented">
                      <button
                        className={cameraPreset === 'phone' ? 'on' : ''}
                        onClick={() => setCameraPreset('phone')}
                      >
                        Phone Webcam (:8080)
                      </button>
                      <button
                        className={cameraPreset === 'mjpeg' ? 'on' : ''}
                        onClick={() => setCameraPreset('mjpeg')}
                      >
                        HTTP MJPEG
                      </button>
                      <button
                        className={cameraPreset === 'rtsp' ? 'on' : ''}
                        onClick={() => setCameraPreset('rtsp')}
                      >
                        RTSP
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="row-end" style={{ gap: 10, marginTop: 22 }}>
              <button className="btn btn-primary" onClick={() => setShowCameraModal(false)}>
                Save Camera Input
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Lock Kiosk Confirmation Modal */}
      {showLockModal && (
        <Modal onClose={() => setShowLockModal(false)}>
          <div className="panel modal-card" style={{ maxWidth: 440 }}>
            <div className="row-between">
              <h3 className="row" style={{ gap: 8 }}>
                <Lock size={20} color="#38bdf8" /> Engage OS Lockdown
              </h3>
              <button className="btn btn-ghost icon-btn" onClick={() => setShowLockModal(false)}>
                <X size={16} />
              </button>
            </div>
            <p className="faint" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
              Lockdown switches the app into dedicated Fullscreen Kiosk Mode and disables window controls, Alt+F4, and
              Escape breakout keys.
            </p>
            <div
              style={{
                marginTop: 14,
                padding: '12px 14px',
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              <b>Security Notice:</b> The default administrator unlock PIN is <code>1234</code>. Keep this handy
              to release the lock when the session concludes.
            </div>
            <div className="row-end" style={{ gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setShowLockModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => handleLockdown('1234')}>
                <ShieldCheck size={16} /> Engage Lockdown
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Unlock / Exit PIN Modal */}
      {showUnlockModal && (
        <Modal onClose={() => setShowUnlockModal(false)}>
          <div className="panel modal-card" style={{ maxWidth: 400 }}>
            <div className="row-between">
              <h3 className="row" style={{ gap: 8 }}>
                <Unlock size={20} color="#f87171" /> Administrator Unlock
              </h3>
              <button className="btn btn-ghost icon-btn" onClick={() => setShowUnlockModal(false)}>
                <X size={16} />
              </button>
            </div>
            <p className="faint" style={{ fontSize: 13, marginTop: 8 }}>
              Enter the administrator PIN to release OS lockdown and return to the dashboard.
            </p>
            <div style={{ marginTop: 14 }}>
              <label className="label">Admin PIN (Default: 1234)</label>
              <input
                type="password"
                className="input"
                autoFocus
                placeholder="Enter PIN"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUnlock();
                }}
              />
              {pinError && <div style={{ color: '#f87171', fontSize: 12, marginTop: 6 }}>{pinError}</div>}
            </div>
            <div className="row-end" style={{ gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setShowUnlockModal(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleUnlock}>
                Unlock Device
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
