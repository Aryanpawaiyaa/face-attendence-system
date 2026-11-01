import { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BadgeCheck, CheckCircle2, Cpu, Fingerprint, Radio, ScanFace, ShieldCheck, Sparkles, Wifi } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { TiltCard } from '../components/UI';

const FaceScanScene = lazy(() => import('../components/Scene3D').then((m) => ({ default: m.FaceScanScene })));

const fade = { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-80px' }, transition: { duration: 0.6 } };

function MockFeed() {
  const rows = [
    ['Rajat Sharma', 'PRESENT', '09:02', '#34d399'],
    ['Priyanka Singh', 'PRESENT', '09:04', '#34d399'],
    ['Pushpendra Kumar', 'LATE', '10:07', '#fbbf24'],
    ['Unknown visitor', 'REVIEW', '10:11', '#f87171'],
  ];
  return (
    <TiltCard className="showcase" max={10} style={{ padding: 22 }}>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <b style={{ fontFamily: 'var(--display)' }}>Live attendance</b>
        <span className="badge b-blue"><span className="dot pulse" />streaming</span>
      </div>
      <div className="col" style={{ gap: 10 }}>
        {rows.map(([n, s, t, c], i) => (
          <motion.div key={n} className="feed-item" initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 * i }} viewport={{ once: true }}>
            <span className="avatar">{n[0]}</span>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{n}</div>
              <div className="faint" style={{ fontSize: 12 }}>AMB82-GATE-01 - {t}</div>
            </div>
            <span className="badge" style={{ color: c, borderColor: `${c}55`, background: `${c}18` }}>{s}</span>
          </motion.div>
        ))}
      </div>
    </TiltCard>
  );
}

