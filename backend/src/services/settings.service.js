const { prisma } = require('../config/database');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { localDateOnly, parseHHmm, localMinutes, partsInZone } = require('../utils/time');

// timezone is intentionally NOT editable here: attendance days are stored by
// the server's APP_TIMEZONE, so a second, DB-editable timezone made "today",
// late cut-off and reports disagree. It is reported read-only from env.
const EDITABLE = [
  'institutionName',
  'lateCutoff',
  'recognitionThreshold',
  'minAttendancePercent',
  'workingDays',
  'blockOnHolidays',
  'requireLiveness',
  'saveSnapshots',
  'unknownFaceAlerts',
  'deviceOfflineMinutes',
];

let cache = null;
let cacheAt = 0;
const TTL_MS = 30 * 1000;

const settingsService = {
  async get() {
    if (cache && Date.now() - cacheAt < TTL_MS) return cache;
    let doc = await prisma.setting.findUnique({ where: { id: 'global' } });
    if (!doc) doc = await prisma.setting.create({ data: { id: 'global', _id: 'global' } });
    cache = { ...doc, id: doc.id || doc._id, timezone: env.timezone };
    cacheAt = Date.now();
    return cache;
  },

  async update(patch) {
    const data = {};
    for (const k of EDITABLE) if (patch[k] !== undefined) data[k] = patch[k];
    if (data.lateCutoff && !/^\d{1,2}:\d{2}$/.test(data.lateCutoff)) {
      throw ApiError.badRequest('lateCutoff must be HH:mm');
    }
    if (data.recognitionThreshold !== undefined) {
      const t = Number(data.recognitionThreshold);
      if (!(t > 0.2 && t < 0.95)) throw ApiError.badRequest('recognitionThreshold must be between 0.2 and 0.95');
    }
    try {
      await prisma.setting.update({ where: { id: 'global' }, data });
    } catch {
      await prisma.setting.create({ data: { id: 'global', _id: 'global', ...data } });
    }
    cache = null;
    return settingsService.get();
  },

  /** PRESENT/LATE using the session window if any, else the global cut-off. */
  async classify(markedAt, session) {
    if (session && session.startAt) {
      const lateAt = new Date(new Date(session.startAt).getTime() + (session.lateAfterMinutes ?? 10) * 60000);
      return markedAt > lateAt ? 'LATE' : 'PRESENT';
    }
    const s = await settingsService.get();
    return localMinutes(markedAt, s.timezone) > parseHHmm(s.lateCutoff) ? 'LATE' : 'PRESENT';
  },

  async isHoliday(date = new Date()) {
    const s = await settingsService.get();
    const day = localDateOnly(date, s.timezone);
    const weekday = partsInZone(date, s.timezone).weekday;
    if (Array.isArray(s.workingDays) && s.workingDays.length && !s.workingDays.includes(weekday)) {
      return { holiday: true, name: 'Non-working day' };
    }
    const h = await Holiday.findOne({ date: day }).lean();
    return h ? { holiday: true, name: h.name } : { holiday: false };
  },

  // ---------------- holidays
  listHolidays({ from, to } = {}) {
    const q = {};
    if (from || to) {
      q.date = {};
      if (from) q.date.$gte = localDateOnly(from);
      if (to) q.date.$lte = localDateOnly(to);
    }
    return Holiday.find(q).sort({ date: 1 }).lean();
  },

  async addHoliday({ date, name, type }) {
    if (!date || !name) throw ApiError.badRequest('date and name are required');
    const day = localDateOnly(date);
    const exists = await Holiday.findOne({ date: day });
    if (exists) throw ApiError.conflict('A holiday already exists on this date');
    return (await Holiday.create({ date: day, name, type })).toObject();
  },

  async removeHoliday(id) {
    const r = await Holiday.deleteOne({ _id: id });
    if (!r.deletedCount) throw ApiError.notFound('Holiday not found');
  },
};

module.exports = settingsService;
