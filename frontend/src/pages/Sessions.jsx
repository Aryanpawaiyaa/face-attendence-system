import { useEffect, useState } from 'react';
import { CalendarClock, Play, Square, Timer, Users } from 'lucide-react';
import { asList, errMsg, get, post } from '../lib/api';
import { useFetch, useLiveEvents } from '../lib/hooks';
import { fmtDateTime, fmtTime, fullName } from '../lib/format';
import { Empty, Field, Kpi, Modal, PageHead, Pager, Progress, StatusBadge, Switch, useToast } from '../components/UI';

function NewSession({ open, onClose, onCreated }) {
  const toast = useToast();
  const { data: courses } = useFetch(open ? '/courses' : null, { limit: 100 });
  const { data: devices } = useFetch(open ? '/devices' : null, { limit: 100 });
  const [f, setF] = useState({ title: '', courseId: '', section: '', room: '', durationMinutes: 60, lateAfterMinutes: 10, autoMarkAbsent: true, deviceIds: [] });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggleDev = (id) => setF((x) => ({ ...x, deviceIds: x.deviceIds.includes(id) ? x.deviceIds.filter((d) => d !== id) : [...x.deviceIds, id] }));
  const start = async () => {
    setBusy(true);
    try {
      const s = await post('/sessions', {
        ...(f.title ? { title: f.title } : {}),
        ...(f.courseId ? { courseId: f.courseId } : {}),
        ...(f.section ? { section: f.section } : {}),
        ...(f.room ? { room: f.room } : {}),
        durationMinutes: Number(f.durationMinutes),
        lateAfterMinutes: Number(f.lateAfterMinutes),
        autoMarkAbsent: f.autoMarkAbsent,
        deviceIds: f.deviceIds,
      });
      toast('Session started', 'success');
      onCreated(s);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Start class session" subtitle="Cameras attached to the session mark attendance into it automatically."
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || (!f.title && !f.courseId)} onClick={start}><Play size={15} /> Start now</button></>}>
      <div className="form-grid">
        <Field label="Course" className="span-2">
          <select className="select" value={f.courseId} onChange={set('courseId')}>
            <option value="">No course (general session)</option>
            {asList(courses).map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
          </select>
        </Field>
        <Field label="Title (optional)"><input className="input" value={f.title} onChange={set('title')} placeholder="e.g. ML lab, batch A" /></Field>
        <Field label="Section"><input className="input" value={f.section} onChange={set('section')} placeholder="A" /></Field>
        <Field label="Duration (min)"><input className="input" type="number" min={5} max={600} value={f.durationMinutes} onChange={set('durationMinutes')} /></Field>
        <Field label="Late after (min)"><input className="input" type="number" min={0} max={180} value={f.lateAfterMinutes} onChange={set('lateAfterMinutes')} /></Field>
        <Field label="Room"><input className="input" value={f.room} onChange={set('room')} /></Field>
        <div className="row" style={{ alignSelf: 'flex-end', height: 42 }}>
          <Switch on={f.autoMarkAbsent} onChange={(v) => setF((x) => ({ ...x, autoMarkAbsent: v }))} />
          <span className="muted" style={{ fontSize: 13 }}>Auto-mark absent on close</span>
        </div>
        <Field label="Cameras for this session" className="span-2">
          <div className="chips">
            {asList(devices).filter((d) => d.status === 'ACTIVE').map((d) => (
              <button type="button" key={d.id} className="chip" onClick={() => toggleDev(d.id)}
                style={f.deviceIds.includes(d.id) ? { borderColor: 'var(--cyan)', color: 'var(--text)', background: 'rgba(34,211,238,.12)' } : {}}>
                {d.deviceName}
              </button>
            ))}
            {!asList(devices).length && <span className="faint" style={{ fontSize: 13 }}>No cameras registered - the browser camera still works from Live Recognition.</span>}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function SessionDetail({ id, onClose, onClosed }) {
  const toast = useToast();
  const [s, setS] = useState(null);
  const load = () => get(`/sessions/${id}`).then(setS).catch((e) => toast(errMsg(e), 'error'));
  useEffect(() => { if (id) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  useLiveEvents({ attendance: (e) => e.sessionId === id && load() });
  const close = async () => {
    if (!window.confirm('Close this session? Students not marked yet will be recorded ABSENT if auto-absent is on.')) return;
    try { setS(await post(`/sessions/${id}/close`)); toast('Session closed', 'success'); onClosed(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const st = s?.stats;
  return (
    <Modal open={!!id} onClose={onClose} wide title={s?.title || 'Session'} subtitle={s ? `${fmtDateTime(s.startAt)} - ends ${fmtTime(s.endAt)} - late after ${s.lateAfterMinutes} min` : ''}
      footer={s?.status === 'ACTIVE' ? <button className="btn btn-danger" onClick={close}><Square size={15} /> Close session</button> : null}>
      {!s ? <div className="empty"><div className="spinner" /></div> : (
        <div className="col" style={{ gap: 18 }}>
          <div className="pair">
            <Kpi label="Expected" value={st.expected} sub="eligible active students" icon={Users} accent="#22d3ee" />
            <Kpi label="Attended" value={st.PRESENT + st.LATE} sub={`${st.LATE} late - ${st.ABSENT} absent`} icon={Timer} accent="#34d399" />
          </div>
          <div>
            <div className="row-between" style={{ fontSize: 13 }}><span className="muted">Attendance</span><b>{st.attendancePercentage}%</b></div>
            <div style={{ marginTop: 8 }}><Progress value={st.attendancePercentage} /></div>
          </div>
          {s.attendance.length === 0 ? <Empty title="No one marked yet" hint="Point an attached camera at the door or use Live Recognition with this session selected." /> : (
            <div className="table-wrap" style={{ maxHeight: 360 }}>
              <table className="table">
                <thead><tr><th>Student</th><th>Roll</th><th>Time</th><th>Status</th><th>Source</th></tr></thead>
                <tbody>{s.attendance.map((r) => (
                  <tr key={r.id}><td>{fullName(r.student)}</td><td className="mono">{r.student?.rollNumber}</td><td>{fmtTime(r.markedAt)}</td><td><StatusBadge status={r.status} /></td><td>{r.source}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Sessions() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, reload } = useFetch('/sessions', { ...(status ? { status } : {}), page, limit: 15 });
  const { data: active, reload: reloadActive } = useFetch('/sessions/active');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  useLiveEvents({ session: () => { reload(); reloadActive(); }, attendance: (e) => e.sessionId && reloadActive() });

  return (
    <>
      <PageHead title="Class sessions" subtitle="Time-boxed attendance windows with automatic late and absent handling.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Play size={16} /> Start session</button>
      </PageHead>

      {active?.length > 0 && (
        <div className="bento" style={{ marginBottom: 18 }}>
          {active.map((s, i) => (
            <button key={s.id} className={`panel tilt ${active.length === 1 ? 'c-12' : i % 3 === 0 ? 'c-7' : 'c-5'}`} style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }} onClick={() => setOpenId(s.id)}>
              <div className="row-between">
                <span className="badge b-green"><span className="dot pulse" />Live</span>
                <span className="faint" style={{ fontSize: 12 }}>ends {fmtTime(s.endAt)}</span>
              </div>
              <h3 style={{ margin: '12px 0 4px' }}>{s.title}</h3>
              <div className="faint" style={{ fontSize: 13 }}>{s.stats.PRESENT + s.stats.LATE} of {s.stats.expected} present - {s.stats.LATE} late</div>
              <div style={{ marginTop: 12 }}><Progress value={s.stats.attendancePercentage} /></div>
            </button>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="row-between" style={{ marginBottom: 14 }}>
          <div className="panel-title" style={{ margin: 0 }}><CalendarClock size={18} /> History</div>
          <div className="segmented">
            {[['', 'All'], ['ACTIVE', 'Active'], ['CLOSED', 'Closed']].map(([v, l]) => (
              <button key={l} className={status === v ? 'on' : ''} onClick={() => { setStatus(v); setPage(1); }}>{l}</button>
            ))}
          </div>
        </div>
        {!asList(data).length ? <Empty title="No sessions yet" hint="Start one to begin taking attendance for a lecture." /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Session</th><th>Teacher</th><th>Started</th><th>Result</th><th>Status</th></tr></thead>
              <tbody>
                {asList(data).map((s) => (
                  <tr key={s.id} onClick={() => setOpenId(s.id)} style={{ cursor: 'pointer' }}>
                    <td><b>{s.title}</b><div className="faint" style={{ fontSize: 12 }}>{s.courseId?.code || 'General'}{s.room ? ` - ${s.room}` : ''}</div></td>
                    <td>{fullName(s.teacherId)}</td>
                    <td>{fmtDateTime(s.startAt)}</td>
                    <td>{s.stats ? `${s.stats.attendancePercentage}% (${s.stats.autoAbsent || 0} auto-absent)` : '-'}</td>
                    <td><span className={`badge ${s.status === 'ACTIVE' ? 'b-green' : 'b-gray'}`}>{s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager pagination={data?.pagination} onPage={setPage} />
      </div>

      <NewSession open={creating} onClose={() => setCreating(false)} onCreated={(s) => { setCreating(false); reload(); reloadActive(); setOpenId(s.id); }} />
      <SessionDetail id={openId} onClose={() => setOpenId(null)} onClosed={() => { reload(); reloadActive(); }} />
    </>
  );
}
