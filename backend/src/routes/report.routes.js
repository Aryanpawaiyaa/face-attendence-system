const express = require('express');
const reportController = require('../controllers/report.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const {
  dailyReportRules,
  weeklyReportRules,
  monthlyReportRules,
  semesterReportRules,
  attendancePercentageRules,
  studentParamRule,
  facultyParamRule,
  studentReportQueryRules,
  facultyReportQueryRules,
} = require('../validators/report.validator');

const router = express.Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'));

/**
 * @openapi
 * /reports/daily:
 *   get:
 *     summary: Daily attendance report — records for one calendar day + status breakdown
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: departmentId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: courseId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
 *     responses:
 *       200: { description: Daily report retrieved }
 */
router.get('/daily', dailyReportRules, validate, reportController.daily);

/**
 * @openapi
 * /reports/weekly:
 *   get:
 *     summary: Weekly attendance report (Mon-Sun) containing the given date — day-by-day breakdown
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: departmentId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: courseId
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Weekly report retrieved }
 */
router.get('/weekly', weeklyReportRules, validate, reportController.weekly);

/**
 * @openapi
 * /reports/monthly:
 *   get:
 *     summary: Monthly attendance report — day-by-day breakdown for a calendar month
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: year
 *         schema: { type: integer, minimum: 2000, maximum: 2100 }
 *       - in: query
 *         name: departmentId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: courseId
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Monthly report retrieved }
 */
router.get('/monthly', monthlyReportRules, validate, reportController.monthly);

/**
 * @openapi
 * /reports/semester:
 *   get:
 *     summary: Semester report — per-student attendance percentage filtered by semester, paginated
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: semester
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: departmentId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: section
 *         schema: { type: string }
 *       - in: query
 *         name: courseId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
 *     responses:
 *       200: { description: Semester report retrieved }
 */
router.get('/semester', semesterReportRules, validate, reportController.semester);

/**
 * @openapi
 * /reports/attendance-percentage:
 *   get:
 *     summary: General attendance-percentage-per-student listing, filtered by department/course/semester/date-range
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: departmentId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: semester
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: section
 *         schema: { type: string }
 *       - in: query
 *         name: courseId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
 *     responses:
 *       200: { description: Attendance percentage report retrieved }
 */
router.get('/attendance-percentage', attendancePercentageRules, validate, reportController.attendancePercentage);

/**
 * @openapi
 * /reports/student/{id}:
 *   get:
 *     summary: Per-student report — profile, status counts, attendance percentage, paginated history
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
 *     responses:
 *       200: { description: Student report retrieved }
 *       404: { description: Student not found }
 */
router.get('/student/:id', studentParamRule, studentReportQueryRules, validate, reportController.forStudent);

/**
 * @openapi
 * /reports/faculty/{id}:
 *   get:
 *     summary: Per-faculty report — courses taught, per-course attendance stats, overall aggregate
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: departmentId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
 *     responses:
 *       200: { description: Faculty report retrieved }
 *       404: { description: Faculty member not found }
 */
router.get('/faculty/:id', facultyParamRule, facultyReportQueryRules, validate, reportController.forFaculty);

module.exports = router;
