const attendanceService = require('../services/attendance.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { streamCsv, buildCsvFilename } = require('../utils/csvWriter');

const attendanceController = {
  markManual: asyncHandler(async (req, res) => {
    const record = await attendanceService.markManual({ ...req.body, userId: req.user.id });
    return new ApiResponse(201, record, 'Attendance marked').send(res);
  }),

  bulk: asyncHandler(async (req, res) => {
    const result = await attendanceService.bulkMark({ ...req.body, userId: req.user.id });
    return new ApiResponse(200, result, `${result.succeeded}/${result.total} marked`).send(res);
  }),

  correct: asyncHandler(async (req, res) => {
    const record = await attendanceService.correct(req.params.id, req.body, req.user);
    return new ApiResponse(200, record, 'Attendance corrected').send(res);
  }),

  list: asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, departmentId, courseId, sessionId, status, source, from, to, date, search } = req.query;
    const filters = { departmentId, courseId, sessionId, status, source, from, to, date, search };
    if (String(req.query.format).toLowerCase() === 'csv') {
      const { items } = await attendanceService.list({ ...filters, page: 1, limit: 5000 });
      const rows = items.map((r) => ({
        date: new Date(r.attendanceDate).toISOString().slice(0, 10),
        markedAt: new Date(r.markedAt).toISOString(),
        rollNumber: r.student?.rollNumber || '',
        name: r.student ? `${r.student.firstName} ${r.student.lastName}` : '',
        status: r.status,
        source: r.source,
        confidence: r.confidenceScore ?? '',
        course: r.course?.code || '',
        device: r.device?.deviceCode || '',
        correctionReason: r.correctionReason || '',
      }));
      const headers = ['date', 'markedAt', 'rollNumber', 'name', 'status', 'source', 'confidence', 'course', 'device', 'correctionReason'];
      return streamCsv(res, buildCsvFilename('attendance'), { headers, rows: rows.map((r) => headers.map((h) => r[h])) });
    }
    const result = await attendanceService.list({ ...filters, page, limit });
    return new ApiResponse(200, result, 'Attendance list retrieved').send(res);
  }),

  today: asyncHandler(async (req, res) => {
    const { departmentId, courseId, page = 1, limit = 50 } = req.query;
    return new ApiResponse(200, await attendanceService.today({ departmentId, courseId, page, limit }), "Today's attendance retrieved").send(res);
  }),

  forStudent: asyncHandler(async (req, res) => {
    const { from, to, page = 1, limit = 50 } = req.query;
    const result = await attendanceService.forStudent({ studentId: req.params.id, from, to, page, limit });
    return new ApiResponse(200, result, 'Student attendance history retrieved').send(res);
  }),

  markHoliday: asyncHandler(async (req, res) => {
    const result = await attendanceService.markDateHoliday({ ...req.body, user: req.user });
    return new ApiResponse(200, result, result.message).send(res);
  }),

  autoLate: asyncHandler(async (req, res) => {
    const result = await attendanceService.autoMarkLate({ ...req.body, user: req.user });
    return new ApiResponse(200, result, result.message).send(res);
  }),
};

module.exports = attendanceController;
