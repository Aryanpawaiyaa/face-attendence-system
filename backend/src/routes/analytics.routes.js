const express = require('express');
const { param, query } = require('express-validator');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const analytics = require('../services/analytics.service');

const router = express.Router();
router.use(authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'));

const range = [query('from').optional().isISO8601(), query('to').optional().isISO8601()];

/**
 * @openapi
 * /analytics/at-risk:
 *   get:
 *     summary: Students below the minimum attendance % (working-day based)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/at-risk', ...range, query('departmentId').optional({ values: 'falsy' }).isString().trim(), query('threshold').optional().isFloat({ min: 1, max: 100 }), validate,
  asyncHandler(async (req, res) => new ApiResponse(200, await analytics.atRisk(req.query), 'At-risk students').send(res)));

router.get('/student/:id', param('id').isString().trim().notEmpty().withMessage('Invalid student id'), ...range, validate,
  asyncHandler(async (req, res) => new ApiResponse(200, await analytics.studentSummary(req.params.id, req.query), 'Student analytics').send(res)));

router.get('/heatmap', query('days').optional().isInt({ min: 7, max: 366 }), query('departmentId').optional({ values: 'falsy' }).isString().trim(), validate,
  asyncHandler(async (req, res) => new ApiResponse(200, await analytics.heatmap(req.query), 'Heatmap').send(res)));

router.get('/arrivals', query('days').optional().isInt({ min: 1, max: 365 }), validate,
  asyncHandler(async (req, res) => new ApiResponse(200, await analytics.arrivals(req.query), 'Arrival distribution').send(res)));

router.get('/departments', ...range, validate,
  asyncHandler(async (req, res) => new ApiResponse(200, await analytics.departmentWise(req.query), 'Department analytics').send(res)));

router.get('/sources', query('days').optional().isInt({ min: 1, max: 365 }), validate,
  asyncHandler(async (req, res) => new ApiResponse(200, await analytics.sources(req.query), 'Source analytics').send(res)));

router.get('/trend', query('days').optional().isInt({ min: 1, max: 120 }), validate,
  asyncHandler(async (req, res) => new ApiResponse(200, await analytics.trend(req.query), 'Trend').send(res)));

router.get('/now', asyncHandler(async (req, res) => new ApiResponse(200, await analytics.now(), 'Clock').send(res)));

module.exports = router;
