import { useEffect, useState } from 'react';
import { CalendarOff, ClockAlert, ClipboardCheck, Download, Pencil, Search, UserPlus } from 'lucide-react';
import { asList, download, errMsg, get, patch, post } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { fmtDate, fmtTime, fullName, today } from '../lib/format';
import { Avatar, Empty, Field, Modal, PageHead, Pager, Spinner, StatusBadge, useToast } from '../components/UI';

const STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'HOLIDAY'];

function CorrectModal({ record, onClose, onDone }) {
  const toast = useToast();
  const [status, setStatus] = useState('PRESENT');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (record) {
      setStatus(record.status);
      setReason('');
    }
  }, [record]);
  const save = async () => {
    try {
      await patch(`/attendance/${record.id}`, { status, reason });
      toast('Record updated successfully', 'success');
      onDone();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <Modal
      open={!!record}
      onClose={onClose}
      title="Attendance Exception & Correction"
      subtitle={record ? `${fullName(record.student)} - ${fmtDate(record.attendanceDate)}` : ''}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={reason.trim().length < 3} onClick={save}>Save</button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="segmented">
          {STATUSES.map((s) => (
            <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
              {s}
            </button>
          ))}
        </div>
        <Field label="Correction Reason / Exception Note (required for audit log)">
          <textarea
            className="input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Approved medical leave, official institute holiday, or late transit approval"
          />
        </Field>
      </div>
    </Modal>
  );
}

function DeclareHolidayModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('Official Academic Holiday');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    try {
      const res = await post('/attendance/holiday', { attendanceDate: date, reason });
      toast(res.message || 'Holiday declared', 'success');
      onDone();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Declare Institute Holiday"
      subtitle="Marks attendance records for this date as Holiday for all active students."
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading} onClick={save}>
            {loading ? 'Marking...' : 'Confirm Holiday'}
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <Field label="Holiday Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Holiday Name / Description">
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. National Festival, Founders Day, Election Day"
          />
        </Field>
      </div>
    </Modal>
  );
}

function AutoLateModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [cutoffTime, setCutoffTime] = useState('09:15');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    try {
      const res = await post('/attendance/auto-late', { attendanceDate: date, cutoffTime });
      toast(res.message || 'Late entries evaluated', 'success');
      onDone();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Auto-Evaluate Late Entries"
      subtitle="Scans check-ins for the selected date and automatically flags students arriving after cutoff as Late."
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading} onClick={save}>
            {loading ? 'Evaluating...' : 'Apply Late Cutoff'}
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <Field label="Attendance Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Late Arrival Cutoff Time (HH:mm)">
          <input className="input" type="time" value={cutoffTime} onChange={(e) => setCutoffTime(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function RollCall({ open, onClose, onDone }) {
  const toast = useToast();
  const { data: depts } = useFetch(open ? '/departments' : null, { limit: 100 });
  const [dept, setDept] = useState('');
  const [semester, setSemester] = useState('');
  const [date, setDate] = useState(today());
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !dept) return;
    setLoading(true);
    get('/students', { departmentId: dept, status: 'ACTIVE', limit: 500, ...(semester ? { semester } : {}) })
      .then((d) => {
        setStudents(asList(d));
        setMarks(Object.fromEntries(asList(d).map((s) => [s.id, 'PRESENT'])));
      })
      .finally(() => setLoading(false));
  }, [open, dept, semester]);

  const save = async () => {
    try {
      const r = await post('/attendance/bulk', {
        attendanceDate: date,
        entries: students.map((s) => ({ studentId: s.id, status: marks[s.id] })),
      });
      toast(`${r.succeeded}/${r.total} saved`, 'success');
      onDone();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Manual roll-call"
      subtitle="Manual attendance roll-call with full status support (Present, Late, Holiday, Absent, Excused)."
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!students.length} onClick={save}>
            Save {students.length} record(s)
          </button>
        </>
      }
    >
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <select className="select" style={{ width: 220 }} value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">Department</option>
          {asList(depts).map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} - {d.name}
            </option>
          ))}
        </select>
        <input
          className="input"
          style={{ width: 120 }}
          type="number"
          min={1}
          max={12}
          placeholder="Semester"
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
        />
        <input className="input" style={{ width: 170 }} type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        {students.length > 0 && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm" onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.id, 'PRESENT'])))}>
              All Present
            </button>
            <button className="btn btn-sm" onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.id, 'HOLIDAY'])))}>
              All Holiday
            </button>
          </div>
        )}
      </div>
      {loading ? (
        <div className="empty"><Spinner /></div>
      ) : !students.length ? (
        <Empty title="Choose a department to load students" />
      ) : (
        <div className="table-wrap" style={{ maxHeight: 420 }}>
          <table className="table">
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="row">
                      <Avatar student={s} />
                      <div>
                        <b>{fullName(s)}</b>
                        <div className="faint mono" style={{ fontSize: 12 }}>{s.rollNumber}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="segmented">
                      {STATUSES.map((st) => (
                        <button
                          key={st}
                          className={marks[s.id] === st ? 'on' : ''}
                          onClick={() => setMarks((m) => ({ ...m, [s.id]: st }))}
                        >
                          {st === 'HOLIDAY' ? 'Holiday' : st[0] + st.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default function Attendance() {
  const [f, setF] = useState({ date: today(), status: '', source: '', search: '', page: 1 });
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setF((x) => ({ ...x, search, page: 1 })), 350);
    return () => clearTimeout(t);
  }, [search]);
  const params = Object.fromEntries(Object.entries({ ...f, limit: 25 }).filter(([, v]) => v !== ''));
  const { data, loading, reload } = useFetch('/attendance', params);
  const [editing, setEditing] = useState(null);
  const [rollcall, setRollcall] = useState(false);
  const [holidayModal, setHolidayModal] = useState(false);
  const [autoLateModal, setAutoLateModal] = useState(false);

  return (
    <>
      <PageHead
        title="Attendance Records & Exceptions"
        subtitle="Manage daily check-ins, roll-calls, and exception rules (Late, Holiday, Medical Leave)."
      >
        <button className="btn" onClick={() => download('/attendance', { ...params, format: 'csv', page: undefined, limit: undefined })}>
          <Download size={16} /> Export CSV
        </button>
        <button className="btn" onClick={() => setHolidayModal(true)}>
          <CalendarOff size={16} /> Mark Holiday
        </button>
        <button className="btn" onClick={() => setAutoLateModal(true)}>
          <ClockAlert size={16} /> Auto-Mark Late
        </button>
        <button className="btn btn-primary" onClick={() => setRollcall(true)}>
          <UserPlus size={16} /> Roll-call
        </button>
      </PageHead>
      <div className="panel">
        <div className="row wrap" style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: 13, color: 'var(--text-3)' }} />
            <input
              className="input"
              style={{ paddingLeft: 40 }}
              placeholder="Student name or roll number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <input className="input" style={{ width: 170 }} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, page: 1 })} />
          <select className="select" style={{ width: 150 }} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="select" style={{ width: 160 }} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value, page: 1 })}>
            <option value="">Any source</option>
            {['DEVICE', 'STREAM', 'WEB_CAMERA', 'KIOSK', 'GROUP_PHOTO', 'MANUAL'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          {f.date && (
            <button className="btn btn-ghost btn-sm" onClick={() => setF({ ...f, date: '', page: 1 })}>
              All dates
            </button>
          )}
        </div>
        {loading && !data ? (
          <div className="empty"><Spinner /></div>
        ) : !asList(data).length ? (
          <Empty icon={ClipboardCheck} title="No records found" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Camera / Course</th>
                  <th>Match</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {asList(data).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="row">
                        <Avatar student={r.student} />
                        <div>
                          <b>{fullName(r.student)}</b>
                          <div className="faint mono" style={{ fontSize: 12 }}>{r.student?.rollNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td>{fmtDate(r.attendanceDate)}</td>
                    <td>{fmtTime(r.markedAt)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                      {r.previousStatus && (
                        <div className="faint" style={{ fontSize: 11, marginTop: 4 }} title={r.correctionReason}>
                          was {r.previousStatus}
                        </div>
                      )}
                    </td>
                    <td>{r.source}</td>
                    <td>
                      {r.device?.deviceCode || '-'}{r.course ? ` / ${r.course.code}` : ''}
                    </td>
                    <td>{r.confidenceScore != null ? `${Math.round(r.confidenceScore * 100)}%` : '-'}</td>
                    <td>
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditing(r)} title="Change Status / Exception">
                        <Pencil size={14} /> Exception
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager pagination={data?.pagination} onPage={(page) => setF({ ...f, page })} />
      </div>

      <CorrectModal record={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />
      <DeclareHolidayModal open={holidayModal} onClose={() => setHolidayModal(false)} onDone={() => { setHolidayModal(false); reload(); }} />
      <AutoLateModal open={autoLateModal} onClose={() => setAutoLateModal(false)} onDone={() => { setAutoLateModal(false); reload(); }} />
      <RollCall open={rollcall} onClose={() => setRollcall(false)} onDone={() => { setRollcall(false); reload(); }} />
    </>
  );
}
