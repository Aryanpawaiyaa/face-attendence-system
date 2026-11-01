import { Suspense, lazy, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CalendarClock, Clock3, Cpu, ScanFace, TrendingUp, UserCheck, Users, Zap } from 'lucide-react';
import { get } from '../lib/api';
import { useFetch, useLiveEvents } from '../lib/hooks';
import { ago, chartTooltip, fmtTime, fullName } from '../lib/format';
import { Avatar, Empty, Kpi, PageHead, Progress, StatusBadge, TiltCard } from '../components/UI';
import { useAuth } from '../lib/auth';

const RateOrb = lazy(() => import('../components/Scene3D').then((m) => ({ default: m.RateOrb })));


export default function Dashboard() {
  const { user } = useAuth();
  const { data, reload } = useFetch('/dashboard/overview', { trendDays: 14 });
  const { data: risk } = useFetch('/analytics/at-risk', { limit: 6 });
  const [feed, setFeed] = useState([]);
  const [fresh, setFresh] = useState(null);

  useEffect(() => {
    get('/attendance/today', { limit: 15 }).then((d) =>
      setFeed(
        (d.items || []).map((r) => ({
          id: r.id,
          studentName: fullName(r.student),
          rollNumber: r.student?.rollNumber,
          photoUrl: r.student?.photoUrl,
          status: r.status,
          markedAt: r.markedAt,
          device: r.device,
          source: r.source,
        }))
      )
    ).catch(() => null);
  }, []);

  useLiveEvents({
    attendance: (e) => {
      if (!e.studentName) return;
      setFeed((f) => [e, ...f.filter((x) => x.id !== e.id)].slice(0, 30));
      setFresh(e.id);
      reload();
    },
  });

  const t = data?.today;
  const totals = data?.totals;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHead title={`${greet}, ${user?.firstName || ''}`} subtitle="Real-time attendance across every camera and classroom.">
        <Link to="/app/sessions" className="btn"><CalendarClock size={16} /> New session</Link>
        <Link to="/app/live" className="btn btn-primary"><ScanFace size={16} /> Live recognition</Link>
      </PageHead>

      <div className="bento">
        <TiltCard className="c-5" style={{ minHeight: 330, padding: 0, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 20, left: 22, zIndex: 2 }}>
            <div className="panel-title" style={{ marginBottom: 2 }}><Zap size={18} /> Today</div>
            <div className="faint" style={{ fontSize: 13 }}>{t ? `${t.presentStudents} of ${t.totalActiveStudents} students in` : 'Loading...'}</div>
          </div>
          <div style={{ height: 330 }}>
            <Suspense fallback={null}>
              <RateOrb value={t?.attendanceRate || 0} />
            </Suspense>
          </div>
        </TiltCard>

        <div className="c-7 panel">
          <div className="pair">
            <Kpi label="Present" value={t?.counts?.PRESENT ?? '-'} sub="on time today" icon={UserCheck} accent="#34d399" />
            <Kpi label="Late" value={t?.counts?.LATE ?? '-'} sub="after cut-off" icon={Clock3} accent="#fbbf24" />
            <Kpi label="Not yet marked" value={t?.notYetMarked ?? '-'} sub={`${t?.counts?.ABSENT ?? 0} absent - ${t?.counts?.EXCUSED ?? 0} excused`} icon={AlertTriangle} accent="#f87171" />
            <Kpi label="Faces enrolled" value={totals ? `${totals.enrolledFaces}/${totals.students}` : '-'} sub={`${totals?.activeSessions ?? 0} live session(s)`} icon={Users} accent="#22d3ee" />
          </div>
          <div className="divider" />
          <div className="row-between" style={{ fontSize: 13 }}>
            <span className="muted">Face enrolment coverage</span>
            <b>{totals?.students ? Math.round((totals.enrolledFaces / totals.students) * 100) : 0}%</b>
          </div>
          <div style={{ marginTop: 8 }}>
            <Progress value={totals?.students ? (totals.enrolledFaces / totals.students) * 100 : 0} />
          </div>
        </div>

        <div className="c-8 panel">
          <div className="panel-title"><TrendingUp size={18} /> 14-day trend</div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer>
              <AreaChart data={data?.trend || []}>
                <defs>
                  <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,255,.08)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="#6b75a1" fontSize={12} />
                <YAxis stroke="#6b75a1" fontSize={12} allowDecimals={false} />
                <Tooltip {...chartTooltip} />
                <Area type="monotone" dataKey="PRESENT" stroke="#22d3ee" strokeWidth={2.5} fill="url(#gp)" />
                <Area type="monotone" dataKey="LATE" stroke="#fbbf24" strokeWidth={2} fill="url(#gl)" />
                <Area type="monotone" dataKey="ABSENT" stroke="#f87171" strokeWidth={1.5} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="c-4 panel">
          <div className="panel-title row-between">
            <span className="row"><ScanFace size={18} /> Live feed</span>
            <span className="badge b-blue"><span className="dot pulse" />SSE</span>
          </div>
          {feed.length === 0 ? (
            <Empty title="No check-ins yet today" hint="Start a session or open Live Recognition." />
          ) : (
            <div className="feed">
              {feed.map((e) => (
                <div key={e.id} className={`feed-item ${fresh === e.id ? 'new' : ''}`}>
                  <Avatar student={{ firstName: e.studentName, photoUrl: e.photoUrl }} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.studentName}</div>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {fmtTime(e.markedAt)} - {e.device?.deviceCode || e.source || 'web'}
                    </div>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="c-7 panel">
          <div className="panel-title"><Users size={18} /> Department attendance (30 days)</div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={data?.departmentWiseAttendance || []}>
                <CartesianGrid stroke="rgba(148,163,255,.08)" vertical={false} />
                <XAxis dataKey="code" stroke="#6b75a1" fontSize={12} />
                <YAxis stroke="#6b75a1" fontSize={12} domain={[0, 100]} unit="%" />
                <Tooltip {...chartTooltip} />
                <defs>
                  <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#22d3ee" />
                  </linearGradient>
                </defs>
                <Bar dataKey="attendancePercentage" fill="url(#gb)" radius={[10, 10, 4, 4]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="c-5 panel">
          <div className="panel-title row-between">
            <span className="row"><AlertTriangle size={18} /> At-risk students</span>
            <Link to="/app/analytics" className="btn btn-sm btn-ghost">View all</Link>
          </div>
          {!risk?.items?.length ? (
            <Empty title="Everyone is above the minimum" hint={`Threshold ${risk?.threshold ?? 75}%`} />
          ) : (
            <div className="col" style={{ gap: 12 }}>
              {risk.items.slice(0, 6).map((r) => (
                <Link key={r.student.id} to={`/app/students/${r.student.id}`} className="row" style={{ gap: 12 }}>
                  <Avatar student={r.student} />
                  <div className="grow">
                    <div className="row-between" style={{ fontSize: 14 }}>
                      <b>{fullName(r.student)}</b>
                      <span style={{ color: '#fca5a5', fontWeight: 700 }}>{r.percentage}%</span>
                    </div>
                    <div style={{ marginTop: 6 }}><Progress value={r.percentage} color="linear-gradient(90deg,#f87171,#fbbf24)" /></div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="c-12 panel">
          <div className="panel-title"><Cpu size={18} /> Camera health</div>
          {!data?.deviceHealth?.devices?.length ? (
            <Empty title="No cameras registered" action={<Link className="btn btn-primary btn-sm" to="/app/devices">Add AMB82 Mini</Link>} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Camera</th><th>Type</th><th>Mode</th><th>Location</th><th>Recognitions</th><th>Last seen</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {data.deviceHealth.devices.map((d) => (
                    <tr key={d.id}>
                      <td><b>{d.deviceName}</b><div className="faint mono" style={{ fontSize: 12 }}>{d.deviceCode}</div></td>
                      <td>{d.cameraType?.replace('_', ' ')}</td>
                      <td>{d.connectionMode}{d.streaming ? ' (streaming)' : ''}</td>
                      <td>{[d.building, d.room].filter(Boolean).join(' / ') || '-'}</td>
                      <td>{d.recognitions || 0}</td>
                      <td>{ago(d.lastActiveAt)}</td>
                      <td>
                        {d.status !== 'ACTIVE' ? <span className="badge b-gray">{d.status}</span> : d.isStale ? <span className="badge b-red"><span className="dot" />Offline</span> : <span className="badge b-green"><span className="dot pulse" />Online</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
