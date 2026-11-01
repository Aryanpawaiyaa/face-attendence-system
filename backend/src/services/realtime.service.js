/**
 * Server-Sent Events hub. Pushes live attendance / device / unknown-face
 * events to every connected dashboard without polling.
 *
 * Event types: attendance, unknown_face, device, session, enrollment, ping
 */
const { EventEmitter } = require('events');
const logger = require('../config/logger');

const bus = new EventEmitter();
bus.setMaxListeners(500);
const clients = new Set();
const recent = [];
const RECENT_MAX = 50;

function write(res, type, data, id) {
  if (id) res.write(`id: ${id}\n`);
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const realtime = {
  /** Express handler: GET /api/live/events */
  subscribe(req, res) {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write('retry: 4000\n\n');
    const client = { res, user: req.user };
    clients.add(client);
    // Replay the latest events so a freshly opened dashboard is not empty
    for (const e of recent.slice(-15)) write(res, e.type, e.data, e.id);
    const ping = setInterval(() => write(res, 'ping', { t: Date.now() }), 25000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(client);
    });
  },

  publish(type, data) {
    const evt = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, data: { ...data, at: new Date().toISOString() } };
    recent.push(evt);
    if (recent.length > RECENT_MAX) recent.shift();
    for (const c of clients) {
      try {
        write(c.res, evt.type, evt.data, evt.id);
      } catch (err) {
        logger.warn({ err: err.message }, 'SSE write failed');
      }
    }
    bus.emit(type, evt.data);
  },

  get clientCount() {
    return clients.size;
  },

  bus,
};

module.exports = realtime;
