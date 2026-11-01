import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Inbox, Info, X } from 'lucide-react';
import { STATUS_BADGE, initials } from '../lib/format';
import { media } from '../lib/api';

/* ------------------------------------------------------------ Toasts */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, message, type }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4800);
  }, []);
  const icon = { success: CheckCircle2, error: AlertTriangle, info: Info };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        <AnimatePresence>
          {items.map((t) => {
            const I = icon[t.type] || Info;
            return (
              <motion.div
                key={t.id}
                className={`toast ${t.type}`}
                initial={{ opacity: 0, x: 40, rotateY: -20 }}
                animate={{ opacity: 1, x: 0, rotateY: 0 }}
                exit={{ opacity: 0, x: 40 }}
              >
                <I size={18} color={t.type === 'error' ? '#f87171' : t.type === 'success' ? '#34d399' : '#22d3ee'} />
                <span>{t.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ------------------------------------------------------------ Modal */
export function Modal({ open, onClose, title, subtitle, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
          <motion.div
            className={`modal ${wide ? 'wide' : ''}`}
            initial={{ opacity: 0, rotateX: 14, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, rotateX: -8, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <div className="modal-head">
              <div>
                <h3 style={{ fontSize: 20 }}>{title}</h3>
                {subtitle && <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{subtitle}</p>}
              </div>
              <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------ Tilt card (3D hover) */
export function TiltCard({ children, className = '', max = 8, style, ...rest }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(1100px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max}deg) translateZ(0)`;
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = 'perspective(1100px) rotateX(0) rotateY(0)';
  };
  return (
    <div ref={ref} className={`panel tilt ${className}`} onMouseMove={onMove} onMouseLeave={onLeave} style={style} {...rest}>
      <div className="tilt-shine" />
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ small pieces */
export const Spinner = ({ size = 22 }) => <div className="spinner" style={{ width: size, height: size }} />;

export function Empty({ icon: I = Inbox, title = 'Nothing here yet', hint, action }) {
  return (
    <div className="empty">
      <I size={34} />
      <div style={{ color: 'var(--text-2)', fontWeight: 600 }}>{title}</div>
      {hint && <div style={{ fontSize: 13, maxWidth: 420 }}>{hint}</div>}
      {action}
    </div>
  );
}

export const StatusBadge = ({ status }) => (
  <span className={`badge ${STATUS_BADGE[status] || 'b-gray'}`}>
    <span className="dot" />
    {status}
  </span>
);

export function Switch({ on, onChange, disabled }) {
  return <button type="button" className={`switch ${on ? 'on' : ''}`} onClick={() => !disabled && onChange(!on)} disabled={disabled} aria-pressed={on} />;
}

export function Avatar({ student, size }) {
  const [broken, setBroken] = useState(false);
  if (student?.photoUrl && !broken) {
    return <img className={`avatar ${size === 'lg' ? 'avatar-lg' : ''}`} src={media(student.photoUrl)} alt="" onError={() => setBroken(true)} />;
  }
  return <span className={`avatar ${size === 'lg' ? 'avatar-lg' : ''}`}>{initials(student)}</span>;
}

export function Field({ label, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      {children}
    </div>
  );
}

export function Kpi({ label, value, sub, icon: I, accent = 'var(--violet)' }) {
  return (
    <div className="kpi" style={{ '--accent': accent }}>
      <div className="label">
        {I && <I size={14} color={accent} />}
        {label}
      </div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Progress({ value, color }) {
  return (
    <div className="progress">
      <span style={{ width: `${Math.max(0, Math.min(100, value || 0))}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

export function PageHead({ title, subtitle, children }) {
  return (
    <motion.div className="page-head" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="row wrap">{children}</div>
    </motion.div>
  );
}

export function Pager({ pagination, onPage }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total } = pagination;
  return (
    <div className="row-between" style={{ marginTop: 14 }}>
      <span className="faint" style={{ fontSize: 13 }}>
        Page {page} of {totalPages} - {total} records
      </span>
      <div className="row">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
