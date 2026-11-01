import { useState } from 'react';
import { Check, ShieldAlert, ShieldOff, X } from 'lucide-react';
import { asList, errMsg, get, media, post } from '../lib/api';
import { useFetch, useLiveEvents } from '../lib/hooks';
import { ago, fullName } from '../lib/format';
import { Empty, Field, Modal, PageHead, Pager, Switch, useToast } from '../components/UI';

function ResolveModal({ face, onClose, onDone }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null);
  const [enroll, setEnroll] = useState(true);
  const search = async (v) => {
    setQ(v);
    if (v.trim().length < 2) return setResults([]);
    setResults(asList(await get('/students', { search: v.trim(), limit: 8 }).catch(() => [])));
  };
  const save = async () => {
    try {
      await post(`/unknown-faces/${face.id}/resolve`, { studentId: picked.id, enroll });
      toast(enroll ? 'Assigned and added to the face template' : 'Assigned', 'success');
      onDone();
    } catch (e) { toast(errMsg(e), 'error'); }
  };
  return (
    <Modal open={!!face} onClose={onClose} title="Who is this?" subtitle="Assign the capture to a student. Adding it to their template improves future recognition."
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!picked} onClick={save}>Assign</button></>}>
      {face && (
        <div className="split" style={{ gridTemplateColumns: '200px 1fr' }}>
          <img src={media(face.snapshotUrl)} alt="" style={{ width: '100%', borderRadius: 14, aspectRatio: '1', objectFit: 'cover', background: '#02040b' }} />
          <div className="col">
            <Field label="Search student"><input className="input" value={q} onChange={(e) => search(e.target.value)} placeholder="Name or roll number" autoFocus /></Field>
            <div className="col" style={{ gap: 6 }}>
              {results.map((s) => (
                <button key={s.id} className="feed-item" style={{ cursor: 'pointer', color: 'inherit', font: 'inherit', textAlign: 'left', ...(picked?.id === s.id ? { borderColor: 'var(--cyan)' } : {}) }} onClick={() => setPicked(s)}>
                  <b className="grow">{fullName(s)}</b><span className="faint mono" style={{ fontSize: 12 }}>{s.rollNumber}</span>
                </button>
              ))}
            </div>
            <div className="row"><Switch on={enroll} onChange={setEnroll} /><span className="muted" style={{ fontSize: 13 }}>Add this photo to the student's face template</span></div>
            {face.spoofSuspected && <div className="notice err">The liveness model flagged this capture as a possible photo/screen attack. Do not add it to a template.</div>}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function UnknownFaces() {
  const toast = useToast();
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const { data, reload } = useFetch('/unknown-faces', { status, page, limit: 24 });
  const [resolving, setResolving] = useState(null);
  useLiveEvents({ unknown_face: () => status === 'PENDING' && reload() });
  const dismiss = async (f) => { await post(`/unknown-faces/${f.id}/dismiss`).catch((e) => toast(errMsg(e), 'error')); reload(); };

  return (
    <>
      <PageHead title="Unknown faces" subtitle="Faces the cameras saw but could not match. Review, assign or dismiss.">
        <div className="segmented">{['PENDING', 'RESOLVED', 'DISMISSED'].map((s) => <button key={s} className={status === s ? 'on' : ''} onClick={() => { setStatus(s); setPage(1); }}>{s[0] + s.slice(1).toLowerCase()}</button>)}</div>
      </PageHead>
      {!asList(data).length ? (
        <div className="panel"><Empty icon={ShieldAlert} title={status === 'PENDING' ? 'Queue is clear' : 'Nothing here'} hint="Unknown faces with good image quality are captured automatically by cameras and live recognition." /></div>
      ) : (
        <div className="gallery">
          {asList(data).map((f) => (
            <div key={f.id} className="panel face-card">
              {f.snapshotUrl ? <img src={media(f.snapshotUrl)} alt="" loading="lazy" /> : <div className="empty" style={{ aspectRatio: '1' }}><ShieldOff /></div>}
              <div className="row-between" style={{ marginTop: 10 }}>
                <span className="faint" style={{ fontSize: 12 }}>{ago(f.createdAt)}</span>
                {f.spoofSuspected ? <span className="badge b-red">spoof?</span> : f.bestScore != null && <span className="badge b-gray">best {Math.round(Math.max(0, f.bestScore) * 100)}%</span>}
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{f.deviceId?.deviceName || 'Browser camera'}</div>
              {f.resolvedStudentId && <div style={{ fontSize: 13, marginTop: 6 }}>Assigned to <b>{fullName(f.resolvedStudentId)}</b></div>}
              {status === 'PENDING' && (
                <div className="row" style={{ marginTop: 10, gap: 6 }}>
                  <button className="btn btn-sm btn-primary grow" onClick={() => setResolving(f)}><Check size={14} /> Assign</button>
                  <button className="btn btn-sm" onClick={() => dismiss(f)} title="Dismiss"><X size={14} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Pager pagination={data?.pagination} onPage={setPage} />
      <ResolveModal face={resolving} onClose={() => setResolving(null)} onDone={() => { setResolving(null); reload(); }} />
    </>
  );
}
