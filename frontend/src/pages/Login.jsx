import { Suspense, lazy, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { errMsg } from '../lib/api';
import { Field } from '../components/UI';

const FaceScanScene = lazy(() => import('../components/Scene3D').then((m) => ({ default: m.FaceScanScene })));

export default function Login() {
  const { login, isAuthed } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (isAuthed) return <Navigate to="/app" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      nav('/app');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-visual">
        <Suspense fallback={null}>
          <FaceScanScene cards={false} />
        </Suspense>
        <div style={{ position: 'absolute', left: 40, bottom: 40, maxWidth: 460 }} className="hide-sm">
          <h2 style={{ fontSize: 34 }}>Welcome back.</h2>
          <p className="muted" style={{ marginTop: 8 }}>Your cameras are watching the door so you can focus on teaching.</p>
        </div>
      </div>
      <motion.div className="auth-form" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}>
        <Link to="/" className="row" style={{ marginBottom: 40 }}>
          <img src="/logo.svg" alt="" width={40} height={40} />
          <b style={{ fontFamily: 'var(--display)', fontSize: 20 }}>FaceAttend Pro</b>
        </Link>
        <h1 style={{ fontSize: 32 }}>Sign in</h1>
        <p className="muted" style={{ margin: '8px 0 28px' }}>Admins and teachers use the same console.</p>
        <form className="col" style={{ gap: 16 }} onSubmit={submit}>
          <Field label="Email">
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 14, top: 13, color: 'var(--text-3)' }} />
              <input className="input" style={{ paddingLeft: 40 }} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" required />
            </div>
          </Field>
          <Field label="Password">
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 14, top: 13, color: 'var(--text-3)' }} />
              <input className="input" style={{ paddingLeft: 40 }} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" required />
            </div>
          </Field>
          {error && <div className="notice err">{error}</div>}
          <button className="btn btn-primary btn-lg" disabled={busy} type="submit">
            {busy ? 'Signing in...' : 'Sign in'} <ArrowRight size={18} />
          </button>
        </form>
        <div className="notice" style={{ marginTop: 26 }}>
          First run? Execute <span className="kbd">npm run seed</span> in the backend - it creates
          <b> superadmin@example.com / 123456789</b> and <b>teacher@example.com / 123456789</b>
        </div>
      </motion.div>
    </div>
  );
}
