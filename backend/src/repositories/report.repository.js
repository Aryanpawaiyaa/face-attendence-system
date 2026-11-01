const { prisma } = require('../config/database');
const { toDateOnly } = require('./attendance.repository');

const STUDENT_SELECT = {
  id: true,
  rollNumber: true,
  firstName: true,
  lastName: true,
  departmentId: true,
  semester: true,
  section: true,
};

/** Inclusive day-count between two date-only values. */
function daysInRange(from, to) {
  return Math.max(Math.round((to - from) / 86400000) + 1, 1);
}

/** present+late / possible (students * calendar-days-in-range), capped at 100. Mirrors dashboard.repository's convention. */
function computePercentage(presentCount, possible) {
  return possible > 0 ? Math.min(Math.round((presentCount / possible) * 10000) / 100, 100) : 0;
}

const reportRepository = {
  daysInRange,
  computePercentage,

  /**
   * Raw attendance records for a single day, paginated, plus a status
   * breakdown for that day. Backs the daily report.
   */
  async getDailyRecords({ date, departmentId, courseId, page, limit }) {
    const where = {
      attendanceDate: date,
      ...(courseId ? { courseId } : {}),
      ...(departmentId ? { student: { departmentId } } : {}),
    };

    const [items, total, grouped] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { markedAt: 'desc' },
        include: {
          student: { select: STUDENT_SELECT },
          course: { select: { id: true, name: true, code: true } },
          device: { select: { id: true, deviceName: true, deviceCode: true } },
        },
      }),
      prisma.attendance.count({ where }),
      prisma.attendance.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);

    const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
    for (const row of grouped) counts[row.status] = row._count._all;

    return { items, total, counts };
  },

  /**
   * Day-by-day status breakdown across a range. Backs weekly/monthly
   * reports (service picks the range that corresponds to each).
   */
  async getDateBucketBreakdown({ from, to, departmentId, courseId }) {
    const where = {
      attendanceDate: { gte: from, lte: to },
      ...(courseId ? { courseId } : {}),
      ...(departmentId ? { student: { departmentId } } : {}),
    };

    const rows = await prisma.attendance.groupBy({
      by: ['attendanceDate', 'status'],
      where,
      _count: { _all: true },
    });

    const byDate = {};
    const days = daysInRange(from, to);
    for (let i = 0; i < days; i += 1) {
      const d = new Date(from.getTime() + i * 86400000);
      const key = d.toISOString().slice(0, 10);
      byDate[key] = { date: key, PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0, total: 0 };
    }
    for (const row of rows) {
      const key = row.attendanceDate.toISOString().slice(0, 10);
      if (!byDate[key]) continue;
      byDate[key][row.status] = row._count._all;
      byDate[key].total += row._count._all;
    }

    return Object.values(byDate);
  },

  /**
   * Overall status counts across a range (no per-day breakdown) plus
   * the count of distinct students who have at least one record.
   * Used for range-level summaries (weekly/monthly/semester headers).
   */
  async getRangeSummary({ from, to, departmentId, courseId }) {
    const where = {
      attendanceDate: { gte: from, lte: to },
      ...(courseId ? { courseId } : {}),
      ...(departmentId ? { student: { departmentId } } : {}),
    };

    const [grouped, distinctStudents] = await Promise.all([
      prisma.attendance.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.attendance.findMany({ where, select: { studentId: true }, distinct: ['studentId'] }),
    ]);

    const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
    for (const row of grouped) counts[row.status] = row._count._all;

    return { counts, studentsWithRecords: distinctStudents.length };
  },

  /**
   * Paginated attendance-percentage-per-student list, filtered by
   * department/semester/section/course and date range.
   * Backs the semester report and the general percentage endpoint.
   */
  async getStudentPercentages({ departmentId, semester, section, courseId, from, to, page, limit }) {
    const studentWhere = {
      status: 'ACTIVE',
      ...(departmentId ? { departmentId } : {}),
      ...(semester ? { semester } : {}),
      ...(section ? { section } : {}),
    };

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where: studentWhere,
        select: STUDENT_SELECT,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { rollNumber: 'asc' },
      }),
      prisma.student.count({ where: studentWhere }),
    ]);

    if (students.length === 0) {
      return { items: [], total };
    }

    const attendanceWhere = {
      studentId: { in: students.map((s) => s.id) },
      status: { in: ['PRESENT', 'LATE'] },
      attendanceDate: { gte: from, lte: to },
      ...(courseId ? { courseId } : {}),
    };

    const grouped = await prisma.attendance.groupBy({
      by: ['studentId'],
      where: attendanceWhere,
      _count: { _all: true },
    });
    const presentByStudent = Object.fromEntries(grouped.map((g) => [g.studentId, g._count._all]));

    const days = daysInRange(from, to);
    const items = students.map((student) => {
      const presentCount = presentByStudent[student.id] || 0;
      return {
        student,
        presentCount,
        possibleDays: days,
        attendancePercentage: computePercentage(presentCount, days),
      };
    });

    return { items, total };
  },

  /**
   * A single student's attendance records over a range (paginated) plus
   * unpaginated status counts for percentage calculation.
   */
  async getStudentRecords({ studentId, from, to, page, limit }) {
    const where = {
      studentId,
      attendanceDate: { gte: from, lte: to },
    };

    const [items, total, grouped] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { attendanceDate: 'desc' },
        include: {
          course: { select: { id: true, name: true, code: true } },
          device: { select: { id: true, deviceName: true } },
        },
      }),
      prisma.attendance.count({ where }),
      prisma.attendance.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);

    const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
    for (const row of grouped) counts[row.status] = row._count._all;

    return { items, total, counts };
  },

  /** Courses taught by a faculty member (User.id == Course.facultyId). */
  getFacultyCourses({ facultyId, departmentId }) {
    return prisma.course.findMany({
      where: {
        facultyId,
        ...(departmentId ? { departmentId } : {}),
      },
      select: { id: true, name: true, code: true, semester: true, departmentId: true, department: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Status counts + distinct-student count for one course over a range.
   * There's no course-enrollment table, so "students in the course" is
   * derived from who has an attendance record against it in-range.
   */
  async getCourseStats({ courseId, from, to }) {
    const where = { courseId, attendanceDate: { gte: from, lte: to } };

    const [grouped, distinctStudents] = await Promise.all([
      prisma.attendance.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.attendance.findMany({ where, select: { studentId: true }, distinct: ['studentId'] }),
    ]);

    const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
    for (const row of grouped) counts[row.status] = row._count._all;

    const presentCount = counts.PRESENT + counts.LATE;
    const days = daysInRange(from, to);
    const possible = distinctStudents.length * days;

    return {
      counts,
      studentsInvolved: distinctStudents.length,
      attendancePercentage: computePercentage(presentCount, possible),
    };
  },
};

module.exports = reportRepository;
