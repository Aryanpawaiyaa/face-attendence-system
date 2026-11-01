const ApiError = require('../utils/ApiError');
const attendanceRepository = require('../repositories/attendance.repository');
const studentRepository = require('../repositories/student.repository');
const notificationService = require('./notification.service');
const settingsService = require('./settings.service');
const realtime = require('./realtime.service');
const auditLogRepository = require('../repositories/auditLog.repository');
const { ClassSession, Device } = require('../models');
const { saveJpeg } = require('../utils/imageStore');
const logger = require('../config/logger');

function fullName(s) {
  return `${s.firstName} ${s.lastName}`.trim();
}

function raiseAttendanceAlert(record, studentName) {
  notificationService
    .createAttendanceAlert({
      attendanceId: record.id,
      studentName,
      status: record.status,
      courseId: record.courseId,
    })
    .catch((err) => logger.error({ err, attendanceId: record.id }, 'Failed to create attendance alert notification'));
}

/** Active session for an explicit id, or the one a device is attached to. */
async function resolveSession({ sessionId, deviceId }) {
  if (sessionId) {
    const s = await ClassSession.findById(sessionId).lean();
    if (!s) throw ApiError.notFound('Session not found');
    if (s.status !== 'ACTIVE') throw ApiError.badRequest('Session is not active');
    return s;
  }
  if (deviceId) {
    return ClassSession.findOne({ status: 'ACTIVE', deviceIds: deviceId }).sort({ startAt: -1 }).lean();
  }
  return null;
}

