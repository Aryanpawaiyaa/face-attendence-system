import { useEffect, useState } from 'react';
import { BookOpen, Building2, CalendarOff, Cpu, GraduationCap, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { asList, del, errMsg, get, post, put } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { fmtDate } from '../lib/format';
import { Empty, Field, Modal, PageHead, Switch, useToast } from '../components/UI';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TABS = [['policy', 'Attendance policy', ShieldCheck], ['engine', 'Face engine', Cpu], ['org', 'Departments & courses', Building2], ['teachers', 'Teachers', GraduationCap], ['holidays', 'Holidays', CalendarOff]];

function Policy({ isAdmin }) {
  const toast = useToast();
  const { data, reload } = useFetch('/settings');
  const [s, setS] = useState(null);
  useEffect(() => { if (data) setS(data); }, [data]);
  if (!s) return null;
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const save = async () => {
    try {
      const { institutionName, lateCutoff, recognitionThreshold, minAttendancePercent, workingDays, blockOnHolidays, requireLiveness, saveSnapshots, unknownFaceAlerts, deviceOfflineMinutes } = s;
      await put('/settings', { institutionName, lateCutoff, recognitionThreshold: Number(recognitionThreshold), minAttendancePercent: Number(minAttendancePercent), workingDays, blockOnHolidays, requireLiveness, saveSnapshots, unknownFaceAlerts, deviceOfflineMinutes: Number(deviceOfflineMinutes) });
      toast('Settings saved', 'success');
      reload();
    } catch (e) { toast(errMsg(e), 'error'); }
  };
  const toggles = [
    ['blockOnHolidays', 'Block daily attendance on holidays and non-working days'],
    ['requireLiveness', 'Require liveness (anti-spoof model if installed, otherwise head-movement check)'],
    ['saveSnapshots', 'Save a face snapshot as evidence with each recognition'],
    ['unknownFaceAlerts', 'Live alerts for unknown faces'],
  ];
  return (
    <div className="panel">
      <div className="form-grid">
        <Field label="Institution name"><input className="input" disabled={!isAdmin} value={s.institutionName} onChange={(e) => set('institutionName', e.target.value)} /></Field>
        <Field label="Timezone (from server APP_TIMEZONE)"><input className="input" disabled value={s.timezone} /></Field>
        <Field label="Late after (local time, no session)"><input className="input" type="time" disabled={!isAdmin} value={s.lateCutoff} onChange={(e) => set('lateCutoff', e.target.value)} /></Field>
        <Field label="Minimum attendance %"><input className="input" type="number" min={1} max={100} disabled={!isAdmin} value={s.minAttendancePercent} onChange={(e) => set('minAttendancePercent', e.target.value)} /></Field>
        <Field label={`Match threshold: ${Number(s.recognitionThreshold).toFixed(2)} (higher = stricter)`} className="span-2">
          <input type="range" min={0.3} max={0.7} step={0.01} disabled={!isAdmin} value={s.recognitionThreshold} onChange={(e) => set('recognitionThreshold', e.target.value)} />
          <span className="faint" style={{ fontSize: 12 }}>0.40-0.50 recommended for buffalo_l. Raise it if strangers get matched, lower it if enrolled students are missed.</span>
        </Field>
        <Field label="Camera offline after (minutes)"><input className="input" type="number" min={1} disabled={!isAdmin} value={s.deviceOfflineMinutes} onChange={(e) => set('deviceOfflineMinutes', e.target.value)} /></Field>
        <Field label="Working days">
          <div className="segmented">
            {DAYS.map((d, i) => (
              <button key={d} disabled={!isAdmin} className={s.workingDays.includes(i) ? 'on' : ''} onClick={() => set('workingDays', s.workingDays.includes(i) ? s.workingDays.filter((x) => x !== i) : [...s.workingDays, i].sort())}>{d}</button>
            ))}
          </div>
        </Field>
        <div className="span-2 col" style={{ gap: 12, marginTop: 6 }}>
          {toggles.map(([k, l]) => (
            <div key={k} className="row"><Switch disabled={!isAdmin} on={!!s[k]} onChange={(v) => set(k, v)} /><span className="muted" style={{ fontSize: 14 }}>{l}</span></div>
          ))}
        </div>
      </div>
      {isAdmin && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}><button className="btn btn-primary" onClick={save}><Save size={16} /> Save policy</button></div>}
    </div>
  );
}

