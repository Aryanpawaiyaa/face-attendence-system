const { param, query } = require('express-validator');

const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGOUT',
  'LOGIN_FAILED',
  'ATTENDANCE_MARKED',
  'ATTENDANCE_REJECTED',
  'DEVICE_REGISTERED',
  'DEVICE_REQUEST',
  'DEVICE_HEARTBEAT',
  'ADMIN_ACTION',
  'ERROR',
];

const listQueryRules = [
  query('userId').optional({ values: 'falsy' }).isString().trim(),
  query('action')
    .optional()
    .isIn(AUDIT_ACTIONS)
    .withMessage(`action must be one of: ${AUDIT_ACTIONS.join(', ')}`),
  query('from').optional().isISO8601().withMessage('from must be a valid ISO 8601 date'),
  query('to').optional().isISO8601().withMessage('to must be a valid ISO 8601 date'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
];

const idParamRule = [param('id').isString().trim().notEmpty().withMessage('Invalid audit log id')];

module.exports = { listQueryRules, idParamRule };
