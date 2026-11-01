/**
 * Timezone-aware date helpers.
 *
 * Attendance "days" follow the institution's local calendar (APP_TIMEZONE),
 * but are stored as a UTC-midnight Date of that local calendar day so that
 * equality look-ups stay simple and index-friendly.
 */
const env = require('../config/env');

function partsInZone(date, timeZone = env.timezone) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const out = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  const weekdayIdx = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[out.weekday];
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: weekdayIdx,
  };
}

/** Local calendar day of `input` -> Date at UTC midnight of that day. */
function localDateOnly(input, timeZone = env.timezone) {
  const d = input ? new Date(input) : new Date();
  // Plain 'YYYY-MM-DD' strings are already calendar dates
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(`${input}T00:00:00.000Z`);
  }
  const p = partsInZone(d, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

/** Minutes since local midnight. */
function localMinutes(date = new Date(), timeZone = env.timezone) {
  const p = partsInZone(date, timeZone);
  return p.hour * 60 + p.minute;
}

function parseHHmm(str, fallback = '10:00') {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || fallback));
  if (!m) return 600;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isoDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

module.exports = { partsInZone, localDateOnly, localMinutes, parseHHmm, isoDay, addDays };
