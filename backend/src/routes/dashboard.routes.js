const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const {
  dateRangeQueryRules,
  trendQueryRules,
  overviewQueryRules,
  topAbsenteesQueryRules,
  deviceHealthQueryRules,
} = require('../validators/dashboard.validator');

const router = express.Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'));

/**
 * @openapi
 * /dashboard/overview:
 *   get:
 *     summary: Combined dashboard payload (totals, today, department-wise %, trend, top absentees, device health)
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: trendDays
 *         schema: { type: integer, minimum: 1, maximum: 90 }
 *     responses:
 *       200: { description: Full dashboard overview retrieved }
 */
router.get('/overview', overviewQueryRules, validate, dashboardController.overview);

/**
 * @openapi
 * /dashboard/summary:
 *   get:
 *     summary: Entity totals and today's present/absent/late/excused counts
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Summary retrieved }
 */
router.get('/summary', dashboardController.summary);

/**
 * @openapi
 * /dashboard/department-wise:
 *   get:
 *     summary: Attendance percentage per department over a date range (defaults to last 30 days)
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: Department-wise attendance retrieved }
 */
router.get('/department-wise', dateRangeQueryRules, validate, dashboardController.departmentWise);

/**
 * @openapi
 * /dashboard/trend:
 *   get:
 *     summary: Day-by-day present/late/absent/excused counts for the last N days (for charts)
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, minimum: 1, maximum: 90, default: 7 }
 *     responses:
 *       200: { description: Trend data retrieved }
 */
router.get('/trend', trendQueryRules, validate, dashboardController.trend);

/**
 * @openapi
 * /dashboard/top-absentees:
 *   get:
 *     summary: Students with the most absences over a date range (defaults to last 30 days)
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *     responses:
 *       200: { description: Top absentees retrieved }
 */
router.get('/top-absentees', topAbsenteesQueryRules, validate, dashboardController.topAbsentees);

/**
 * @openapi
 * /dashboard/device-health:
 *   get:
 *     summary: Device status list, flagging devices with no recent heartbeat/attendance activity
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: staleMinutes
 *         schema: { type: integer, minimum: 1, default: 30 }
 *     responses:
 *       200: { description: Device health retrieved }
 */
router.get('/device-health', deviceHealthQueryRules, validate, dashboardController.deviceHealth);

module.exports = router;
