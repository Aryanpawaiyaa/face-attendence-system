import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, ImagePlus, Trash2, Upload, Wand2, X } from 'lucide-react';
import { errMsg, post } from '../lib/api';
import { fileToDataUrl, useCamera } from '../lib/hooks';
import { fullName } from '../lib/format';
import { Modal, Progress, Switch, useToast } from './UI';

const ISSUE_TEXT = {
  no_face: 'No face found - look at the camera',
  multiple_faces: 'Only one person in frame please',
  blurry: 'Hold still - image is blurry',
  too_dark: 'Too dark - add light in front of the face',
  overexposed: 'Too bright - avoid backlight',
  turn_face_to_camera: 'Face the camera directly',
  face_too_small: 'Move closer to the camera',
  low_detection_confidence: 'Face not clear enough',
};
const PROMPTS = ['Look straight', 'Turn slightly left', 'Turn slightly right', 'Chin slightly up', 'Chin slightly down', 'Look straight', 'Natural smile', 'Look straight'];

export default function EnrollFace({ student, open, onClose, onDone }) {
  const toast = useToast();
  const cam = useCamera({ width: 1280, height: 720 });
  const [shots, setShots] = useState([]);
  const [quality, setQuality] = useState(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(-1);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const checking = useRef(false);

  useEffect(() => {
    if (open) {
      setShots([]);
      setResult(null);
      setReplace(!!student?.faceEnrolled);
      setTimeout(cam.start, 150);
    } else cam.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // live quality guidance (~1 per second)
  useEffect(() => {
    if (!open || !cam.active) return undefined;
    const t = setInterval(async () => {
      if (checking.current) return;
      const f = cam.capture(640, 0.7);
      if (!f) return;
      checking.current = true;
      try {
        setQuality(await post('/students/face/quality', { image: f.dataUrl }));
      } catch {
        setQuality(null);
      } finally {
        checking.current = false;
      }
    }, 900);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cam.active, cam.capture]);

  const snap = () => {
    const f = cam.capture(1280, 0.92);
    if (f) setShots((s) => [...s, { src: f.dataUrl, fromCam: true }].slice(0, 20));
  };

  // guided burst: 8 shots, waits for good quality between each
  useEffect(() => {
    if (auto < 0) return undefined;
    if (auto >= PROMPTS.length) {
      setAuto(-1);
      toast('Burst complete - review and save', 'success');
      return undefined;
    }
    const t = setTimeout(() => {
      if (quality?.ok) {
        snap();
        setAuto((a) => a + 1);
      } else setAuto((a) => a); // wait for a good frame
    }, 1100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, quality]);

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 20);
    const urls = await Promise.all(files.map(fileToDataUrl));
    setShots((s) => [...s, ...urls.map((src) => ({ src, fromCam: false }))].slice(0, 20));
    e.target.value = '';
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await post(`/students/${student.id}/face`, { images: shots.map((s) => s.src), replace });
      setResult(res);
      toast(`${res.accepted} sample(s) enrolled for ${fullName(student)}`, 'success');
      onDone?.(res);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const ok = quality?.ok;
  return (
    <Modal
      open={open}
      onClose={() => { setAuto(-1); onClose(); }}
      wide
      title={`Enrol face - ${fullName(student)}`}
      subtitle={`${student?.rollNumber || ''} - capture 5 to 10 clear photos with small head turns`}
      footer={
        <>
          <div className="row grow" style={{ gap: 10 }}>
            <Switch on={replace} onChange={setReplace} />
            <span className="muted" style={{ fontSize: 13 }}>Replace existing face template</span>
          </div>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-primary" disabled={!shots.length || busy} onClick={save}>
            <CheckCircle2 size={16} /> {busy ? 'Enrolling...' : `Save ${shots.length} photo(s)`}
          </button>
        </>
      }
    >
      <div className="split" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <div className="col">
          <div className="stage" style={{ aspectRatio: '4 / 3' }}>
            <video ref={cam.videoRef} muted playsInline style={{ transform: 'scaleX(-1)' }} />
            <div className={`guide-ring ${ok ? 'ok' : ''}`} />
            {auto >= 0 && (
              <div style={{ position: 'absolute', top: 16, left: 0, right: 0, textAlign: 'center' }}>
                <span className="badge b-violet" style={{ fontSize: 14, height: 32, padding: '0 16px' }}>
                  {auto + 1}/{PROMPTS.length} - {PROMPTS[auto]}
                </span>
              </div>
            )}
            <div className="hud">
              <span className={`badge ${ok ? 'b-green' : 'b-amber'}`}>
                {!cam.active ? cam.error || 'Starting camera...' : ok ? 'Great - hold still' : ISSUE_TEXT[quality?.issues?.[0]] || 'Position your face in the oval'}
              </span>
              {quality?.score != null && <span className="badge b-gray">quality {Math.round(quality.score * 100)}%</span>}
            </div>
          </div>
          <div className="row wrap">
            <button className="btn btn-primary" disabled={!cam.active} onClick={snap}><Camera size={16} /> Capture</button>
            <button className="btn" disabled={!cam.active || auto >= 0} onClick={() => setAuto(0)}><Wand2 size={16} /> Guided burst (8)</button>
            <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} /> Upload photos</button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onFiles} />
          </div>
        </div>
        <div className="col">
          <div className="row-between">
            <b>Samples ({shots.length}/20)</b>
            {shots.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setShots([])}><Trash2 size={14} /> Clear</button>}
          </div>
          <Progress value={(Math.min(shots.length, 8) / 8) * 100} />
          {shots.length === 0 ? (
            <div className="empty" style={{ border: '1px dashed var(--border-hi)', borderRadius: 14 }}>
              <ImagePlus size={30} />
              <div style={{ fontSize: 13 }}>Captured photos appear here</div>
            </div>
          ) : (
            <div className="shots">
              {shots.map((s, i) => {
                const r = result?.results?.find((x) => x.index === i);
                return (
                  <div key={i} className={`shot ${r ? (r.accepted ? 'good' : 'bad') : ''}`} title={r && !r.accepted ? r.reason : ''}>
                    {/* camera preview is mirrored, so mirror its thumbnails too; uploads stay as-is */}
                    <img src={s.src} alt="" style={{ transform: s.fromCam ? 'scaleX(-1)' : 'none' }} />
                    <button onClick={() => setShots((x) => x.filter((_, j) => j !== i))} aria-label="Remove"><X size={12} /></button>
                  </div>
                );
              })}
            </div>
          )}
          {result && (
            <div className={`notice ${result.enough ? '' : 'warn'}`}>
              Accepted {result.accepted}, rejected {result.rejected}. Template now has {result.totalSamples} samples (avg quality {Math.round((result.averageQuality || 0) * 100)}%).
              {!result.enough && ' Add a few more for best accuracy.'}
              {result.results?.some((r) => !r.accepted) && (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  Rejected: {result.results.filter((r) => !r.accepted).map((r) => `#${r.index + 1} ${String(r.reason).replace(/_/g, ' ')}`).join(', ')}
                </div>
              )}
            </div>
          )}
          <div className="notice" style={{ fontSize: 12.5 }}>
            Tip: even, front lighting and no sunglasses or masks. The engine rejects blurry, dark, side-on and duplicate faces automatically.
          </div>
        </div>
      </div>
    </Modal>
  );
}
