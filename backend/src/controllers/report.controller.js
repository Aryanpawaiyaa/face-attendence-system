const reportService = require('../services/report.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const reportCsv = require('../utils/reportCsv');
const { streamCsv, buildCsvFilename } = require('../utils/csvWriter');
const { streamXlsx, buildXlsxFilename } = require('../utils/xlsxWriter');
const { streamPdf, buildPdfFilename, buildFilterEntries } = require('../utils/pdfWriter');

/** Reads `?format=` once, lower-cased, so all export checks below
 * agree on what the caller asked for. Anything other than 'csv',
 * 'xlsx', or 'pdf' (including no `format` at all) falls through to
 * the existing JSON response, so JSON behavior is unchanged. */
const exportFormat = (req) => String(req.query.format || '').toLowerCase();
const wantsCsv = (req) => exportFormat(req) === 'csv';
const wantsXlsx = (req) => exportFormat(req) === 'xlsx';
const wantsPdf = (req) => exportFormat(req) === 'pdf';

const reportController = {
  daily: asyncHandler(async (req, res) => {
    const { date, departmentId, courseId, page = 1, limit = 50 } = req.query;
    const result = await reportService.daily({ date, departmentId, courseId, page, limit });
    if (wantsCsv(req)) {
      return streamCsv(res, buildCsvFilename('daily-report'), reportCsv.daily(result));
    }
    if (wantsXlsx(req)) {
      return streamXlsx(res, buildXlsxFilename('daily-report'), reportCsv.daily(result), 'Daily Report');
    }
    if (wantsPdf(req)) {
      return streamPdf(res, buildPdfFilename('daily-report'), reportCsv.daily(result), {
        title: 'Daily Attendance Report',
        filters: buildFilterEntries(req.query),
      });
    }
    return new ApiResponse(200, result, 'Daily report retrieved').send(res);
  }),

  weekly: asyncHandler(async (req, res) => {
    const { date, departmentId, courseId } = req.query;
    const result = await reportService.weekly({ date, departmentId, courseId });
    if (wantsCsv(req)) {
      return streamCsv(res, buildCsvFilename('weekly-report'), reportCsv.breakdown(result));
    }
    if (wantsXlsx(req)) {
      return streamXlsx(res, buildXlsxFilename('weekly-report'), reportCsv.breakdown(result), 'Weekly Report');
    }
    if (wantsPdf(req)) {
      return streamPdf(res, buildPdfFilename('weekly-report'), reportCsv.breakdown(result), {
        title: 'Weekly Attendance Report',
        filters: buildFilterEntries(req.query),
      });
    }
    return new ApiResponse(200, result, 'Weekly report retrieved').send(res);
  }),

  monthly: asyncHandler(async (req, res) => {
    const { month, year, departmentId, courseId } = req.query;
    const result = await reportService.monthly({ month, year, departmentId, courseId });
    if (wantsCsv(req)) {
      return streamCsv(res, buildCsvFilename('monthly-report'), reportCsv.breakdown(result));
    }
    if (wantsXlsx(req)) {
      return streamXlsx(res, buildXlsxFilename('monthly-report'), reportCsv.breakdown(result), 'Monthly Report');
    }
    if (wantsPdf(req)) {
      return streamPdf(res, buildPdfFilename('monthly-report'), reportCsv.breakdown(result), {
        title: 'Monthly Attendance Report',
        filters: buildFilterEntries(req.query),
      });
    }
    return new ApiResponse(200, result, 'Monthly report retrieved').send(res);
  }),

  semester: asyncHandler(async (req, res) => {
    const { semester, departmentId, section, courseId, from, to, page = 1, limit = 50 } = req.query;
    const result = await reportService.semester({ semester, departmentId, section, courseId, from, to, page, limit });
    if (wantsCsv(req)) {
      return streamCsv(res, buildCsvFilename('semester-report'), reportCsv.studentPercentages(result));
    }
    if (wantsXlsx(req)) {
      return streamXlsx(
        res,
        buildXlsxFilename('semester-report'),
        reportCsv.studentPercentages(result),
        'Semester Report'
      );
    }
    if (wantsPdf(req)) {
      return streamPdf(res, buildPdfFilename('semester-report'), reportCsv.studentPercentages(result), {
        title: 'Semester Attendance Report',
        filters: buildFilterEntries(req.query),
      });
    }
    return new ApiResponse(200, result, 'Semester report retrieved').send(res);
  }),

  attendancePercentage: asyncHandler(async (req, res) => {
    const { departmentId, semester, section, courseId, from, to, page = 1, limit = 50 } = req.query;
    const result = await reportService.attendancePercentage({
      departmentId,
      semester,
      section,
      courseId,
      from,
      to,
      page,
      limit,
    });
    if (wantsCsv(req)) {
      return streamCsv(res, buildCsvFilename('attendance-percentage-report'), reportCsv.studentPercentages(result));
    }
    if (wantsXlsx(req)) {
      return streamXlsx(
        res,
        buildXlsxFilename('attendance-percentage-report'),
        reportCsv.studentPercentages(result),
        'Attendance Percentage'
      );
    }
    if (wantsPdf(req)) {
      return streamPdf(res, buildPdfFilename('attendance-percentage-report'), reportCsv.studentPercentages(result), {
        title: 'Attendance Percentage Report',
        filters: buildFilterEntries(req.query),
      });
    }
    return new ApiResponse(200, result, 'Attendance percentage report retrieved').send(res);
  }),

  forStudent: asyncHandler(async (req, res) => {
    const { from, to, page = 1, limit = 50 } = req.query;
    const result = await reportService.forStudent({ studentId: req.params.id, from, to, page, limit });
    if (wantsCsv(req)) {
      return streamCsv(res, buildCsvFilename(`student-${req.params.id}-report`), reportCsv.studentRecords(result));
    }
    if (wantsXlsx(req)) {
      return streamXlsx(
        res,
        buildXlsxFilename(`student-${req.params.id}-report`),
        reportCsv.studentRecords(result),
        'Student Report'
      );
    }
    if (wantsPdf(req)) {
      return streamPdf(res, buildPdfFilename(`student-${req.params.id}-report`), reportCsv.studentRecords(result), {
        title: 'Student Attendance Report',
        filters: buildFilterEntries(req.query, { extra: [{ label: 'studentId', value: req.params.id }] }),
      });
    }
    return new ApiResponse(200, result, 'Student report retrieved').send(res);
  }),

  forFaculty: asyncHandler(async (req, res) => {
    const { departmentId, from, to, page = 1, limit = 50 } = req.query;
    const result = await reportService.forFaculty({ facultyId: req.params.id, departmentId, from, to, page, limit });
    if (wantsCsv(req)) {
      return streamCsv(res, buildCsvFilename(`faculty-${req.params.id}-report`), reportCsv.facultyCourses(result));
    }
    if (wantsXlsx(req)) {
      return streamXlsx(
        res,
        buildXlsxFilename(`faculty-${req.params.id}-report`),
        reportCsv.facultyCourses(result),
        'Faculty Report'
      );
    }
    if (wantsPdf(req)) {
      return streamPdf(res, buildPdfFilename(`faculty-${req.params.id}-report`), reportCsv.facultyCourses(result), {
        title: 'Faculty Attendance Report',
        filters: buildFilterEntries(req.query, { extra: [{ label: 'facultyId', value: req.params.id }] }),
      });
    }
    return new ApiResponse(200, result, 'Faculty report retrieved').send(res);
  }),
};

module.exports = reportController;
