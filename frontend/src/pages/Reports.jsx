import { useState } from 'react';
import { FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import { asList, download, errMsg } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { today } from '../lib/format';
import { Field, PageHead, useToast } from '../components/UI';

const TYPES = {
  daily: { label: 'Daily register', desc: 'Every record for one day with status breakdown.', fields: ['date'] },
  weekly: { label: 'Weekly summary', desc: 'Day-by-day counts for the week containing the date.', fields: ['date'] },
  monthly: { label: 'Monthly summary', desc: 'Day-by-day counts for a calendar month.', fields: ['month', 'year'] },
  semester: { label: 'Semester percentages', desc: 'Attendance percentage for every student of a semester.', fields: ['semester', 'section', 'from', 'to'] },
  'attendance-percentage': { label: 'Percentage list', desc: 'Per-student percentage for any range and filter.', fields: ['from', 'to', 'semester', 'section'] },
};

export default function Reports() {
  const toast = useToast();
  const now = new Date();
  const [type, setType] = useState('daily');
  const [p, setP] = useState({ date: today(), month: now.getMonth() + 1, year: now.getFullYear(), semester: '', section: '', from: '', to: '', departmentId: '', courseId: '' });
  const { data: depts } = useFetch('/departments', { limit: 100 });
  const { data: courses } = useFetch('/courses', { limit: 100 });
  const [busy, setBusy] = useState('');
  const set = (k) => (e) => setP((x) => ({ ...x, [k]: e.target.value }));
  const t = TYPES[type];

  const run = async (format) => {
    const params = { format, limit: 200 };
    for (const k of [...t.fields, 'departmentId', 'courseId']) if (p[k] !== '' && p[k] != null) params[k] = p[k];
    if (type === 'semester' && !params.semester) return toast('Semester is required', 'error');
    setBusy(format);
    try { await download(`/reports/${type}`, params); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(''); }
  };

  return (
    <>
      <PageHead title="Reports" subtitle="Export official registers as Excel, PDF or CSV." />
      <div className="split">
        <div className="panel">
          <div className="col" style={{ gap: 10 }}>
            {Object.entries(TYPES).map(([k, v]) => (
              <button key={k} className="feed-item" onClick={() => setType(k)}
                style={{ cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit', ...(type === k ? { borderColor: 'rgba(139,92,246,.6)', background: 'var(--grad-soft)' } : {}) }}>
                <FileText size={20} color={type === k ? '#22d3ee' : '#6b75a1'} />
                <div><b>{v.label}</b><div className="faint" style={{ fontSize: 12.5 }}>{v.desc}</div></div>
              </button>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">{t.label}</div>
          <div className="form-grid">
            {t.fields.includes('date') && <Field label="Date"><input className="input" type="date" value={p.date} onChange={set('date')} /></Field>}
            {t.fields.includes('month') && <Field label="Month"><input className="input" type="number" min={1} max={12} value={p.month} onChange={set('month')} /></Field>}
            {t.fields.includes('year') && <Field label="Year"><input className="input" type="number" min={2000} max={2100} value={p.year} onChange={set('year')} /></Field>}
            {t.fields.includes('semester') && <Field label={type === 'semester' ? 'Semester (required)' : 'Semester'}><input className="input" type="number" min={1} max={12} value={p.semester} onChange={set('semester')} /></Field>}
            {t.fields.includes('section') && <Field label="Section"><input className="input" value={p.section} onChange={set('section')} /></Field>}
            {t.fields.includes('from') && <Field label="From"><input className="input" type="date" value={p.from} onChange={set('from')} /></Field>}
            {t.fields.includes('to') && <Field label="To"><input className="input" type="date" value={p.to} onChange={set('to')} /></Field>}
            <Field label="Department">
              <select className="select" value={p.departmentId} onChange={set('departmentId')}>
                <option value="">All</option>{asList(depts).map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
              </select>
            </Field>
            <Field label="Course">
              <select className="select" value={p.courseId} onChange={set('courseId')}>
                <option value="">All</option>{asList(courses).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
            </Field>
          </div>
          <div className="divider" />
          <div className="row wrap">
            <button className="btn btn-primary" disabled={!!busy} onClick={() => run('xlsx')}><FileSpreadsheet size={16} /> {busy === 'xlsx' ? 'Preparing...' : 'Excel'}</button>
            <button className="btn" disabled={!!busy} onClick={() => run('pdf')}><FileText size={16} /> {busy === 'pdf' ? 'Preparing...' : 'PDF'}</button>
            <button className="btn" disabled={!!busy} onClick={() => run('csv')}><Sheet size={16} /> {busy === 'csv' ? 'Preparing...' : 'CSV'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
