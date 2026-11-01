import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity, BarChart3, Bell, BookOpen, CalendarClock, Camera, ClipboardList, Cpu, FileDown, Images, LayoutDashboard, LogOut,
  Menu, MonitorSmartphone, ScanFace, Settings, ShieldAlert, ShieldCheck, Users,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useLiveEvents } from '../lib/hooks';
import { get } from '../lib/api';
import { useToast } from './UI';

const NAV = [
  { group: 'Overview', items: [
    { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/app/live', label: 'Live Recognition', icon: ScanFace },
    { to: '/app/sessions', label: 'Class Sessions', icon: CalendarClock },
  ] },
  { group: 'People & Curriculum', items: [
    { to: '/app/students', label: 'Students & Faces', icon: Users },
    { to: '/app/courses', label: 'Courses & Faculty', icon: BookOpen },
    { to: '/app/attendance', label: 'Attendance', icon: ClipboardList },
    { to: '/app/unknown', label: 'Unknown Faces', icon: ShieldAlert, badge: 'unknown' },
  ] },
  { group: 'Insights', items: [
    { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/app/reports', label: 'Reports', icon: FileDown },
  ] },
  { group: 'Hardware', items: [
    { to: '/app/devices', label: 'Cameras & AMB82', icon: Cpu },
    { to: '/app/group-photo', label: 'Group Photo', icon: Images },
    { to: '/kiosk', label: 'Kiosk Mode', icon: MonitorSmartphone },
  ] },
  { group: 'System', items: [
    { to: '/app/admins', label: 'Administrators', icon: ShieldCheck },
    { to: '/app/settings', label: 'Settings', icon: Settings },
  ] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [unknownCount, setUnknownCount] = useState(0);
  const [engine, setEngine] = useState(null);

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    get('/unknown-faces', { status: 'PENDING', limit: 1 }).then((d) => setUnknownCount(d.pagination?.total || 0)).catch(() => null);
    const load = () => get('/ml/status').then(setEngine).catch(() => setEngine({ online: false }));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const live = useLiveEvents({
    attendance: (e) => e.studentName && !e.corrected && toast(`${e.studentName} marked ${e.status}`, 'success'),
    unknown_face: () => {
      setUnknownCount((n) => n + 1);
      toast('Unknown face detected - review queue updated', 'error');
    },
    device: (e) => e.online === false && toast(`${e.deviceName || 'A camera'} went offline`, 'error'),
  });

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <img src="/logo.svg" alt="" />
          <div>
            <b>FaceAttend</b>
            <small>Pro Console</small>
          </div>
        </div>
        <nav style={{ overflowY: 'auto' }}>
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="nav-group">{g.group}</div>
              {g.items.map(({ to, label, icon: I, end, badge }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <I size={18} />
                  {label}
                  {badge === 'unknown' && unknownCount > 0 && <span className="count">{unknownCount}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="row" style={{ gap: 8, fontSize: 12 }}>
            <span className={`badge ${engine?.online ? 'b-green' : 'b-red'}`}>
              <span className={`dot ${engine?.online ? 'pulse' : ''}`} />
              Engine {engine?.online ? 'online' : 'offline'}
            </span>
          </div>
          <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
            {engine?.online ? `${engine.model} - ${engine.enrolledCount} faces` : 'Start the Python face service'}
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost icon-btn mobile-toggle" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            <Menu size={18} />
          </button>
          <div className="row grow" style={{ gap: 10 }}>
            <span className={`badge ${live ? 'b-blue' : 'b-gray'}`}>
              <Activity size={12} className={live ? 'pulse' : ''} />
              {live ? 'Live' : 'Reconnecting'}
            </span>
          </div>
          <button className="btn btn-sm btn-primary hide-sm" onClick={() => nav('/app/live')}>
            <Camera size={15} /> Start camera
          </button>
          <button className="btn btn-ghost icon-btn" onClick={() => nav('/app/unknown')} aria-label="Alerts">
            <Bell size={18} />
          </button>
          <div className="row" style={{ gap: 10 }}>
            <span className="avatar">{(user?.firstName || '?')[0]}</span>
            <div className="hide-sm" style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{user?.firstName} {user?.lastName}</div>
              <div className="faint" style={{ fontSize: 11 }}>{user?.role?.replace('_', ' ')}</div>
            </div>
          </div>
          <button className="btn btn-ghost icon-btn" onClick={async () => { await logout(); nav('/login'); }} aria-label="Log out">
            <LogOut size={18} />
          </button>
        </header>
        <motion.main
          key={loc.pathname}
          className="content"
          initial={{ opacity: 0, y: 14, rotateX: 4 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.28 }}
          style={{ transformOrigin: 'top center' }}
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  );
}
