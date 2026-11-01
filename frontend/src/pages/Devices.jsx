import { useEffect, useState } from 'react';
import { Copy, Cpu, Download, KeyRound, Pencil, Play, Plus, Power, Radio, Square, Trash2, Wifi } from 'lucide-react';
import { asList, authedUrl, del, errMsg, get, post, put } from '../lib/api';
import { useFetch, useLiveEvents } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { ago } from '../lib/format';
import { Empty, Field, Modal, PageHead, useToast } from '../components/UI';

const EMPTY = { deviceName: '', deviceCode: '', cameraType: 'AMB82_MINI', connectionMode: 'PUSH', streamUrl: '', ipAddress: '', building: '', room: '', defaultCourseId: '' };

function DeviceForm({ open, device, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const { data: courses } = useFetch(open ? '/courses' : null, { limit: 100 });
  useEffect(() => { if (open) setF(device ? { ...EMPTY, ...Object.fromEntries(Object.entries(device).map(([k, v]) => [k, v ?? ''])) } : EMPTY); }, [open, device]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const body = { deviceName: f.deviceName, cameraType: f.cameraType, connectionMode: f.connectionMode, streamUrl: f.streamUrl, ipAddress: f.ipAddress, building: f.building, room: f.room, defaultCourseId: f.defaultCourseId };
    try {
      if (device) { await put(`/devices/${device.id}`, body); toast('Camera updated', 'success'); onSaved(null); }
      else onSaved(await post('/devices/register', { ...body, deviceCode: f.deviceCode }));
    } catch (e) { toast(errMsg(e), 'error'); }
  };
  const needsUrl = f.connectionMode !== 'PUSH';
  return (
    <Modal open={open} onClose={onClose} title={device ? 'Edit camera' : 'Register camera'} subtitle="AMB82 Mini, IP camera or a PC webcam acting as a device."
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!f.deviceName || (!device && !f.deviceCode) || (needsUrl && !f.streamUrl)} onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Name"><input className="input" value={f.deviceName} onChange={set('deviceName')} placeholder="Main gate camera" /></Field>
        <Field label="Device code"><input className="input mono" value={f.deviceCode} disabled={!!device} onChange={set('deviceCode')} placeholder="AMB82-GATE-01" /></Field>
        <Field label="Camera type">
          <select className="select" value={f.cameraType} onChange={set('cameraType')}>
            <option value="AMB82_MINI">AMB82 Mini</option><option value="IP_CAMERA">IP camera</option><option value="WEBCAM">Webcam</option><option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Connection">
          <select className="select" value={f.connectionMode} onChange={set('connectionMode')}>
            <option value="PUSH">Push - board uploads JPEG frames</option>
            <option value="RTSP">RTSP - server pulls video</option>
            <option value="MJPEG">HTTP MJPEG - server pulls video</option>
          </select>
        </Field>
        {needsUrl && (
          <Field label="Stream URL" className="span-2">
            <input className="input mono" value={f.streamUrl} onChange={set('streamUrl')} placeholder={f.connectionMode === 'RTSP' ? 'rtsp://192.168.1.50:554' : 'http://192.168.1.50/'} />
          </Field>
        )}
        <Field label="Board IP (optional)"><input className="input mono" value={f.ipAddress} onChange={set('ipAddress')} placeholder="192.168.1.50" /></Field>
        <Field label="Default course">
          <select className="select" value={f.defaultCourseId} onChange={set('defaultCourseId')}>
            <option value="">None (daily attendance)</option>{asList(courses).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
        </Field>
        <Field label="Building"><input className="input" value={f.building} onChange={set('building')} /></Field>
        <Field label="Room"><input className="input" value={f.room} onChange={set('room')} /></Field>
      </div>
    </Modal>
  );
}

function KeyModal({ data, onClose }) {
  const toast = useToast();
  const [host, setHost] = useState('');
  const [cfg, setCfg] = useState('');
  useEffect(() => { setCfg(''); setHost(''); }, [data]);
  if (!data) return null;
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast('Copied', 'success'));
  const loadCfg = async () => {
    try {
      const text = await get(`/devices/${data.device.id}/firmware-config`, { host: host || undefined, port: window.location.port === '5173' ? 5001 : window.location.port || 80 });
      setCfg(String(text).replace('PASTE_THE_API_KEY_SHOWN_AT_REGISTRATION', data.apiKey));
    } catch (e) { toast(errMsg(e), 'error'); }
  };
  return (
    <Modal open onClose={onClose} title="Device API key" subtitle="Shown once. Store it now - only a hash is kept on the server.">
      <div className="col" style={{ gap: 14 }}>
        <div className="row"><div className="code grow">{data.apiKey}</div><button className="btn icon-btn" onClick={() => copy(data.apiKey)}><Copy size={16} /></button></div>
        <div className="divider" />
        <b>AMB82 Mini firmware config</b>
        <Field label="This PC's Wi-Fi IP address (the board connects to it)">
          <div className="row"><input className="input mono grow" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.10  (ipconfig / ifconfig)" /><button className="btn" onClick={loadCfg}><Download size={15} /> Generate config.h</button></div>
        </Field>
        {cfg && <><div className="code">{cfg}</div><button className="btn btn-sm" onClick={() => copy(cfg)}><Copy size={14} /> Copy config.h</button></>}
        <div className="notice">Open <span className="kbd">firmware/amb82_faceattend</span> in Arduino IDE, replace <span className="kbd">config.h</span>, set Wi-Fi name/password, select board AMB82-MINI and upload.</div>
      </div>
    </Modal>
  );
}

