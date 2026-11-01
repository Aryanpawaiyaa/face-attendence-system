const { query, param } = require('express-validator');

const paginationRules = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
];

const dateRangeRules = [
  query('from').optional().isISO8601().withMessage('from must be a valid date'),
  query('to').optional().isISO8601().withMessage('to must be a valid date'),
];

const filterRules = [
  query('departmentId').optional({ values: 'falsy' }).isString().trim(),
  query('courseId').optional({ values: 'falsy' }).isString().trim(),
];

const formatRules = [
  query('format')
    .optional()
    .isIn(['json', 'csv', 'xlsx', 'pdf'])
    .withMessage('format must be one of json, csv, xlsx, pdf'),
];

const dailyReportRules = [
  query('date').optional().isISO8601().withMessage('date must be a valid date'),
  ...filterRules,
  ...paginationRules,
  ...formatRules,
];

const weeklyReportRules = [
  query('date').optional().isISO8601().withMessage('date must be a valid date (any day within the target week)'),
  ...filterRules,
  ...formatRules,
];

const monthlyReportRules = [
  query('month').optional().isInt({ min: 1, max: 12 }).toInt(),
  query('year').optional().isInt({ min: 2000, max: 2100 }).toInt(),
  ...filterRules,
  ...formatRules,
];

const semesterReportRules = [
  query('semester').isInt({ min: 1, max: 12 }).toInt().withMessage('semester is required and must be a valid semester number'),
  query('section').optional().isString().trim(),
  ...filterRules,
  ...dateRangeRules,
  ...paginationRules,
  ...formatRules,
];

const attendancePercentageRules = [
  query('semester').optional().isInt({ min: 1, max: 12 }).toInt(),
  query('section').optional().isString().trim(),
  ...filterRules,
  ...dateRangeRules,
  ...paginationRules,
  ...formatRules,
];

const studentParamRule = [param('id').isString().trim().notEmpty().withMessage('Invalid student id')];
const facultyParamRule = [param('id').isString().trim().notEmpty().withMessage('Invalid faculty id')];

const studentReportQueryRules = [...dateRangeRules, ...paginationRules, ...formatRules];

const facultyReportQueryRules = [
  query('departmentId').optional({ values: 'falsy' }).isString().trim(),
  ...dateRangeRules,
  ...paginationRules,
  ...formatRules,
];

module.exports = {
  dailyReportRules,
  weeklyReportRules,
  monthlyReportRules,
  semesterReportRules,
  attendancePercentageRules,
  studentParamRule,
  facultyParamRule,
  studentReportQueryRules,
  facultyReportQueryRules,
};
