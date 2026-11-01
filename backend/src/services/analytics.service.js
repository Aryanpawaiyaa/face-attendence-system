/**
 * Analytics built directly on MongoDB aggregation pipelines.
 * Percentages use *working days* (institution working weekdays minus
 * holidays, never counting future days) instead of raw calendar days.
 */
const ApiError = require('../utils/ApiError');
const settingsService = require('./settings.service');
const { Attendance, Student, Department, Holiday, Device } = require('../models');
const { localDateOnly, partsInZone, isoDay, addDays } = require('../utils/time');

async function resolveRange(from, to, defaultDays = 30) {
  const today = localDateOnly(new Date());
  const end = to ? localDateOnly(to) : today;
  const start = from ? localDateOnly(from) : addDays(end, -(defaultDays - 1));
  if (start > end) throw ApiError.badRequest('from must be before to');
  return { from: start, to: end > today ? today : end };
}

async function workingDays(from, to) {
  const s = await settingsService.get();
  const holidays = await Holiday.find({ date: { $gte: from, $lte: to } }).select('date').lean();
  const hs = new Set(holidays.map((h) => isoDay(h.date)));
  const days = [];
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    const wd = d.getUTCDay();
    if ((s.workingDays || []).includes(wd) && !hs.has(isoDay(d))) days.push(isoDay(d));
  }
  return days;
}

function pct(n, d) {
  return d > 0 ? Math.min(Math.round((n / d) * 1000) / 10, 100) : 0;
}

