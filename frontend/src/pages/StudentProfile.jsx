import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Flame, ScanFace, Target, TrendingUp } from 'lucide-react';
import { useFetch } from '../lib/hooks';
import { fmtDate, fmtTime, fullName } from '../lib/format';
import { Avatar, Empty, Kpi, PageHead, Progress, Spinner, StatusBadge } from '../components/UI';
import EnrollFace from '../components/EnrollFace';

export default function StudentProfile() {
  const { id } = useParams();
  const { data, loading, error, reload } = useFetch(`/analytics/student/${id}`);
  const { data: student, reload: reloadStudent } = useFetch(`/students/${id}`);
  const [enrolling, setEnrolling] = useState(false);

  if (loading && !data) return <div className="empty"><Spinner size={30} /></div>;
  if (error) return <div className="notice err">{error}</div>;
  const s = data.student;

  return (
    <>
      <Link to="/app/students" className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }}><ArrowLeft size={14} /> Students</Link>
      <PageHead title={fullName(s)} subtitle={`${s.rollNumber} - ${s.department?.name || ''} - Semester ${s.semester}${s.section ? ` ${s.section}` : ''}`}>
        <button className="btn btn-primary" onClick={() => setEnrolling(true)}><ScanFace size={16} /> {student?.faceEnrolled ? 'Re-enrol face' : 'Enrol face'}</button>
      </PageHead>

      <div className="bento">
        <div className="c-4 panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
          <Avatar student={student || s} size="lg" />
          <div>
            <h3>{fullName(s)}</h3>
            <div className="faint" style={{ fontSize: 13 }}>{s.email || 'no email'}</div>
          </div>
          {student?.faceEnrolled ? (
            <span className="badge b-green">Face enrolled - {student.faceSamples} samples</span>
          ) : (
            <span className="badge b-red">Face not enrolled</span>
          )}
          <div className="divider" style={{ width: '100%' }} />
          <div style={{ width: '100%' }}>
            <div className="row-between" style={{ fontSize: 13 }}>
              <span className="muted">Attendance ({data.range.from} to {data.range.to})</span>
              <b style={{ color: data.atRisk ? '#fca5a5' : '#6ee7b7' }}>{data.percentage}%</b>
            </div>
            <div style={{ marginTop: 8 }}>
              <Progress value={data.percentage} color={data.atRisk ? 'linear-gradient(90deg,#f87171,#fbbf24)' : undefined} />
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Minimum required: {data.minRequired}%</div>
          </div>
          {data.atRisk && (
            <div className="notice warn" style={{ textAlign: 'left' }}>
              Below the minimum. Needs to attend the next <b>{data.classesNeededToRecover}</b> working day(s) in a row to recover.
            </div>
          )}
        </div>

        <div className="c-8 col" style={{ gap: 18 }}>
          <div className="pair">
            <Kpi label="Attended days" value={`${data.attendedDays}/${data.workingDays}`} sub="working days in range" icon={CalendarDays} accent="#22d3ee" />
            <Kpi label="Current streak" value={data.streak} sub="consecutive days present" icon={Flame} accent="#f472b6" />
            <Kpi label="Late arrivals" value={data.counts.LATE} sub={`${data.counts.PRESENT} on time`} icon={TrendingUp} accent="#fbbf24" />
            <Kpi label="Absences" value={data.counts.ABSENT} sub={`${data.counts.EXCUSED} excused`} icon={Target} accent="#f87171" />
          </div>
          <div className="panel">
            <div className="panel-title"><CalendarDays size={18} /> Working-day calendar</div>
            <div className="cal">
              {data.calendar.map((d) => (
                <div key={d.date} className={`d ${d.status}`} title={`${d.date} - ${d.status === 'NONE' ? 'no record' : d.status}`}>{d.date.slice(8)}</div>
              ))}
            </div>
            <div className="row wrap" style={{ marginTop: 14, gap: 14, fontSize: 12 }}>
              {[['PRESENT', '#34d399'], ['LATE', '#fbbf24'], ['ABSENT', '#f87171'], ['EXCUSED', '#8b5cf6']].map(([k, c]) => (
                <span key={k} className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{k}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="c-12 panel">
          <div className="panel-title">Recent records</div>
          {data.recent.length === 0 ? <Empty title="No attendance yet" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Time</th><th>Status</th><th>Source</th><th>Course</th><th>Confidence</th><th>Note</th></tr></thead>
                <tbody>
                  {data.recent.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.attendanceDate)}</td>
                      <td>{fmtTime(r.markedAt)}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>{r.source}</td>
                      <td>{r.course?.code || '-'}</td>
                      <td>{r.confidenceScore != null ? `${Math.round(r.confidenceScore * 100)}%` : '-'}</td>
                      <td className="faint" style={{ fontSize: 12 }}>{r.correctionReason || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {student && <EnrollFace open={enrolling} student={student} onClose={() => setEnrolling(false)} onDone={() => { reloadStudent(); reload(); }} />}
    </>
  );
}
