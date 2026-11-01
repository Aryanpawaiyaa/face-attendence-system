const ApiError = require('../utils/ApiError');
const reportRepository = require('../repositories/report.repository');
const studentRepository = require('../repositories/student.repository');
const userRepository = require('../repositories/user.repository');
const { toDateOnly } = require('../repositories/attendance.repository');

const MAX_LIMIT = 200;

function paginate(page = 1, limit = 50) {
  const p = Math.max(Number(page) || 1, 1);
  const l = Math.min(Math.max(Number(limit) || 50, 1), MAX_LIMIT);
  return { page: p, limit: l };
}

function paginationMeta(total, page, limit) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) || 0 };
}

/** Resolves an optional from/to pair to a default "last 30 days" window. */
function resolveRange(from, to) {
  const resolvedTo = to ? toDateOnly(to) : toDateOnly(new Date());
  const resolvedFrom = from ? toDateOnly(from) : toDateOnly(new Date(resolvedTo.getTime() - 29 * 86400000));
  return { from: resolvedFrom, to: resolvedTo };
}

/** Monday-to-Sunday week (UTC) containing the given date. */
function resolveWeek(date) {
  const d = toDateOnly(date || new Date());
  const dayOfWeek = d.getUTCDay(); // 0 = Sunday
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const from = toDateOnly(new Date(d.getTime() - diffToMonday * 86400000));
  const to = toDateOnly(new Date(from.getTime() + 6 * 86400000));
  return { from, to };
}

/** Calendar month (UTC) for the given month (1-12) / year. */
function resolveMonth(month, year) {
  const now = new Date();
  const y = year ? Number(year) : now.getUTCFullYear();
  const m = month ? Number(month) : now.getUTCMonth() + 1; // 1-12
  const from = toDateOnly(new Date(Date.UTC(y, m - 1, 1)));
  const to = toDateOnly(new Date(Date.UTC(y, m, 0))); // last day of month
  return { from, to };
}

const reportService = {
  resolveRange,
  resolveWeek,
  resolveMonth,

  /** Daily report: raw records for one calendar day + status breakdown. */
  async daily({ date, departmentId, courseId, page, limit }) {
    const { page: p, limit: l } = paginate(page, limit);
    const target = toDateOnly(date || new Date());

    const { items, total, counts } = await reportRepository.getDailyRecords({
      date: target,
      departmentId,
      courseId,
      page: p,
      limit: l,
    });

    return {
      date: target,
      counts,
      items,
      pagination: paginationMeta(total, p, l),
    };
  },

  /** Weekly report: Mon-Sun breakdown containing the given date. */
  async weekly({ date, departmentId, courseId }) {
    const range = resolveWeek(date);
    const [breakdown, summary] = await Promise.all([
      reportRepository.getDateBucketBreakdown({ ...range, departmentId, courseId }),
      reportRepository.getRangeSummary({ ...range, departmentId, courseId }),
    ]);

    return { range, counts: summary.counts, studentsWithRecords: summary.studentsWithRecords, breakdown };
  },

  /** Monthly report: day-by-day breakdown for a calendar month. */
  async monthly({ month, year, departmentId, courseId }) {
    const range = resolveMonth(month, year);
    const [breakdown, summary] = await Promise.all([
      reportRepository.getDateBucketBreakdown({ ...range, departmentId, courseId }),
      reportRepository.getRangeSummary({ ...range, departmentId, courseId }),
    ]);

    return { range, counts: summary.counts, studentsWithRecords: summary.studentsWithRecords, breakdown };
  },

  /**
   * Semester report: attendance percentage per student, filtered by
   * Student.semester (and optionally department/section), over a date
   * range (defaults to last 30 days — there's no semester calendar in
   * the schema, so the caller supplies from/to to bound the term).
   */
  async semester({ semester, departmentId, section, courseId, from, to, page, limit }) {
    if (!semester) throw ApiError.badRequest('semester is required');
    const { page: p, limit: l } = paginate(page, limit);
    const range = resolveRange(from, to);

    const { items, total } = await reportRepository.getStudentPercentages({
      departmentId,
      semester: Number(semester),
      section,
      courseId,
      ...range,
      page: p,
      limit: l,
    });

    return { semester: Number(semester), range, items, pagination: paginationMeta(total, p, l) };
  },

  /** General attendance-percentage listing, filtered by department/course/date-range. */
  async attendancePercentage({ departmentId, semester, section, courseId, from, to, page, limit }) {
    const { page: p, limit: l } = paginate(page, limit);
    const range = resolveRange(from, to);

    const { items, total } = await reportRepository.getStudentPercentages({
      departmentId,
      semester: semester ? Number(semester) : undefined,
      section,
      courseId,
      ...range,
      page: p,
      limit: l,
    });

    return { range, items, pagination: paginationMeta(total, p, l) };
  },

  /** Per-student report: profile + counts + percentage + paginated record history. */
  async forStudent({ studentId, from, to, page, limit }) {
    const student = await studentRepository.findById(studentId);
    if (!student) throw ApiError.notFound('Student not found');

    const { page: p, limit: l } = paginate(page, limit);
    const range = resolveRange(from, to);

    const { items, total, counts } = await reportRepository.getStudentRecords({
      studentId,
      ...range,
      page: p,
      limit: l,
    });

    const presentCount = counts.PRESENT + counts.LATE;
    const days = reportRepository.daysInRange(range.from, range.to);
    const attendancePercentage = reportRepository.computePercentage(presentCount, days);

    return {
      student: {
        id: student.id,
        rollNumber: student.rollNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        department: student.department,
        semester: student.semester,
        section: student.section,
      },
      range,
      counts,
      attendancePercentage,
      items,
      pagination: paginationMeta(total, p, l),
    };
  },

  /** Per-faculty report: courses taught + per-course stats + overall aggregate. */
  async forFaculty({ facultyId, departmentId, from, to, page, limit }) {
    const faculty = await userRepository.findById(facultyId);
    if (!faculty) throw ApiError.notFound('Faculty member not found');

    const { page: p, limit: l } = paginate(page, limit);
    const range = resolveRange(from, to);

    const allCourses = await reportRepository.getFacultyCourses({ facultyId, departmentId });
    const total = allCourses.length;
    const pageCourses = allCourses.slice((p - 1) * l, (p - 1) * l + l);

    const courseStats = await Promise.all(
      pageCourses.map(async (course) => ({
        course,
        ...(await reportRepository.getCourseStats({ courseId: course.id, ...range })),
      }))
    );

    const overall = courseStats.reduce(
      (acc, c) => {
        acc.PRESENT += c.counts.PRESENT;
        acc.LATE += c.counts.LATE;
        acc.ABSENT += c.counts.ABSENT;
        acc.EXCUSED += c.counts.EXCUSED;
        return acc;
      },
      { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 }
    );

    return {
      faculty: { id: faculty.id, firstName: faculty.firstName, lastName: faculty.lastName, email: faculty.email },
      range,
      totalCourses: total,
      courses: courseStats,
      overallCounts: overall,
      pagination: paginationMeta(total, p, l),
    };
  },
};

module.exports = reportService;
