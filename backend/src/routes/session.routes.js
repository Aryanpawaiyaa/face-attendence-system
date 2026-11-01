const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const sessionService = require('../services/session.service');

const router = express.Router();
router.use(authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'));

/**
 * @openapi
 * /sessions:
 *   post:
 *     summary: Start a live class session (binds cameras, late-after window, auto-absent on close)
 *     tags: [Sessions]
 *     security: [{ bearerAuth: [] }]
 *   get:
 *     summary: List sessions (teachers see their own)
 *     tags: [Sessions]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/',
  body('title').optional().isString().trim().isLength({ max: 120 }),
  body('courseId').optional({ values: 'falsy' }).isString().trim(),
  body('departmentId').optional({ values: 'falsy' }).isString().trim(),
  body('semester').optional({ values: 'falsy' }).isInt({ min: 1, max: 12 }).toInt(),
  body('section').optional().isString().trim(),
  body('room').optional().isString().trim(),
  body('deviceIds').optional().isArray(),
  body('deviceIds.*').optional().isString().trim(),
  body('durationMinutes').optional().isInt({ min: 5, max: 600 }).toInt(),
  body('lateAfterMinutes').optional().isInt({ min: 0, max: 180 }).toInt(),
  body('autoMarkAbsent').optional().isBoolean().toBoolean(),
  validate,
  asyncHandler(async (req, res) => new ApiResponse(201, await sessionService.start(req.body, req.user), 'Session started').send(res))
);

router.get(
  '/',
  query('status').optional().isIn(['SCHEDULED', 'ACTIVE', 'CLOSED']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validate,
  asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    return new ApiResponse(200, await sessionService.list({ status, page, limit, user: req.user }), 'Sessions').send(res);
  })
);

router.get('/active', asyncHandler(async (req, res) => new ApiResponse(200, await sessionService.active(req.user), 'Active sessions').send(res)));

router.get(
  '/:id',
  param('id').isString().trim().notEmpty().withMessage('Invalid session id'),
  validate,
  asyncHandler(async (req, res) => new ApiResponse(200, await sessionService.get(req.params.id), 'Session').send(res))
);

router.post(
  '/:id/close',
  param('id').isString().trim().notEmpty().withMessage('Invalid session id'),
  validate,
  asyncHandler(async (req, res) => new ApiResponse(200, await sessionService.close(req.params.id, req.user), 'Session closed').send(res))
);

module.exports = router;
