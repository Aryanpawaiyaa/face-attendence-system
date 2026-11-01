export const fullName = (s) => (s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() : '-');
export const initials = (s) => (s ? `${(s.firstName || '?')[0]}${(s.lastName || '')[0] || ''}`.toUpperCase() : '?');
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-');
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
export const fmtDateTime = (d) => (d ? `${fmtDate(d)} ${fmtTime(d)}` : '-');
export const pct = (n) => `${Math.round((Number(n) || 0) * 10) / 10}%`;
export const today = () => new Date().toISOString().slice(0, 10);
export function ago(d) {
  if (!d) return 'never';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
export const chartTooltip = {
  contentStyle: { background: 'rgba(15,22,48,.96)', border: '1px solid rgba(148,163,255,.28)', borderRadius: 12, color: '#e7ebff' },
  labelStyle: { color: '#a3acd1' },
};
export const STATUS_BADGE = { PRESENT: 'b-green', LATE: 'b-amber', ABSENT: 'b-red', EXCUSED: 'b-violet', HOLIDAY: 'b-cyan' };
