const { query } = require('express-validator');

const dateRangeQueryRules = [
  query('from').optional().isISO8601().withMessage('from must be a valid date'),
  query('to').optional().isISO8601().withMessage('to must be a valid date'),
];

const trendQueryRules = [
  query('days').optional().isInt({ min: 1, max: 90 }).toInt().withMessage('days must be between 1 and 90'),
];

const overviewQueryRules = [
  query('trendDays').optional().isInt({ min: 1, max: 90 }).toInt(),
];

const topAbsenteesQueryRules = [
  ...dateRangeQueryRules,
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];

const deviceHealthQueryRules = [
  query('staleMinutes').optional().isInt({ min: 1 }).toInt(),
];

module.exports = {
  dateRangeQueryRules,
  trendQueryRules,
  overviewQueryRules,
  topAbsenteesQueryRules,
  deviceHealthQueryRules,
};
