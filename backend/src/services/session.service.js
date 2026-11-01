/**
 * Class sessions: a teacher opens a live attendance window for a lecture,
 * binds cameras to it, and on close the system auto-marks absentees.
 */
const ApiError = require('../utils/ApiError');
const realtime = require('./realtime.service');
const attendanceRepository = require('../repositories/attendance.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const { ClassSession, Course, Student, Attendance, Device } = require('../models');
const logger = require('../config/logger');

function isAdmin(user) {
  return ['SUPER_ADMIN', 'ADMIN'].includes(user?.role);
}

async function eligibleStudentFilter(session) {
  const filter = { status: 'ACTIVE' };
  let departmentId = session.departmentId;
  let semester = session.semester;
  if (session.courseId) {
    const course = await Course.findById(session.courseId).lean();
    if (course) {
      departmentId = departmentId || course.departmentId;
      semester = semester || course.semester;
    }
  }
  if (departmentId) filter.departmentId = departmentId;
  if (semester) filter.semester = semester;
  if (session.section) filter.section = session.section;
  return filter;
}

async function computeStats(session) {
  const filter = await eligibleStudentFilter(session);
  const [expected, grouped] = await Promise.all([
    Student.countDocuments(filter),
    Attendance.aggregate([{ $match: { sessionId: session._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
  for (const g of grouped) counts[g._id] = g.n;
  const attended = counts.PRESENT + counts.LATE;
  return { expected, ...counts, attendancePercentage: expected ? Math.round((attended / expected) * 1000) / 10 : 0 };
}

const sessionService = {
  async start(data, user) {
    if (!data.title && !data.courseId) throw ApiError.badRequest('title or courseId is required');
    let title = data.title;
    if (data.courseId) {
      const course = await Course.findById(data.courseId).lean();
      if (!course) throw ApiError.badRequest('courseId does not exist');
      title = title || `${course.code} - ${course.name}`;
    }
    const deviceIds = Array.isArray(data.deviceIds) ? data.deviceIds : [];
    if (deviceIds.length) {
      const found = await Device.countDocuments({ _id: { $in: deviceIds } });
      if (found !== deviceIds.length) throw ApiError.badRequest('One or more deviceIds are invalid');
      // A camera can only feed one active session at a time
      await ClassSession.updateMany({ status: 'ACTIVE', deviceIds: { $in: deviceIds } }, { $pull: { deviceIds: { $in: deviceIds } } });
    }
    const startAt = new Date();
    const duration = Math.min(Math.max(Number(data.durationMinutes) || 60, 5), 600);
    const session = await ClassSession.create({
      title,
      courseId: data.courseId || null,
      departmentId: data.departmentId || null,
      semester: data.semester || null,
      section: data.section || null,
      room: data.room || null,
      teacherId: user.id,
      deviceIds,
      startAt,
      endAt: new Date(startAt.getTime() + duration * 60000),
      lateAfterMinutes: Number.isFinite(Number(data.lateAfterMinutes)) ? Number(data.lateAfterMinutes) : 10,
      autoMarkAbsent: data.autoMarkAbsent !== false,
      status: 'ACTIVE',
    });
    await auditLogRepository.record({ userId: user.id, action: 'SESSION_STARTED', entity: 'ClassSession', entityId: session._id });
    realtime.publish('session', { id: session._id, title, status: 'ACTIVE' });
    return sessionService.get(session._id);
  },

  async list({ status, page = 1, limit = 20, mine, user }) {
    const q = {};
    if (status) q.status = status;
    if (mine || (user && user.role === 'TEACHER')) q.teacherId = user.id;
    const [items, total] = await Promise.all([
      ClassSession.find(q)
        .sort({ startAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('courseId', 'name code')
        .populate('teacherId', 'firstName lastName')
        .lean({ virtuals: true }),
      ClassSession.countDocuments(q),
    ]);
    return { items: items.map((s) => ({ ...s, id: s._id })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  async active(user) {
    const q = { status: 'ACTIVE' };
    if (user?.role === 'TEACHER') q.teacherId = user.id;
    const items = await ClassSession.find(q).sort({ startAt: -1 }).populate('courseId', 'name code').lean();
    return Promise.all(items.map(async (s) => ({ ...s, id: s._id, stats: await computeStats(s) })));
  },

  async get(id) {
    const s = await ClassSession.findById(id)
      .populate('courseId', 'name code semester departmentId')
      .populate('teacherId', 'firstName lastName email')
      .populate('deviceIds', 'deviceName deviceCode')
      .lean();
    if (!s) throw ApiError.notFound('Session not found');
    const { items } = await attendanceRepository.findMany({ sessionId: s._id, page: 1, limit: 500 });
    const stats = s.status === 'CLOSED' && s.stats ? s.stats : await computeStats(s);
    return { ...s, id: s._id, stats, attendance: items };
  },

  async close(id, user, { system = false } = {}) {
    const s = await ClassSession.findById(id);
    if (!s) throw ApiError.notFound('Session not found');
    if (!system && !isAdmin(user) && s.teacherId !== user.id) throw ApiError.forbidden('You can only close your own sessions');
    if (s.status === 'CLOSED') return sessionService.get(id);

    let autoAbsent = 0;
    if (s.autoMarkAbsent) {
      const filter = await eligibleStudentFilter(s);
      const students = await Student.find(filter).select('_id').lean();
      const day = attendanceRepository.toDateOnly(s.startAt);
      const marked = await Attendance.find({ attendanceDate: day, courseId: s.courseId || null }).distinct('studentId');
      const markedSet = new Set(marked);
      const docs = students
        .filter((st) => !markedSet.has(st._id))
        .map((st) => ({
          studentId: st._id,
          courseId: s.courseId || null,
          sessionId: s._id,
          status: 'ABSENT',
          source: 'MANUAL',
          correctionReason: 'Auto-marked absent when session closed',
          markedAt: new Date(),
          attendanceDate: day,
        }));
      if (docs.length) {
        try {
          const res = await Attendance.insertMany(docs, { ordered: false });
          autoAbsent = res.length;
        } catch (err) {
          autoAbsent = err.insertedDocs?.length || 0;
          logger.warn({ err: err.message }, 'Some auto-absent records were skipped');
        }
      }
    }
    s.status = 'CLOSED';
    s.closedAt = new Date();
    s.stats = { ...(await computeStats(s)), autoAbsent };
    await s.save();
    await auditLogRepository.record({ userId: user?.id || null, action: 'SESSION_CLOSED', entity: 'ClassSession', entityId: s._id, metadata: s.stats });
    realtime.publish('session', { id: s._id, title: s.title, status: 'CLOSED', stats: s.stats });
    return sessionService.get(id);
  },

  /** Called every minute by the scheduler. */
  async closeExpired() {
    const expired = await ClassSession.find({ status: 'ACTIVE', endAt: { $lte: new Date() } }).select('_id').lean();
    for (const s of expired) {
      // eslint-disable-next-line no-await-in-loop
      await sessionService.close(s._id, null, { system: true }).catch((err) => logger.error({ err }, 'auto-close failed'));
    }
    return expired.length;
  },
};

module.exports = sessionService;
