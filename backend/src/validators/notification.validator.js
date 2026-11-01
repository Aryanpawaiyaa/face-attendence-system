const { body, param, query } = require('express-validator');

const NOTIFICATION_TYPES = ['ATTENDANCE_ALERT', 'DEVICE_OFFLINE', 'SYSTEM', 'UNKNOWN_FACE', 'LOW_ATTENDANCE'];
const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'SMS'];

const createRules = [
  body('userId')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .notEmpty()
    .withMessage('userId must be a valid id'),
  body('type')
    .isString()
    .notEmpty()
    .withMessage('type is required')
    .isIn(NOTIFICATION_TYPES)
    .withMessage(`type must be one of: ${NOTIFICATION_TYPES.join(', ')}`),
  body('channel')
    .optional()
    .isIn(NOTIFICATION_CHANNELS)
    .withMessage(`channel must be one of: ${NOTIFICATION_CHANNELS.join(', ')}`),
  body('title')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('title is required')
    .isLength({ max: 150 })
    .withMessage('title must be at most 150 characters'),
  body('message')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('message is required')
    .isLength({ max: 1000 })
    .withMessage('message must be at most 1000 characters'),
];

const listQueryRules = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('unread').optional().isBoolean().withMessage('unread must be true or false').toBoolean(),
];

const idParamRule = [param('id').isString().trim().notEmpty().withMessage('Invalid notification id')];

module.exports = { createRules, listQueryRules, idParamRule };