function Engine({ isAdmin }) {
  const toast = useToast();
  const { data, reload } = useFetch('/ml/status');
  const [busy, setBusy] = useState('');
  const run = async (path, label) => {
    setBusy(path);
    try { await post(path); toast(label, 'success'); reload(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(''); }
  };
  if (!data) return null;
  if (!data.online) return <div className="panel"><div className="notice err">Face engine offline: {data.message}. Start it with <span className="kbd">python -m src.ml_service</span> or let the backend auto-start it (ML_AUTOSTART=true).</div></div>;
  return (
    <div className="panel col" style={{ gap: 16 }}>
      <div className="pair">
        <div className="kpi"><div className="label">Model</div><div className="value" style={{ fontSize: 24 }}>{data.model}</div><div className="sub">{data.engine}</div></div>
        <div className="kpi"><div className="label">Enrolled identities</div><div className="value" style={{ fontSize: 24 }}>{data.enrolledCount}</div><div className="sub">{(data.providers || []).join(', ')}</div></div>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className={`badge ${data.livenessEnabled ? 'b-green' : 'b-amber'}`}>Anti-spoof model {data.livenessEnabled ? 'loaded' : 'not installed'}</span>
        <span className="badge b-gray">threshold {data.matchThreshold} - margin {data.matchMargin}</span>
        <span className="badge b-gray">{data.streams?.length || 0} stream worker(s)</span>
      </div>
      {data.galleryNeedsRebuild && <div className="notice warn">The face gallery was built with a different model. Press "Rebuild gallery" to re-embed all stored enrolment photos with {data.model}.</div>}
      {isAdmin && (
        <div className="row wrap">
          <button className="btn btn-primary" disabled={!!busy} onClick={() => run('/ml/rebuild', 'Gallery rebuilt')}><RefreshCw size={16} /> {busy === '/ml/rebuild' ? 'Rebuilding...' : 'Rebuild gallery'}</button>
          <button className="btn" disabled={!!busy} onClick={() => run('/students/face/sync', 'Enrolment flags synced')}>Sync enrolment flags</button>
          <button className="btn" disabled={!!busy} onClick={() => run('/ml/reload', 'Gallery reloaded')}>Reload</button>
        </div>
      )}
      <div className="notice">To change the model set <span className="kbd">FACE_MODEL</span> (buffalo_l / antelopev2 / buffalo_s) in the root <span className="kbd">.env</span>, restart, then press Rebuild gallery.</div>
    </div>
  );
}

function Org({ isAdmin }) {
  const toast = useToast();
  const { data: depts, reload: rd } = useFetch('/departments', { limit: 100 });
  const { data: courses, reload: rc } = useFetch('/courses', { limit: 100 });
  const { data: teachers } = useFetch('/teachers', { limit: 100 });
  const [d, setD] = useState({ name: '', code: '' });
  const [c, setC] = useState({ name: '', code: '', semester: 1, departmentId: '', facultyId: '' });
  const addDept = async () => { try { await post('/departments', d); setD({ name: '', code: '' }); rd(); toast('Department added', 'success'); } catch (e) { toast(errMsg(e), 'error'); } };
  const addCourse = async () => {
    try { await post('/courses', { ...c, semester: Number(c.semester), ...(c.facultyId ? {} : { facultyId: undefined }) }); setC({ ...c, name: '', code: '' }); rc(); toast('Course added', 'success'); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const rm = async (url, reload) => { if (!window.confirm('Delete?')) return; try { await del(url); reload(); } catch (e) { toast(errMsg(e), 'error'); } };
  return (
    <div className="split" style={{ gridTemplateColumns: '1fr 1.3fr' }}>
      <div className="panel">
        <div className="panel-title"><Building2 size={18} /> Departments</div>
        {isAdmin && <div className="row" style={{ marginBottom: 14 }}><input className="input" style={{ width: 100 }} placeholder="CSE" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} /><input className="input grow" placeholder="Computer Science" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /><button className="btn btn-primary" disabled={!d.code || !d.name} onClick={addDept}>Add</button></div>}
        {!asList(depts).length ? <Empty title="No departments" /> : asList(depts).map((x) => (
          <div key={x.id} className="feed-item" style={{ marginBottom: 8 }}><b style={{ width: 70 }}>{x.code}</b><span className="grow">{x.name}</span>{isAdmin && <button className="btn btn-sm btn-ghost" onClick={() => rm(`/departments/${x.id}`, rd)}><Trash2 size={14} /></button>}</div>
        ))}
      </div>
      <div className="panel">
        <div className="panel-title"><BookOpen size={18} /> Courses</div>
        {isAdmin && (
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <input className="input" placeholder="Code (CS601)" value={c.code} onChange={(e) => setC({ ...c, code: e.target.value })} />
            <input className="input" placeholder="Name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
            <select className="select" value={c.departmentId} onChange={(e) => setC({ ...c, departmentId: e.target.value })}><option value="">Department</option>{asList(depts).map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</select>
            <input className="input" type="number" min={1} max={12} value={c.semester} onChange={(e) => setC({ ...c, semester: e.target.value })} />
            <select className="select" value={c.facultyId} onChange={(e) => setC({ ...c, facultyId: e.target.value })}><option value="">Faculty (optional)</option>{asList(teachers).map((t) => <option key={t.id} value={t.userId}>{t.user?.firstName} {t.user?.lastName}</option>)}</select>
            <button className="btn btn-primary" disabled={!c.code || !c.name || !c.departmentId} onClick={addCourse}>Add course</button>
          </div>
        )}
        {!asList(courses).length ? <Empty title="No courses" /> : asList(courses).map((x) => (
          <div key={x.id} className="feed-item" style={{ marginBottom: 8 }}><b style={{ width: 80 }}>{x.code}</b><span className="grow">{x.name} <span className="faint">- sem {x.semester}</span></span>{isAdmin && <button className="btn btn-sm btn-ghost" onClick={() => rm(`/courses/${x.id}`, rc)}><Trash2 size={14} /></button>}</div>
        ))}
      </div>
    </div>
  );
}

function Teachers({ isAdmin }) {
  const toast = useToast();
  const { data, reload } = useFetch('/teachers', { limit: 100 });
  const { data: depts } = useFetch('/departments', { limit: 100 });
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', employeeId: '', departmentId: '', designation: '' });
  const [created, setCreated] = useState(null);
  const add = async () => {
    try {
      const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
      const res = await post('/teachers', body);
      setCreated({ email: f.email, password: res.temporaryPassword });
      setF({ firstName: '', lastName: '', email: '', employeeId: '', departmentId: '', designation: '' });
      reload();
    } catch (e) { toast(errMsg(e), 'error'); }
  };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="panel">
      {isAdmin && (
        <div className="form-grid" style={{ marginBottom: 18 }}>
          <input className="input" placeholder="First name" value={f.firstName} onChange={set('firstName')} />
          <input className="input" placeholder="Last name" value={f.lastName} onChange={set('lastName')} />
          <input className="input" placeholder="Email (login)" type="email" value={f.email} onChange={set('email')} />
          <input className="input" placeholder="Employee ID" value={f.employeeId} onChange={set('employeeId')} />
          <select className="select" value={f.departmentId} onChange={set('departmentId')}><option value="">Department</option>{asList(depts).map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}</select>
          <input className="input" placeholder="Designation" value={f.designation} onChange={set('designation')} />
          <button className="btn btn-primary span-2" disabled={!f.firstName || !f.lastName || !f.email || !f.employeeId} onClick={add}>Create teacher account</button>
        </div>
      )}
      {!asList(data).length ? <Empty title="No teachers" /> : (
        <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>Email</th><th>Employee</th><th>Department</th></tr></thead><tbody>
          {asList(data).map((t) => <tr key={t.id}><td><b>{t.user?.firstName} {t.user?.lastName}</b><div className="faint" style={{ fontSize: 12 }}>{t.designation}</div></td><td>{t.user?.email}</td><td className="mono">{t.employeeId}</td><td>{t.department?.code || '-'}</td></tr>)}
        </tbody></table></div>
      )}
      <Modal open={!!created} onClose={() => setCreated(null)} title="Teacher account created" subtitle="Share these credentials securely. The password is shown only once.">
        {created && <div className="col"><div className="code">Email: {created.email}{'\n'}Temporary password: {created.password}</div><div className="notice warn">Ask the teacher to change the password after the first login.</div></div>}
      </Modal>
    </div>
  );
}

function Holidays({ isAdmin }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [f, setF] = useState({ date: '', name: '', type: 'INSTITUTE' });
  const load = () => get('/settings/holidays').then((d) => setItems(asList(d))).catch(() => null);
  useEffect(() => { load(); }, []);
  const add = async () => { try { await post('/settings/holidays', f); setF({ date: '', name: '', type: 'INSTITUTE' }); load(); } catch (e) { toast(errMsg(e), 'error'); } };
  return (
    <div className="panel">
      {isAdmin && (
        <div className="row wrap" style={{ marginBottom: 16 }}>
          <input className="input" style={{ width: 170 }} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <input className="input grow" placeholder="Holiday name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select className="select" style={{ width: 150 }} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['PUBLIC', 'INSTITUTE', 'EXAM', 'OTHER'].map((t) => <option key={t}>{t}</option>)}</select>
          <button className="btn btn-primary" disabled={!f.date || !f.name} onClick={add}>Add holiday</button>
        </div>
      )}
      {!items.length ? <Empty title="No holidays configured" hint="Holidays are excluded from attendance percentages." /> : items.map((h) => (
        <div key={h._id} className="feed-item" style={{ marginBottom: 8 }}><b style={{ width: 130 }}>{fmtDate(h.date)}</b><span className="grow">{h.name}</span><span className="badge b-gray">{h.type}</span>{isAdmin && <button className="btn btn-sm btn-ghost" onClick={async () => { await del(`/settings/holidays/${h._id}`).catch((e) => toast(errMsg(e), 'error')); load(); }}><Trash2 size={14} /></button>}</div>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('policy');
  const Comp = { policy: Policy, engine: Engine, org: Org, teachers: Teachers, holidays: Holidays }[tab];
  return (
    <>
      <PageHead title="Settings" subtitle={isAdmin ? 'Institution policy, recognition engine and organisation data.' : 'Read-only - only admins can change settings.'}>
        <div className="segmented" style={{ flexWrap: 'wrap' }}>
          {TABS.map(([k, l, I]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><I size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{l}</button>)}
        </div>
      </PageHead>
      <Comp isAdmin={isAdmin} />
    </>
  );
}
