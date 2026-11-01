const { body, param, query } = require('express-validator');

const CAMERA_TYPES = ['AMB82_MINI', 'IP_CAMERA', 'WEBCAM', 'OTHER'];
const MODES = ['PUSH', 'RTSP', 'MJPEG'];

const streamUrlRule = (field) =>
  body(field)
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .matches(/^(rtsp|rtsps|http|https):\/\/[^\s]+$|^\d+$/)
    .withMessage('streamUrl must be rtsp://, http(s):// or a webcam index');

const registerRules = [
  body('deviceName').isString().trim().notEmpty().withMessage('deviceName is required'),
  body('deviceCode')
    .isString()
    .trim()
    .matches(/^[A-Za-z0-9_-]{3,40}$/)
    .withMessage('deviceCode: 3-40 chars, letters/digits/_/-'),
  body('building').optional().isString().trim(),
  body('room').optional().isString().trim(),
  body('cameraType').optional().isIn(CAMERA_TYPES),
  body('connectionMode').optional().isIn(MODES),
  streamUrlRule('streamUrl'),
  body('ipAddress').optional({ values: 'falsy' }).isIP(),
  body('defaultCourseId').optional({ values: 'falsy' }).isString().trim(),
];

const updateRules = [
  param('id').isString().trim().notEmpty().withMessage('Invalid device id'),
  body('deviceName').optional().isString().trim().notEmpty(),
  body('building').optional().isString().trim(),
  body('room').optional().isString().trim(),
  body('cameraType').optional().isIn(CAMERA_TYPES),
  body('connectionMode').optional().isIn(MODES),
  streamUrlRule('streamUrl'),
  body('ipAddress').optional({ values: 'falsy' }).isIP(),
  body('defaultCourseId').optional({ values: 'falsy' }).isString().trim(),
  body('status').optional().isIn(['ACTIVE', 'INACTIVE', 'MAINTENANCE']),
];

const idParamRule = [param('id').isString().trim().notEmpty().withMessage('Invalid device id')];

const listQueryRules = [
  query('search').optional().isString().trim(),
  query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'MAINTENANCE']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const attendancePayloadRules = [
  body('faceId').isString().trim().notEmpty().withMessage('faceId is required'),
  body('confidenceScore').isFloat({ min: 0, max: 1 }).withMessage('confidenceScore must be between 0 and 1').toFloat(),
  body('timestamp').optional().isISO8601().withMessage('timestamp must be a valid ISO8601 date'),
  body('courseId').optional({ values: 'falsy' }).isString().trim(),
];

module.exports = { registerRules, updateRules, idParamRule, listQueryRules, attendancePayloadRules };
