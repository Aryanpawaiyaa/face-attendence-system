import { useEffect, useRef, useState } from 'react';
import { Images, ScanFace, Upload } from 'lucide-react';
import { errMsg, post } from '../lib/api';
import { drawFaces, fileToDataUrl, useFetch } from '../lib/hooks';
import { Empty, PageHead, Switch, useToast } from '../components/UI';

/** Downscales very large phone photos before upload (keeps faces >= ~60 px). */
async function prepare(file) {
  const url = await fileToDataUrl(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const max = 2400;
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL('image/jpeg', 0.9), width: c.width, height: c.height };
}

export default function GroupPhoto() {
  const toast = useToast();
  const [photo, setPhoto] = useState(null);
  const [faces, setFaces] = useState([]);
  const [busy, setBusy] = useState(false);
  const [autoMark, setAutoMark] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const { data: sessions } = useFetch('/sessions/active');
  const canvasRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!photo) return undefined;
    const redraw = () => drawFaces(canvasRef.current, faces, photo.width, photo.height, { fit: 'contain' });
    redraw();
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, [faces, photo]);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setPhoto(await prepare(f));
    setFaces([]);
  };

  const analyse = async () => {
    setBusy(true);
    try {
      const res = await post('/ml/recognize', { image: photo.dataUrl, autoMark, sessionId: sessionId || undefined, source: 'GROUP_PHOTO' });
      setFaces(res.faces);
      const marked = res.faces.filter((x) => x.attendance?.code === 'MARKED').length;
      toast(`${res.faces.length} face(s), ${res.faces.filter((x) => x.matched).length} recognised${autoMark ? `, ${marked} marked` : ''}`, 'success');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const recognised = faces.filter((f) => f.matched);
  return (
    <>
      <PageHead title="Group photo attendance" subtitle="Take one classroom photo - every recognisable face is identified at once." />
      <div className="split">
        <div className="col" style={{ gap: 16 }}>
          <div className="stage" style={{ aspectRatio: photo ? `${photo.width} / ${photo.height}` : '16 / 10' }}>
            {photo ? <img className="feed-img" src={photo.dataUrl} alt="" style={{ objectFit: 'contain' }} /> : (
              <div className="placeholder"><div className="col" style={{ alignItems: 'center' }}><Images size={46} /><div>Upload a well-lit class photo, faces at least ~60 px wide.</div></div></div>
            )}
            <canvas ref={canvasRef} className="overlay" />
            {busy && <div className="scanline" />}
          </div>
          <div className="panel row wrap">
            <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} /> Choose photo</button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
            <div className="row" style={{ gap: 10 }}><Switch on={autoMark} onChange={setAutoMark} /><span className="muted" style={{ fontSize: 14 }}>Mark attendance</span></div>
            <select className="select" style={{ width: 240 }} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">No session</option>{(sessions || []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <button className="btn btn-primary" disabled={!photo || busy} onClick={analyse}><ScanFace size={16} /> {busy ? 'Analysing...' : 'Recognise'}</button>
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">Results - {recognised.length} recognised, {faces.length - recognised.length} unknown</div>
          {!faces.length ? <Empty title="No analysis yet" hint="Group photos use single-shot recognition (no multi-frame confirmation), so review results before marking." /> : (
            <div className="col" style={{ gap: 8 }}>
              {faces.map((f, i) => (
                <div key={i} className="feed-item">
                  <span className="avatar">{f.matched ? (f.name || '?')[0] : '?'}</span>
                  <div className="grow">
                    <b>{f.matched ? f.name || f.faceId : 'Unknown'}</b>
                    <div className="faint" style={{ fontSize: 12 }}>match {Math.round(Math.max(0, f.confidence) * 100)}% - quality {Math.round((f.quality?.score || 0) * 100)}%{f.rejectReason ? ` - ${f.rejectReason.replace(/_/g, ' ')}` : ''}</div>
                  </div>
                  {f.attendance && <span className={`badge ${f.attendance.code === 'MARKED' ? 'b-green' : 'b-blue'}`}>{f.attendance.code.replace('_', ' ')}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
