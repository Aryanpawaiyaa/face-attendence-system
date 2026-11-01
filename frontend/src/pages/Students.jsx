import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileUp, Pencil, Plus, ScanFace, Search, Trash2, UserX } from 'lucide-react';
import { api, asList, del, download, errMsg, post, put } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { fmtDate, fullName } from '../lib/format';
import { Avatar, Empty, Field, Modal, PageHead, Pager, Spinner, useToast } from '../components/UI';
import EnrollFace from '../components/EnrollFace';

const EMPTY = { rollNumber: '', firstName: '', lastName: '', email: '', phone: '', departmentId: '', semester: 1, section: '', year: 1, guardianEmail: '' };

function StudentForm({ open, onClose, student, departments, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm(student ? { ...EMPTY, ...student, departmentId: student.department?.id || student.departmentId?.id || student.departmentId || '' } : { ...EMPTY, departmentId: departments[0]?.id || '' });
  }, [open, student, departments]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        rollNumber: form.rollNumber.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        departmentId: form.departmentId,
        semester: Number(form.semester),
        year: Number(form.year),
        ...(form.email ? { email: form.email.trim() } : {}),
        ...(form.phone ? { phone: form.phone.trim() } : {}),
        ...(form.section ? { section: form.section.trim() } : {}),
        ...(form.guardianEmail ? { guardianEmail: form.guardianEmail.trim() } : {}),
        ...(student && form.status ? { status: form.status } : {}),
      };
      const saved = student ? await put(`/students/${student.id}`, body) : await post('/students', body);
      toast(student ? 'Student updated' : 'Student created - now enrol the face', 'success');
      onSaved(saved, !student);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={student ? 'Edit student' : 'Add student'}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !form.rollNumber || !form.firstName || !form.lastName || !form.departmentId} onClick={save}>{busy ? 'Saving...' : 'Save'}</button></>}>
      <div className="form-grid">
        <Field label="Roll number"><input className="input" value={form.rollNumber} onChange={set('rollNumber')} placeholder="CSE-2026-010" /></Field>
        <Field label="Department">
          <select className="select" value={form.departmentId} onChange={set('departmentId')}>
            <option value="">Select</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.code} - {d.name}</option>)}
          </select>
        </Field>
        <Field label="First name"><input className="input" value={form.firstName} onChange={set('firstName')} /></Field>
        <Field label="Last name"><input className="input" value={form.lastName} onChange={set('lastName')} /></Field>
        <Field label="Semester"><input className="input" type="number" min={1} max={12} value={form.semester} onChange={set('semester')} /></Field>
        <Field label="Year of study"><input className="input" type="number" min={1} max={8} value={form.year} onChange={set('year')} /></Field>
        <Field label="Section"><input className="input" value={form.section || ''} onChange={set('section')} placeholder="A" /></Field>
        <Field label="Phone"><input className="input" value={form.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Email"><input className="input" type="email" value={form.email || ''} onChange={set('email')} /></Field>
        <Field label="Guardian email"><input className="input" type="email" value={form.guardianEmail || ''} onChange={set('guardianEmail')} /></Field>
        {student && (
          <Field label="Status" className="span-2">
            <select className="select" value={form.status || 'ACTIVE'} onChange={set('status')}>
              {['ACTIVE', 'INACTIVE', 'GRADUATED', 'SUSPENDED'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setFile(null); setResult(null); } }, [open]);
  const run = async (dryRun) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/students/import?dryRun=${dryRun}`, fd);
      setResult(data.data);
      if (!dryRun) { toast(`${data.data.created} student(s) imported`, 'success'); onDone(); }
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Import students from CSV" subtitle="Validate first, then import. Existing roll numbers are skipped."
      footer={<><button className="btn" onClick={() => download('/students/import/template', null, 'students-template.csv')}><Download size={15} /> Template</button><button className="btn" disabled={!file || busy} onClick={() => run(true)}>Validate</button><button className="btn btn-primary" disabled={!file || busy} onClick={() => run(false)}>Import</button></>}>
      <input className="input" style={{ paddingTop: 9 }} type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      {result && (
        <div className="col" style={{ marginTop: 16 }}>
          <div className={`notice ${result.failed ? 'warn' : ''}`}>
            {result.dryRun ? 'Validation' : 'Import'}: {result.totalRows} rows, {result.dryRun ? result.totalRows - result.failed : result.created} OK, {result.failed} with problems.
          </div>
          {result.failed > 0 && (
            <div className="table-wrap" style={{ maxHeight: 240 }}>
              <table className="table"><thead><tr><th>Row</th><th>Roll</th><th>Problem</th></tr></thead>
                <tbody>{result.results.filter((r) => !r.ok).map((r) => <tr key={r.row}><td>{r.row}</td><td>{r.rollNumber}</td><td style={{ color: '#fca5a5' }}>{r.error}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Students() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [q, setQ] = useState({ page: 1, limit: 20, search: '', departmentId: '', faceEnrolled: '', status: '' });
  const [search, setSearch] = useState('');
  const params = Object.fromEntries(Object.entries(q).filter(([, v]) => v !== ''));
  const { data, loading, reload } = useFetch('/students', params);
  const { data: depts } = useFetch('/departments', { limit: 100 });
  const departments = asList(depts);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [enrolling, setEnrolling] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ((x) => ({ ...x, search, page: 1 })), 350);
    return () => clearTimeout(t);
  }, [search]);

  const removeFace = async (s) => {
    if (!window.confirm(`Delete the face template of ${fullName(s)}? They will no longer be recognised.`)) return;
    try { await del(`/students/${s.id}/face`); toast('Face template removed', 'success'); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const remove = async (s) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${fullName(s)} (${s.rollNumber})? This will also remove any attendance records and enrolled face biometric data.`)) return;
    try { await del(`/students/${s.id}`); toast('Student deleted', 'success'); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };

  const items = asList(data);
  return (
    <>
      <PageHead title="Students & faces" subtitle="Add students, enrol their faces and track template quality.">
        {isAdmin && <button className="btn" onClick={() => setImportOpen(true)}><FileUp size={16} /> Import CSV</button>}
        <button className="btn btn-primary" disabled={!departments.length} title={departments.length ? '' : 'Create a department first'} onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={16} /> Add student</button>
      </PageHead>

      <div className="panel">
        <div className="row wrap" style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: 13, color: 'var(--text-3)' }} />
            <input className="input" style={{ paddingLeft: 40 }} placeholder="Search name, roll number, email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select" style={{ width: 200 }} value={q.departmentId} onChange={(e) => setQ({ ...q, departmentId: e.target.value, page: 1 })}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
          </select>
          <select className="select" style={{ width: 180 }} value={q.faceEnrolled} onChange={(e) => setQ({ ...q, faceEnrolled: e.target.value, page: 1 })}>
            <option value="">Any face status</option>
            <option value="true">Face enrolled</option>
            <option value="false">Not enrolled</option>
          </select>
          <select className="select" style={{ width: 160 }} value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value, page: 1 })}>
            <option value="">Any status</option>
            {['ACTIVE', 'INACTIVE', 'GRADUATED', 'SUSPENDED'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {!departments.length && <div className="notice warn" style={{ marginBottom: 14 }}>No departments yet - an admin must create one in Settings before students can be added.</div>}
        {loading && !data ? <div className="empty"><Spinner /></div> : items.length === 0 ? (
          <Empty icon={UserX} title="No students match" hint="Add a student or import a CSV." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Student</th><th>Roll</th><th>Dept / Sem</th><th>Face template</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/app/students/${s.id}`} className="row" style={{ gap: 12 }}>
                        <Avatar student={s} />
                        <div><b>{fullName(s)}</b><div className="faint" style={{ fontSize: 12 }}>{s.email || '-'}</div></div>
                      </Link>
                    </td>
                    <td className="mono">{s.rollNumber}</td>
                    <td>{s.department?.code || '-'} / {s.semester}{s.section ? ` ${s.section}` : ''}</td>
                    <td>
                      {s.faceEnrolled ? (
                        <span className={`badge ${s.faceSamples >= 3 ? 'b-green' : 'b-amber'}`}>{s.faceSamples} samples - {Math.round((s.faceQuality || 0) * 100)}%</span>
                      ) : <span className="badge b-red">Not enrolled</span>}
                      {s.faceEnrolledAt && <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>{fmtDate(s.faceEnrolledAt)}</div>}
                    </td>
                    <td><span className={`badge ${s.status === 'ACTIVE' ? 'b-green' : 'b-gray'}`}>{s.status}</span></td>
                    <td>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        <button className="btn btn-sm btn-primary" onClick={() => setEnrolling(s)}><ScanFace size={14} /> {s.faceEnrolled ? 'Re-enrol' : 'Enrol face'}</button>
                        {s.faceEnrolled && <button className="btn btn-sm btn-ghost" title="Delete face template" onClick={() => removeFace(s)}><UserX size={14} /></button>}
                        <button className="btn btn-sm btn-ghost" title="Edit" onClick={() => { setEditing(s); setFormOpen(true); }}><Pencil size={14} /></button>
                        {isAdmin && <button className="btn btn-sm btn-ghost" title="Delete" onClick={() => remove(s)}><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager pagination={data?.pagination} onPage={(page) => setQ({ ...q, page })} />
      </div>

      <StudentForm open={formOpen} onClose={() => setFormOpen(false)} student={editing} departments={departments}
        onSaved={(saved, isNew) => { setFormOpen(false); reload(); if (isNew && saved?.id) setEnrolling(saved); }} />
      <EnrollFace open={!!enrolling} student={enrolling} onClose={() => setEnrolling(null)} onDone={() => reload()} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={reload} />
    </>
  );
}