function MockDevice() {
  return (
    <TiltCard className="showcase" max={10} style={{ display: 'grid', placeItems: 'center' }}>
      <div style={{ transform: 'translateZ(60px)', textAlign: 'center' }}>
        <div style={{ width: 180, height: 120, margin: '0 auto', borderRadius: 18, background: 'linear-gradient(145deg,#1b2350,#0b1022)', border: '1px solid var(--border-hi)', position: 'relative', boxShadow: '0 30px 60px -20px rgba(34,211,238,.4)' }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 54, height: 54, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #67e8f9, #1e3a8a 60%, #020617)', boxShadow: '0 0 30px rgba(34,211,238,.6)' }} />
          <span style={{ position: 'absolute', right: 14, top: 12, width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 12px #34d399' }} />
        </div>
        <div style={{ marginTop: 22, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20 }}>AMB82 Mini</div>
        <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>RTL8735B - 0.4 TOPS NPU - Full-HD sensor</div>
        <div className="chips" style={{ justifyContent: 'center', marginTop: 16 }}>
          <span className="chip"><Wifi size={14} /> Push JPEG</span>
          <span className="chip"><Radio size={14} /> RTSP 554</span>
        </div>
      </div>
    </TiltCard>
  );
}

function MockEnroll() {
  return (
    <TiltCard className="showcase" max={10} style={{ padding: 22 }}>
      <b style={{ fontFamily: 'var(--display)' }}>Enrol a face in 20 seconds</b>
      <div className="faint" style={{ fontSize: 13, margin: '6px 0 18px' }}>Quality gate checks blur, light, pose and duplicates</div>
      <div className="shots">
        {[92, 88, 95, 71, 90, 93, 89, 94].map((q, i) => (
          <div key={i} className={`shot ${q > 80 ? 'good' : 'bad'}`} style={{ display: 'grid', placeItems: 'center', background: 'var(--grad-soft)' }}>
            <ScanFace size={26} color={q > 80 ? '#34d399' : '#f87171'} />
          </div>
        ))}
      </div>
      <div className="row-between" style={{ marginTop: 18, fontSize: 13 }}>
        <span className="muted">7 of 8 samples accepted</span>
        <span className="badge b-green">Ready</span>
      </div>
    </TiltCard>
  );
}

function MockAnalytics() {
  const bars = [62, 78, 85, 71, 90, 94, 88, 76, 92, 97, 83, 89];
  return (
    <TiltCard className="showcase" max={10} style={{ padding: 22, display: 'flex', flexDirection: 'column' }}>
      <div className="row-between">
        <b style={{ fontFamily: 'var(--display)' }}>Attendance trend</b>
        <span className="badge b-violet">at-risk alerts</span>
      </div>
      <div className="row" style={{ alignItems: 'flex-end', gap: 10, flex: 1, marginTop: 20 }}>
        {bars.map((b, i) => (
          <motion.div key={i} initial={{ height: 0 }} whileInView={{ height: `${b}%` }} transition={{ delay: i * 0.05, duration: 0.6 }} viewport={{ once: true }}
            style={{ flex: 1, borderRadius: 8, background: i === bars.length - 3 ? 'var(--grad)' : 'rgba(99,102,241,.35)' }} />
        ))}
      </div>
    </TiltCard>
  );
}

const FEATURES = [
  {
    eyebrow: 'Recognition engine',
    title: 'InsightFace buffalo_l - SCRFD detector with ArcFace ResNet50',
    text: 'A state-of-the-art open model pack replaces the old lightweight model. Every face in the frame is detected, aligned and matched against a multi-sample gallery with a best-versus-runner-up margin, so look-alikes are not confused.',
    points: ['Multi-face recognition in one frame', 'Quality scoring: blur, lighting, pose, size', 'Optional anti-spoofing model hook', 'GPU used automatically when available'],
    visual: <MockFeed />,
  },
  {
    eyebrow: 'AMB82 Mini integration',
    title: 'Plug in a Realtek AMB82 Mini and it starts taking attendance',
    text: 'Flash the included firmware, paste the device key, and the board pushes JPEG frames over Wi-Fi - or stream RTSP and let the server pull video continuously with a live annotated preview in the browser.',
    points: ['Push mode with green LED confirmation', 'RTSP pull mode with auto-reconnect', 'Heartbeat, offline alerts, key rotation', 'Firmware config generated per device'],
    visual: <MockDevice />,
  },
  {
    eyebrow: 'Teacher enrolment',
    title: 'Teachers add student faces straight from the browser',
    text: 'Guided capture shows live quality feedback, rejects blurry or duplicate faces, and stores only the biometric template in the recognition service. Unknown faces caught by cameras can be assigned to a student in one click.',
    points: ['Webcam burst capture or photo upload', 'Duplicate identity protection', 'Unknown-face review queue', 'CSV bulk import of student lists'],
    visual: <MockEnroll />,
  },
  {
    eyebrow: 'Insight',
    title: 'Analytics that tell you who needs help - before exams',
    text: 'Working-day aware percentages, at-risk detection with the number of classes needed to recover, arrival-time distribution, heatmaps and one-click CSV, Excel and PDF reports.',
    points: ['Live dashboard over Server-Sent Events', 'Class sessions with auto-absent on close', 'Holiday calendar and late cut-off policy', 'Full audit trail of every correction'],
    visual: <MockAnalytics />,
  },
];

export default function Landing() {
  const { isAuthed } = useAuth();
  return (
    <div className="landing">
      <nav className="l-nav">
        <Link to="/" className="row">
          <img src="/logo.svg" alt="" width={36} height={36} />
          <b style={{ fontFamily: 'var(--display)', fontSize: 19 }}>FaceAttend Pro</b>
        </Link>
        <div className="row">
          <a href="#features" className="btn btn-ghost hide-sm">Features</a>
          <a href="#how" className="btn btn-ghost hide-sm">How it works</a>
          <Link to={isAuthed ? '/app' : '/login'} className="btn btn-primary">
            {isAuthed ? 'Open console' : 'Sign in'} <ArrowRight size={16} />
          </Link>
        </div>
      </nav>

      <section className="hero">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <span className="eyebrow"><Sparkles size={14} color="#22d3ee" /> AI attendance for campuses and companies</span>
          <h1>
            Attendance that <span className="grad-text">recognises</span> every face, instantly.
          </h1>
          <p className="lead">
            FaceAttend Pro combines a high-accuracy face-recognition engine, Realtek AMB82 Mini smart cameras and a real-time
            console - so roll-call takes zero minutes and every record is verifiable.
          </p>
          <div className="row wrap">
            <Link to={isAuthed ? '/app' : '/login'} className="btn btn-primary btn-lg">
              Get started <ArrowRight size={18} />
            </Link>
            <a href="#how" className="btn btn-lg">See the workflow</a>
          </div>
          <div className="row wrap" style={{ marginTop: 34, gap: 22, color: 'var(--text-2)', fontSize: 14 }}>
            <span className="row" style={{ gap: 8 }}><ShieldCheck size={16} color="#34d399" /> Templates never leave your server</span>
            <span className="row" style={{ gap: 8 }}><BadgeCheck size={16} color="#22d3ee" /> 99.83% LFW model accuracy</span>
          </div>
        </motion.div>
        <div className="hero-canvas">
          <Suspense fallback={null}>
            <FaceScanScene />
          </Suspense>
        </div>
      </section>

      <section className="section" id="features">
        <motion.div {...fade} style={{ maxWidth: 760 }}>
          <span className="eyebrow"><Fingerprint size={14} color="#a78bfa" /> Built end-to-end</span>
          <h2>Everything from the camera lens to the semester report.</h2>
        </motion.div>
        <div style={{ marginTop: 30 }}>
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} className={`zig ${i % 2 ? 'rev' : ''}`} {...fade}>
              <div>
                <span className="badge b-violet">{f.eyebrow}</span>
                <h3>{f.title}</h3>
                <p className="muted" style={{ lineHeight: 1.7 }}>{f.text}</p>
                <ul>
                  {f.points.map((p) => (
                    <li key={p}><CheckCircle2 size={18} /> {p}</li>
                  ))}
                </ul>
              </div>
              {f.visual}
            </motion.div>
          ))}
        </div>
      </section>

      <section className="section" id="how">
        <motion.div {...fade}>
          <span className="eyebrow"><Cpu size={14} color="#22d3ee" /> Workflow</span>
          <h2>From install to first attendance in four steps.</h2>
        </motion.div>
        <div className="timeline">
          {[
            ['Register cameras', 'Add an AMB82 Mini (push or RTSP), an IP camera or simply use the browser webcam. Download a pre-filled firmware config and flash it with the Arduino IDE.'],
            ['Enrol student faces', 'Teachers open a student, capture a short burst from the webcam or upload photos. Low-quality and duplicate faces are rejected automatically.'],
            ['Start a class session', 'Pick the course, attach cameras and set the late window. Recognitions flow in live; the dashboard updates instantly.'],
            ['Close and report', 'Closing the session auto-marks absentees. Export daily, monthly or semester reports and follow up on at-risk students.'],
          ].map(([t, d], i) => (
            <motion.div key={t} className="step" data-n={i + 1} {...fade}>
              <h4>{t}</h4>
              <p>{d}</p>
            </motion.div>
          ))}
        </div>
        <motion.div className="chips" style={{ marginTop: 10 }} {...fade}>
          {['React + Three.js', 'Node.js + Express', 'MongoDB', 'InsightFace buffalo_l', 'ONNX Runtime', 'Server-Sent Events', 'AMB82 Mini firmware', 'JWT + RBAC', 'Swagger API'].map((c) => (
            <span key={c} className="chip">{c}</span>
          ))}
        </motion.div>
      </section>

      <motion.div className="cta-band" {...fade}>
        <div>
          <h2 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Ready to retire the paper register?</h2>
          <p className="muted" style={{ marginTop: 8 }}>Sign in with the seeded admin account and enrol your first face.</p>
        </div>
        <Link to={isAuthed ? '/app' : '/login'} className="btn btn-primary btn-lg">
          Launch console <ArrowRight size={18} />
        </Link>
      </motion.div>
      <footer className="faint" style={{ textAlign: 'center', padding: '0 0 40px', fontSize: 13 }}>
        FaceAttend Pro - biometric data is processed locally. Obtain consent before enrolment.
      </footer>
    </div>
  );
}
