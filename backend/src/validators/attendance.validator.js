const { body, param, query } = require('express-validator');

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'HOLIDAY'];

const manualMarkRules = [
  body('studentId').isString().trim().notEmpty().withMessage('studentId is required and must be a valid id'),
  body('courseId').optional({ values: 'falsy' }).isString().trim(),
  body('sessionId').optional({ values: 'falsy' }).isString().trim(),
  body('status').optional().isIn(STATUSES),
  body('attendanceDate').optional().isISO8601().withMessage('attendanceDate must be a valid date'),
  body('reason').optional().isString().trim().isLength({ max: 300 }),
];

const bulkRules = [
  body('entries').isArray({ min: 1, max: 500 }).withMessage('entries must be a non-empty array'),
  body('entries.*.studentId').isString().trim().notEmpty(),
  body('entries.*.status').isIn(STATUSES),
  body('courseId').optional({ values: 'falsy' }).isString().trim(),
  body('sessionId').optional({ values: 'falsy' }).isString().trim(),
  body('attendanceDate').optional().isISO8601(),
];

const correctRules = [
  param('id').isString().trim().notEmpty().withMessage('Invalid attendance id'),
  body('status').isIn(STATUSES),
  body('reason').isString().trim().isLength({ min: 3, max: 300 }).withMessage('reason (3-300 chars) is required'),
];

const todayQueryRules = [
  query('departmentId').optional({ values: 'falsy' }).isString().trim(),
  query('courseId').optional({ values: 'falsy' }).isString().trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
];

const studentParamRule = [param('id').isString().trim().notEmpty().withMessage('Invalid student id')];

const studentHistoryQueryRules = [
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
];

const listQueryRules = [
  query('departmentId').optional({ values: 'falsy' }).isString().trim(),
  query('courseId').optional({ values: 'falsy' }).isString().trim(),
  query('sessionId').optional({ values: 'falsy' }).isString().trim(),
  query('status').optional().isIn(STATUSES),
  query('source').optional().isString(),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('date').optional().isISO8601(),
  query('search').optional().isString().trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
];

module.exports = { manualMarkRules, bulkRules, correctRules, listQueryRules, todayQueryRules, studentParamRule, studentHistoryQueryRules };