const attendanceService = {
  /**
   * Single entry point for every recognition source (AMB82 push, RTSP worker,
   * browser camera, kiosk, group photo, desktop recogniser).
   * Never throws for business outcomes - returns { code, ... } so callers can
   * map to HTTP or to per-face results.
   */
  async markRecognized({
    faceId,
    confidenceScore,
    device = null,
    sessionId = null,
    courseId = null,
    timestamp,
    liveness = null,
    snapshot = null,
    userId = null,
    source = 'DEVICE',
  }) {
    const student = await studentRepository.findByFaceId(faceId);
    if (!student) return { code: 'UNKNOWN_STUDENT', success: false, message: 'No student is registered against this faceId' };
    const name = fullName(student);
    if (student.status !== 'ACTIVE') {
      return { code: 'INACTIVE_STUDENT', success: false, studentName: name, message: `Student status is ${student.status}` };
    }

    const settings = await settingsService.get();
    if (liveness && liveness.checked && !liveness.live) {
      return { code: 'SPOOF_SUSPECTED', success: false, studentName: name, message: 'Anti-spoofing alert: Screen or photo attack prevented' };
    }

    const session = await resolveSession({ sessionId, deviceId: device?.id });
    const effectiveCourse = session?.courseId || courseId || device?.defaultCourseId || null;
    // Clamp device clocks: never trust a timestamp more than 5 min off server time
    let markedAt = timestamp ? new Date(timestamp) : new Date();
    if (Number.isNaN(markedAt.getTime()) || Math.abs(markedAt - Date.now()) > 5 * 60000) markedAt = new Date();

    if (!session && settings.blockOnHolidays) {
      const h = await settingsService.isHoliday(markedAt);
      if (h.holiday) return { code: 'HOLIDAY', success: false, studentName: name, message: `Attendance closed: ${h.name}` };
    }

    const attendanceDate = attendanceRepository.toDateOnly(markedAt);
    const existing = await attendanceRepository.findExisting({ studentId: student.id, courseId: effectiveCourse, attendanceDate });
    if (existing) {
      return {
        code: 'ALREADY_MARKED',
        success: true,
        duplicate: true,
        studentId: student.id,
        studentName: name,
        rollNumber: student.rollNumber,
        attendance: 'Already Marked',
        status: existing.status,
        markedAt: existing.markedAt,
      };
    }

    const status = await settingsService.classify(markedAt, session);
    const snapshotUrl = settings.saveSnapshots && snapshot ? await saveJpeg('snapshots', snapshot).catch(() => null) : null;

    let record;
    try {
      record = await attendanceRepository.create({
        studentId: student.id,
        courseId: effectiveCourse,
        deviceId: device?.id || null,
        sessionId: session?._id || null,
        status,
        source,
        confidenceScore: confidenceScore != null ? Number(confidenceScore) : null,
        livenessScore: liveness?.score ?? null,
        snapshotUrl,
        markedBy: userId,
        markedAt,
        attendanceDate,
      });
    } catch (err) {
      if (err.code === 'P2002') {
        return { code: 'ALREADY_MARKED', success: true, duplicate: true, studentName: name, attendance: 'Already Marked' };
      }
      throw err;
    }

    if (device?.id) Device.updateOne({ _id: device.id }, { $inc: { recognitions: 1 }, $set: { lastActiveAt: new Date() } }).catch(() => null);
    raiseAttendanceAlert(record, name);
    auditLogRepository
      .record({ userId, action: 'ATTENDANCE_MARKED', entity: 'Attendance', entityId: record.id, metadata: { faceId, confidenceScore, source, deviceId: device?.id } })
      .catch(() => null);

    realtime.publish('attendance', {
      id: record.id,
      studentId: student.id,
      studentName: name,
      rollNumber: student.rollNumber,
      photoUrl: student.photoUrl,
      status: record.status,
      source,
      confidence: confidenceScore,
      device: device ? { id: device.id, deviceName: device.deviceName, deviceCode: device.deviceCode } : null,
      sessionId: session?._id || null,
      snapshotUrl,
      markedAt: record.markedAt,
    });

    return {
      code: 'MARKED',
      success: true,
      duplicate: false,
      attendanceId: record.id,
      studentId: student.id,
      studentName: name,
      rollNumber: student.rollNumber,
      attendance: 'Marked',
      status: record.status,
      markedAt: record.markedAt,
    };
  },

  /** Backwards-compatible AMB82 / desktop-device flow (throws HTTP errors). */
  async markFromDevice({ device, faceId, confidenceScore, timestamp, courseId }) {
    const r = await attendanceService.markRecognized({ faceId, confidenceScore, device, timestamp, courseId, source: 'DEVICE' });
    if (r.code === 'UNKNOWN_STUDENT') throw ApiError.notFound(r.message);
    if (r.code === 'INACTIVE_STUDENT' || r.code === 'SPOOF_SUSPECTED') throw ApiError.forbidden(r.message);
    if (r.code === 'HOLIDAY') throw ApiError.conflict(r.message);
    return r;
  },

  /** Manual attendance entry (teacher/admin). */
  async markManual({ studentId, courseId, status = 'PRESENT', attendanceDate, sessionId, userId, reason }) {
    const student = await studentRepository.findById(studentId);
    if (!student) throw ApiError.notFound('Student not found');

    const normalizedDate = attendanceRepository.toDateOnly(attendanceDate || new Date());
    const existing = await attendanceRepository.findExisting({ studentId, courseId: courseId ?? null, attendanceDate: normalizedDate });
    if (existing) throw ApiError.conflict('Attendance for this student/date has already been marked');

    const record = await attendanceRepository.create({
      studentId,
      courseId: courseId ?? null,
      sessionId: sessionId || null,
      status,
      source: 'MANUAL',
      markedAt: new Date(),
      markedBy: userId || null,
      correctionReason: reason || null,
      attendanceDate: normalizedDate,
    });
    raiseAttendanceAlert(record, fullName(student));
    realtime.publish('attendance', {
      id: record.id,
      studentId,
      studentName: fullName(student),
      rollNumber: student.rollNumber,
      status,
      source: 'MANUAL',
      markedAt: record.markedAt,
    });
    return record;
  },

  /** Bulk manual marking (class roll-call screen). */
  async bulkMark({ entries = [], courseId, attendanceDate, sessionId, userId }) {
    const results = [];
    for (const e of entries) {
      try {
        const r = await attendanceService.markManual({ ...e, courseId: e.courseId ?? courseId, attendanceDate, sessionId, userId });
        results.push({ studentId: e.studentId, ok: true, id: r.id });
      } catch (err) {
        results.push({ studentId: e.studentId, ok: false, error: err.message });
      }
    }
    return { total: entries.length, succeeded: results.filter((r) => r.ok).length, results };
  },

  /** Correct an existing record with a mandatory reason (audited). */
  async correct(id, { status, reason }, user) {
    if (!reason || String(reason).trim().length < 3) throw ApiError.badRequest('A correction reason is required');
    const rec = await attendanceRepository.findById(id);
    if (!rec) throw ApiError.notFound('Attendance record not found');
    const updated = await attendanceRepository.update(id, {
      status,
      previousStatus: rec.status,
      correctedBy: user?.id || null,
      correctionReason: String(reason).trim(),
    });
    await auditLogRepository.record({
      userId: user?.id,
      action: 'ATTENDANCE_CORRECTED',
      entity: 'Attendance',
      entityId: id,
      metadata: { from: rec.status, to: status, reason },
    });
    realtime.publish('attendance', { id, studentId: updated.studentId, status, corrected: true });
    return updated;
  },

  async list({ page = 1, limit = 50, ...filters } = {}) {
    const { items, total } = await attendanceRepository.findMany({ ...filters, page, limit });
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  async today({ departmentId, courseId, page = 1, limit = 50 }) {
    const { items, total } = await attendanceRepository.findToday({ departmentId, courseId, page, limit });
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  async forStudent({ studentId, from, to, page = 1, limit = 50 }) {
    const student = await studentRepository.findById(studentId);
    if (!student) throw ApiError.notFound('Student not found');
    const { items, total } = await attendanceRepository.findByStudent({ studentId, from, to, page, limit });
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  /** Marks an entire date/day as a holiday for all active students. */
  async markDateHoliday({ attendanceDate = new Date().toISOString().slice(0, 10), departmentId = null, courseId = null, reason = 'Official Holiday', user = null }) {
    const students = await studentRepository.findMany({ departmentId, status: 'ACTIVE', limit: 1000 });
    const studentList = students.items || [];
    let count = 0;
    for (const s of studentList) {
      try {
        await attendanceService.markManual({
          studentId: s.id,
          courseId,
          attendanceDate,
          status: 'HOLIDAY',
          reason: String(reason).trim(),
          userId: user?.id,
        });
        count++;
      } catch (e) {
        // Continue if duplicate or error
      }
    }
    await auditLogRepository.record({
      userId: user?.id,
      action: 'ATTENDANCE_CORRECTED',
      entity: 'Attendance',
      metadata: { action: 'MARK_HOLIDAY', attendanceDate, count, reason },
    });
    return { success: true, count, attendanceDate, message: `Marked holiday for ${count} student(s)` };
  },

  /** Automatically flags entries arriving after late cutoff as LATE. */
  async autoMarkLate({ attendanceDate = new Date().toISOString().slice(0, 10), cutoffTime = '09:15', user = null }) {
    const { items } = await attendanceRepository.findMany({ date: attendanceDate, limit: 1000 });
    let count = 0;
    const [cutoffH, cutoffM] = cutoffTime.split(':').map(Number);
    const cutoffMinutes = cutoffH * 60 + cutoffM;

    for (const record of items) {
      if (record.status === 'PRESENT' && record.markedAt) {
        const time = new Date(record.markedAt);
        const entryMinutes = time.getHours() * 60 + time.getMinutes();
        if (entryMinutes > cutoffMinutes) {
          await attendanceRepository.update(record.id, {
            status: 'LATE',
            previousStatus: record.status,
            correctionReason: `Automatically classified as Late (arrived after ${cutoffTime})`,
            correctedBy: user?.id || null,
          });
          count++;
        }
      }
    }
    return { success: true, count, cutoffTime, message: `Automatically marked ${count} entry/entries as Late` };
  },
};

module.exports = attendanceService;