function Preview({ device, onClose }) {
  return (
    <Modal open={!!device} onClose={onClose} wide title={device?.deviceName} subtitle="Annotated live preview from the recognition server">
      {device && (
        <div className="stage">
          <img className="feed-img" src={authedUrl(`/devices/${device.id}/stream/preview`)} alt="" />
          <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
        </div>
      )}
    </Modal>
  );
}

export default function Devices() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { data, reload } = useFetch('/devices', { limit: 100 });
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [keyData, setKeyData] = useState(null);
  const [preview, setPreview] = useState(null);
  useLiveEvents({ device: () => reload() });
  useEffect(() => { const t = setInterval(reload, 30000); return () => clearInterval(t); }, [reload]);

  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg, 'success'); reload(); } catch (e) { toast(errMsg(e), 'error'); } };
  const items = asList(data);
  const online = (d) => d.lastActiveAt && Date.now() - new Date(d.lastActiveAt).getTime() < 15 * 60000;

  return (
    <>
      <PageHead title="Cameras & AMB82 Mini" subtitle="Register boards, manage keys, start RTSP streams and watch live previews.">
        {isAdmin && <button className="btn btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={16} /> Register camera</button>}
      </PageHead>
      {!items.length ? (
        <div className="panel"><Empty icon={Cpu} title="No cameras yet" hint="Register an AMB82 Mini, then flash the firmware in /firmware with the generated config." /></div>
      ) : (
        <div className="col" style={{ gap: 14 }}>
          {items.map((d) => (
            <div key={d.id} className="panel">
              <div className="row wrap" style={{ gap: 18 }}>
                <div style={{ width: 54, height: 54, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--grad-soft)', border: '1px solid var(--border-hi)' }}>
                  {d.connectionMode === 'PUSH' ? <Wifi size={24} color="#22d3ee" /> : <Radio size={24} color="#a78bfa" />}
                </div>
                <div className="grow" style={{ minWidth: 220 }}>
                  <div className="row" style={{ gap: 10 }}>
                    <h3 style={{ fontSize: 18 }}>{d.deviceName}</h3>
                    {d.status !== 'ACTIVE' ? <span className="badge b-gray">{d.status}</span> : online(d) ? <span className="badge b-green"><span className="dot pulse" />Online</span> : <span className="badge b-red">Offline</span>}
                    {d.streaming && <span className="badge b-violet">Streaming</span>}
                  </div>
                  <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
                    <span className="mono">{d.deviceCode}</span> - {d.cameraType?.replace('_', ' ')} - {d.connectionMode}
                    {d.streamUrl ? ` - ${d.streamUrl.replace(/\/\/[^@/]+@/, '//***@')}` : ''} - {[d.building, d.room].filter(Boolean).join(' / ') || 'no location'}
                  </div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
                    Last seen {ago(d.lastActiveAt)} - {d.framesReceived || 0} frames - {d.recognitions || 0} recognitions{d.firmwareVersion ? ` - fw ${d.firmwareVersion}` : ''}
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {d.connectionMode !== 'PUSH' && (d.streaming ? (
                    <>
                      <button className="btn btn-sm" onClick={() => setPreview(d)}>Preview</button>
                      <button className="btn btn-sm" onClick={() => act(() => post(`/devices/${d.id}/stream/stop`), 'Stream stopped')}><Square size={14} /> Stop</button>
                    </>
                  ) : (
                    <button className="btn btn-sm btn-primary" disabled={d.status !== 'ACTIVE'} onClick={() => act(() => post(`/devices/${d.id}/stream/start`), 'Stream started')}><Play size={14} /> Start stream</button>
                  ))}
                  {isAdmin && (
                    <>
                      <button className="btn btn-sm btn-ghost" title="Edit" onClick={() => { setEditing(d); setFormOpen(true); }}><Pencil size={14} /></button>
                      <button className="btn btn-sm btn-ghost" title="Rotate API key" onClick={() => window.confirm('Generate a new key? The board stops working until you flash the new key.') && act(async () => setKeyData({ device: d, ...(await post(`/devices/${d.id}/rotate-key`)) }))}><KeyRound size={14} /></button>
                      <button className="btn btn-sm btn-ghost" title={d.status === 'ACTIVE' ? 'Disable' : 'Enable'} onClick={() => act(() => post(`/devices/${d.id}/${d.status === 'ACTIVE' ? 'disable' : 'enable'}`))}><Power size={14} /></button>
                      <button className="btn btn-sm btn-ghost" title="Delete" onClick={() => window.confirm(`Delete ${d.deviceName}?`) && act(() => del(`/devices/${d.id}`), 'Camera removed')}><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <DeviceForm open={formOpen} device={editing} onClose={() => setFormOpen(false)} onSaved={(res) => { setFormOpen(false); reload(); if (res?.apiKey) setKeyData(res); }} />
      <KeyModal data={keyData} onClose={() => setKeyData(null)} />
      <Preview device={preview} onClose={() => setPreview(null)} />
    </>
  );
}
