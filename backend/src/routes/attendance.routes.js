const express = require('express');
const attendanceController = require('../controllers/attendance.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const {
  manualMarkRules,
  bulkRules,
  correctRules,
  listQueryRules,
  todayQueryRules,
  studentParamRule,
  studentHistoryQueryRules,
} = require('../validators/attendance.validator');

const router = express.Router();
const staff = authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER');

router.use(authenticate);

/**
 * @openapi
 * /attendance:
 *   get:
 *     summary: Search attendance (filters - date/from/to/status/source/course/session/search). Add ?format=csv to export.
 *     tags: [Attendance]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Paginated attendance } }
 */
router.get('/', listQueryRules, validate, attendanceController.list);
router.get('/today', todayQueryRules, validate, attendanceController.today);
router.get('/student/:id', studentParamRule, studentHistoryQueryRules, validate, attendanceController.forStudent);

router.post('/mark', staff, manualMarkRules, validate, attendanceController.markManual);
/**
 * @openapi
 * /attendance/bulk:
 *   post:
 *     summary: Roll-call - mark many students at once
 *     tags: [Attendance]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/bulk', staff, bulkRules, validate, attendanceController.bulk);
/**
 * @openapi
 * /attendance/{id}:
 *   patch:
 *     summary: Correct an attendance record (reason required, fully audited)
 *     tags: [Attendance]
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/:id', staff, correctRules, validate, attendanceController.correct);
router.post('/holiday', staff, attendanceController.markHoliday);
router.post('/auto-late', staff, attendanceController.autoLate);

module.exports = router;
