import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CalendarRange, Clock3, Radar } from 'lucide-react';
import { asList } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { chartTooltip, fullName } from '../lib/format';
import { Avatar, Empty, PageHead, Progress } from '../components/UI';

const PIE = ['#22d3ee', '#8b5cf6', '#34d399', '#fbbf24', '#f472b6', '#f87171', '#60a5fa'];

function Heatmap({ days }) {
  if (!days?.length) return <Empty title="No data yet" />;
  // pad so the first column starts on Sunday
  const first = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const cells = [...Array(first).fill(null), ...days];
  const color = (p) => (p == null ? 'transparent' : p === 0 ? 'rgba(148,163,255,.07)' : `rgba(34,211,238,${0.18 + (p / 100) * 0.8})`);
  return (
    <div className="heatmap">
      {cells.map((d, i) => <div key={i} className="cell" style={{ background: color(d?.percentage ?? (d ? 0 : null)) }} title={d ? `${d.date}: ${d.count} present (${d.percentage}%)` : ''} />)}
    </div>
  );
}

export default function Analytics() {
  const [days, setDays] = useState(30);
  const { data: risk } = useFetch('/analytics/at-risk', { limit: 50 });
  const { data: heat } = useFetch('/analytics/heatmap', { days: 182 });
  const { data: arrivals } = useFetch('/analytics/arrivals', { days });
  const { data: sources } = useFetch('/analytics/sources', { days });
  const { data: depts } = useFetch('/analytics/departments');

  const cutoff = arrivals?.lateCutoff;
  return (
    <>
      <PageHead title="Analytics" subtitle="Working-day aware statistics: holidays and weekends are excluded automatically.">
        <div className="segmented">{[7, 30, 90].map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} days</button>)}</div>
      </PageHead>
      <div className="bento">
        <div className="c-12 panel">
          <div className="panel-title"><CalendarRange size={18} /> Six-month presence heatmap</div>
          <Heatmap days={heat?.days} />
          <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Each square is one day; brighter means a higher share of {heat?.totalStudents ?? 0} active students present.</div>
        </div>

        <div className="c-7 panel">
          <div className="panel-title"><Clock3 size={18} /> Arrival times (15-minute buckets)</div>
          <div style={{ height: 270 }}>
            <ResponsiveContainer>
              <BarChart data={asList(arrivals)}>
                <CartesianGrid stroke="rgba(148,163,255,.08)" vertical={false} />
                <XAxis dataKey="time" stroke="#6b75a1" fontSize={11} />
                <YAxis stroke="#6b75a1" fontSize={12} allowDecimals={false} />
                <Tooltip {...chartTooltip} />
                {cutoff && <ReferenceLine x={asList(arrivals).find((b) => b.time >= cutoff.padStart(5, '0'))?.time} stroke="#f87171" strokeDasharray="4 4" label={{ value: 'late cut-off', fill: '#fca5a5', fontSize: 11 }} />}
                <Bar dataKey="PRESENT" stackId="a" fill="#22d3ee" radius={[0, 0, 4, 4]} />
                <Bar dataKey="LATE" stackId="a" fill="#fbbf24" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="c-5 panel">
          <div className="panel-title"><Radar size={18} /> How attendance was captured</div>
          {!sources?.bySource?.length ? <Empty title="No records in range" /> : (
            <>
              <div style={{ height: 190 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={sources.bySource} dataKey="count" nameKey="source" innerRadius={52} outerRadius={82} paddingAngle={3}>
                      {sources.bySource.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} stroke="none" />)}
                    </Pie>
                    <Tooltip {...chartTooltip} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="col" style={{ gap: 8 }}>
                {sources.byDevice.slice(0, 4).map((d) => (
                  <div key={d.device._id} className="row-between" style={{ fontSize: 13 }}>
                    <span>{d.device.deviceName || d.device._id}</span>
                    <span className="faint">{d.count} - avg match {d.avgConfidence != null ? `${Math.round(d.avgConfidence * 100)}%` : '-'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="c-5 panel">
          <div className="panel-title">Departments ({depts?.workingDays ?? 0} working days)</div>
          <div className="col" style={{ gap: 14 }}>
            {(depts?.departments || []).map((d) => (
              <div key={d.departmentId}>
                <div className="row-between" style={{ fontSize: 13 }}><span><b>{d.code}</b> <span className="faint">{d.totalStudents} students</span></span><b>{d.attendancePercentage}%</b></div>
                <div style={{ marginTop: 6 }}><Progress value={d.attendancePercentage} /></div>
              </div>
            ))}
            {!depts?.departments?.length && <Empty title="No departments" />}
          </div>
        </div>

        <div className="c-7 panel">
          <div className="panel-title"><AlertTriangle size={18} /> Below {risk?.threshold ?? 75}% (last 30 days)</div>
          {!risk?.items?.length ? <Empty title="No at-risk students" /> : (
            <div className="table-wrap" style={{ maxHeight: 380 }}>
              <table className="table">
                <thead><tr><th>Student</th><th>Dept</th><th>Days</th><th>Attendance</th></tr></thead>
                <tbody>
                  {risk.items.map((r) => (
                    <tr key={r.student.id}>
                      <td><Link to={`/app/students/${r.student.id}`} className="row"><Avatar student={r.student} /><b>{fullName(r.student)}</b></Link></td>
                      <td>{r.student.department?.code}</td>
                      <td>{r.attendedDays}/{r.workingDays}</td>
                      <td style={{ width: 180 }}><div className="row"><div className="grow"><Progress value={r.percentage} color="linear-gradient(90deg,#f87171,#fbbf24)" /></div><b style={{ color: '#fca5a5' }}>{r.percentage}%</b></div></td>
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
