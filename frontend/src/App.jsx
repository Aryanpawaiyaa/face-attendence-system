import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import { Spinner } from './components/UI';

const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const LiveRecognition = lazy(() => import('./pages/LiveRecognition'));
const Students = lazy(() => import('./pages/Students'));
const StudentProfile = lazy(() => import('./pages/StudentProfile'));
const Sessions = lazy(() => import('./pages/Sessions'));
const Attendance = lazy(() => import('./pages/Attendance'));
const UnknownFaces = lazy(() => import('./pages/UnknownFaces'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Reports = lazy(() => import('./pages/Reports'));
const Devices = lazy(() => import('./pages/Devices'));
const GroupPhoto = lazy(() => import('./pages/GroupPhoto'));
const Kiosk = lazy(() => import('./pages/Kiosk'));
const Courses = lazy(() => import('./pages/Courses'));
const Admins = lazy(() => import('./pages/Admins'));
const SettingsPage = lazy(() => import('./pages/Settings'));

function Protected({ children }) {
  const { isAuthed } = useAuth();
  return isAuthed ? children : <Navigate to="/login" replace />;
}

const Loader = () => (
  <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
    <Spinner size={34} />
  </div>
);

export default function App() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/kiosk" element={<Protected><Kiosk /></Protected>} />
        <Route path="/app" element={<Protected><Layout /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="live" element={<LiveRecognition />} />
          <Route path="students" element={<Students />} />
          <Route path="students/:id" element={<StudentProfile />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="courses" element={<Courses />} />
          <Route path="admins" element={<Admins />} />
          <Route path="unknown" element={<UnknownFaces />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="reports" element={<Reports />} />
          <Route path="devices" element={<Devices />} />
          <Route path="group-photo" element={<GroupPhoto />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
