/**
 * Flattens the result objects already produced by report.service.js
 * into `{ headers, rows }` tables. No database access or business
 * logic happens here — this module only reshapes data the service
 * already computed, so pagination/filtering stays identical across
 * the JSON, CSV, and XLSX responses.
 *
 * Despite the filename, these builders are format-agnostic: both
 * csvWriter.js (?format=csv) and xlsxWriter.js (?format=xlsx) consume
 * the same `{ headers, rows }` tables produced here.
 */

function formatDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

const reportCsv = {
  /** reportService.daily() result -> one row per attendance record. */
  daily(result) {
    const headers = [
      'attendanceDate',
      'rollNumber',
      'firstName',
      'lastName',
      'departmentId',
      'semester',
      'section',
      'courseName',
      'courseCode',
      'deviceName',
      'deviceCode',
      'status',
      'markedAt',
    ];
    const rows = result.items.map((r) => [
      formatDate(result.date),
      r.student?.rollNumber,
      r.student?.firstName,
      r.student?.lastName,
      r.student?.departmentId,
      r.student?.semester,
      r.student?.section,
      r.course?.name,
      r.course?.code,
      r.device?.deviceName,
      r.device?.deviceCode,
      r.status,
      formatDateTime(r.markedAt),
    ]);
    return { headers, rows };
  },

  /** reportService.weekly() / monthly() result -> one row per day in the range. */
  breakdown(result) {
    const headers = ['date', 'PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'total'];
    const rows = result.breakdown.map((b) => [b.date, b.PRESENT, b.LATE, b.ABSENT, b.EXCUSED, b.total]);
    return { headers, rows };
  },

  /** reportService.semester() / attendancePercentage() result -> one row per student. */
  studentPercentages(result) {
    const headers = [
      'rollNumber',
      'firstName',
      'lastName',
      'departmentId',
      'semester',
      'section',
      'presentCount',
      'possibleDays',
      'attendancePercentage',
    ];
    const rows = result.items.map((i) => [
      i.student.rollNumber,
      i.student.firstName,
      i.student.lastName,
      i.student.departmentId,
      i.student.semester,
      i.student.section,
      i.presentCount,
      i.possibleDays,
      i.attendancePercentage,
    ]);
    return { headers, rows };
  },

  /** reportService.forStudent() result -> one row per attendance record. */
  studentRecords(result) {
    const headers = ['attendanceDate', 'courseName', 'courseCode', 'deviceName', 'status', 'markedAt'];
    const rows = result.items.map((r) => [
      formatDate(r.attendanceDate),
      r.course?.name,
      r.course?.code,
      r.device?.deviceName,
      r.status,
      formatDateTime(r.markedAt),
    ]);
    return { headers, rows };
  },

  /** reportService.forFaculty() result -> one row per course taught. */
  facultyCourses(result) {
    const headers = [
      'courseName',
      'courseCode',
      'departmentId',
      'departmentName',
      'semester',
      'PRESENT',
      'LATE',
      'ABSENT',
      'EXCUSED',
      'studentsInvolved',
      'attendancePercentage',
    ];
    const rows = result.courses.map((c) => [
      c.course.name,
      c.course.code,
      c.course.departmentId,
      c.course.department?.name,
      c.course.semester,
      c.counts.PRESENT,
      c.counts.LATE,
      c.counts.ABSENT,
      c.counts.EXCUSED,
      c.studentsInvolved,
      c.attendancePercentage,
    ]);
    return { headers, rows };
  },
};

module.exports = reportCsv;