const analyticsService = {
  async studentSummary(studentId, { from, to } = {}) {
    const student = await Student.findById(studentId).populate('departmentId', 'name code').lean();
    if (!student) throw ApiError.notFound('Student not found');
    const range = await resolveRange(from, to, 90);
    const [records, wdays] = await Promise.all([
      Attendance.find({ studentId, attendanceDate: { $gte: range.from, $lte: range.to } })
        .sort({ attendanceDate: 1 })
        .populate('courseId', 'name code')
        .lean(),
      workingDays(range.from, range.to),
    ]);
    const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
    const byDay = {};
    for (const r of records) {
      counts[r.status] += 1;
      const k = isoDay(r.attendanceDate);
      // A day counts as attended if any record that day is PRESENT/LATE
      const rank = { PRESENT: 4, LATE: 3, EXCUSED: 2, ABSENT: 1 };
      if (!byDay[k] || rank[r.status] > rank[byDay[k]]) byDay[k] = r.status;
    }
    const attendedDays = Object.values(byDay).filter((s) => s === 'PRESENT' || s === 'LATE').length;
    const excusedDays = Object.values(byDay).filter((s) => s === 'EXCUSED').length;
    const denominator = Math.max(wdays.length - excusedDays, 0);
    // Current streak of consecutive attended working days (most recent first)
    let streak = 0;
    for (let i = wdays.length - 1; i >= 0; i -= 1) {
      const st = byDay[wdays[i]];
      if (st === 'PRESENT' || st === 'LATE') streak += 1;
      else if (i === wdays.length - 1 && !st) continue; // today not yet marked
      else break;
    }
    const s = await settingsService.get();
    const percentage = pct(attendedDays, denominator);
    // Classes needed to reach the minimum %
    const target = s.minAttendancePercent / 100;
    const needed = percentage / 100 >= target ? 0 : Math.ceil((target * denominator - attendedDays) / (1 - target));
    return {
      student: { ...student, id: student._id, department: student.departmentId },
      range: { from: isoDay(range.from), to: isoDay(range.to) },
      workingDays: wdays.length,
      attendedDays,
      counts,
      percentage,
      minRequired: s.minAttendancePercent,
      atRisk: percentage < s.minAttendancePercent,
      classesNeededToRecover: needed,
      streak,
      calendar: wdays.map((d) => ({ date: d, status: byDay[d] || 'NONE' })),
      recent: records.slice(-20).reverse().map((r) => ({ ...r, id: r._id, course: r.courseId })),
    };
  },

  async atRisk({ from, to, departmentId, threshold, limit = 100 } = {}) {
    const s = await settingsService.get();
    const th = Number(threshold) || s.minAttendancePercent;
    const range = await resolveRange(from, to, 30);
    const wdays = await workingDays(range.from, range.to);
    const sq = { status: 'ACTIVE', ...(departmentId ? { departmentId } : {}) };
    const students = await Student.find(sq).select('firstName lastName rollNumber departmentId photoUrl semester section guardianEmail').populate('departmentId', 'code name').lean();
    const agg = await Attendance.aggregate([
      { $match: { attendanceDate: { $gte: range.from, $lte: range.to }, studentId: { $in: students.map((x) => x._id) } } },
      {
        $group: {
          _id: { s: '$studentId', d: '$attendanceDate' },
          attended: { $max: { $cond: [{ $in: ['$status', ['PRESENT', 'LATE']] }, 1, 0] } },
          excused: { $max: { $cond: [{ $eq: ['$status', 'EXCUSED'] }, 1, 0] } },
        },
      },
      { $group: { _id: '$_id.s', attended: { $sum: '$attended' }, excused: { $sum: '$excused' } } },
    ]);
    const map = new Map(agg.map((a) => [a._id, a]));
    const rows = students
      .map((st) => {
        const a = map.get(st._id) || { attended: 0, excused: 0 };
        const denom = Math.max(wdays.length - a.excused, 0);
        return {
          student: { ...st, id: st._id, department: st.departmentId },
          attendedDays: a.attended,
          workingDays: denom,
          percentage: pct(a.attended, denom),
        };
      })
      .filter((r) => r.workingDays > 0 && r.percentage < th)
      .sort((a, b) => a.percentage - b.percentage)
      .slice(0, Number(limit) || 100);
    return { threshold: th, range: { from: isoDay(range.from), to: isoDay(range.to) }, workingDays: wdays.length, items: rows };
  },

  async heatmap({ days = 120, departmentId } = {}) {
    const n = Math.min(Math.max(Number(days) || 120, 7), 366);
    const range = await resolveRange(null, null, n);
    const match = { attendanceDate: { $gte: range.from, $lte: range.to }, status: { $in: ['PRESENT', 'LATE'] } };
    if (departmentId) match.studentId = { $in: await Student.find({ departmentId }).distinct('_id') };
    const rows = await Attendance.aggregate([
      { $match: match },
      { $group: { _id: '$attendanceDate', students: { $addToSet: '$studentId' } } },
      { $project: { count: { $size: '$students' } } },
    ]);
    const total = await Student.countDocuments({ status: 'ACTIVE', ...(departmentId ? { departmentId } : {}) });
    const map = new Map(rows.map((r) => [isoDay(r._id), r.count]));
    const out = [];
    for (let d = new Date(range.from); d <= range.to; d = addDays(d, 1)) {
      const c = map.get(isoDay(d)) || 0;
      out.push({ date: isoDay(d), count: c, percentage: pct(c, total) });
    }
    return { totalStudents: total, days: out };
  },

  async arrivals({ days = 30 } = {}) {
    const s = await settingsService.get();
    const range = await resolveRange(null, null, Number(days) || 30);
    const rows = await Attendance.aggregate([
      { $match: { attendanceDate: { $gte: range.from, $lte: range.to }, status: { $in: ['PRESENT', 'LATE'] }, source: { $ne: 'MANUAL' } } },
      {
        $project: {
          status: 1,
          h: { $hour: { date: '$markedAt', timezone: s.timezone } },
          m: { $minute: { date: '$markedAt', timezone: s.timezone } },
        },
      },
      { $project: { status: 1, bucket: { $add: [{ $multiply: ['$h', 60] }, { $multiply: [{ $floor: { $divide: ['$m', 15] } }, 15] }] } } },
      { $group: { _id: { b: '$bucket', s: '$status' }, n: { $sum: 1 } } },
    ]);
    const buckets = {};
    for (const r of rows) {
      const b = r._id.b;
      const label = `${String(Math.floor(b / 60)).padStart(2, '0')}:${String(b % 60).padStart(2, '0')}`;
      buckets[b] = buckets[b] || { time: label, minute: b, PRESENT: 0, LATE: 0 };
      buckets[b][r._id.s] += r.n;
    }
    return { lateCutoff: s.lateCutoff, items: Object.values(buckets).sort((a, b) => a.minute - b.minute) };
  },

  async departmentWise({ from, to } = {}) {
    const range = await resolveRange(from, to, 30);
    const wdays = (await workingDays(range.from, range.to)).length;
    const departments = await Department.find().lean();
    const out = [];
    for (const d of departments) {
      // eslint-disable-next-line no-await-in-loop
      const ids = await Student.find({ departmentId: d._id, status: 'ACTIVE' }).distinct('_id');
      // eslint-disable-next-line no-await-in-loop
      const attended = ids.length
        ? (
            await Attendance.aggregate([
              { $match: { studentId: { $in: ids }, attendanceDate: { $gte: range.from, $lte: range.to }, status: { $in: ['PRESENT', 'LATE'] } } },
              { $group: { _id: { s: '$studentId', d: '$attendanceDate' } } },
              { $count: 'n' },
            ])
          )[0]?.n || 0
        : 0;
      out.push({
        departmentId: d._id,
        name: d.name,
        code: d.code,
        totalStudents: ids.length,
        attendedStudentDays: attended,
        attendancePercentage: pct(attended, ids.length * wdays),
      });
    }
    return { range: { from: isoDay(range.from), to: isoDay(range.to) }, workingDays: wdays, departments: out };
  },

  async sources({ days = 30 } = {}) {
    const range = await resolveRange(null, null, Number(days) || 30);
    const [bySource, byDevice] = await Promise.all([
      Attendance.aggregate([{ $match: { attendanceDate: { $gte: range.from } } }, { $group: { _id: '$source', n: { $sum: 1 } } }]),
      Attendance.aggregate([
        { $match: { attendanceDate: { $gte: range.from }, deviceId: { $ne: null } } },
        { $group: { _id: '$deviceId', n: { $sum: 1 }, avgConfidence: { $avg: '$confidenceScore' } } },
        { $sort: { n: -1 } },
        { $limit: 10 },
      ]),
    ]);
    const devices = await Device.find({ _id: { $in: byDevice.map((d) => d._id) } }).select('deviceName deviceCode').lean();
    const dm = new Map(devices.map((d) => [d._id, d]));
    return {
      bySource: bySource.map((s) => ({ source: s._id, count: s.n })),
      byDevice: byDevice.map((d) => ({ device: dm.get(d._id) || { _id: d._id }, count: d.n, avgConfidence: d.avgConfidence && Math.round(d.avgConfidence * 1000) / 1000 })),
    };
  },

  async trend({ days = 14 } = {}) {
    const range = await resolveRange(null, null, Math.min(Math.max(Number(days) || 14, 1), 120));
    const rows = await Attendance.aggregate([
      { $match: { attendanceDate: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: { d: '$attendanceDate', s: '$status' }, n: { $sum: 1 } } },
    ]);
    const out = {};
    for (let d = new Date(range.from); d <= range.to; d = addDays(d, 1)) {
      out[isoDay(d)] = { date: isoDay(d), PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
    }
    for (const r of rows) {
      const k = isoDay(r._id.d);
      if (out[k]) out[k][r._id.s] = r.n;
    }
    return Object.values(out);
  },

  /** Current local-time context for the UI clock / greeting. */
  async now() {
    const s = await settingsService.get();
    return { timezone: s.timezone, ...partsInZone(new Date(), s.timezone), today: isoDay(localDateOnly(new Date(), s.timezone)) };
  },
};

module.exports = analyticsService;
