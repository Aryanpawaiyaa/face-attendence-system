const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const settingsService = require('../services/settings.service');
const auditLogRepository = require('../repositories/auditLog.repository');
const deviceService = require('../services/device.service');

const router = express.Router();
router.use(authenticate);
const admin = authorize('SUPER_ADMIN', 'ADMIN');

/**
 * @openapi
 * /settings:
 *   get: { summary: Institution policy (late cut-off, threshold, working days...), tags: [Settings], security: [{ bearerAuth: [] }] }
 *   put: { summary: Update policy (admin), tags: [Settings], security: [{ bearerAuth: [] }] }
 */
router.get('/', asyncHandler(async (req, res) => new ApiResponse(200, await settingsService.get(), 'Settings').send(res)));

router.put(
  '/',
  admin,
  body('institutionName').optional().isString().trim().isLength({ min: 2, max: 120 }),
  body('lateCutoff').optional().matches(/^\d{1,2}:\d{2}$/),
  body('recognitionThreshold').optional().isFloat({ min: 0.2, max: 0.95 }).toFloat(),
  body('minAttendancePercent').optional().isInt({ min: 1, max: 100 }).toInt(),
  body('workingDays').optional().isArray(),
  body('workingDays.*').optional().isInt({ min: 0, max: 6 }).toInt(),
  body('blockOnHolidays').optional().isBoolean(),
  body('requireLiveness').optional().isBoolean(),
  body('saveSnapshots').optional().isBoolean(),
  body('unknownFaceAlerts').optional().isBoolean(),
  body('deviceOfflineMinutes').optional().isInt({ min: 1, max: 1440 }).toInt(),
  validate,
  asyncHandler(async (req, res) => {
    const before = await settingsService.get();
    const s = await settingsService.update(req.body);
    // Running camera streams captured threshold/liveness at start - restart them
    if (before.recognitionThreshold !== s.recognitionThreshold || before.requireLiveness !== s.requireLiveness) {
      deviceService.restoreStreams().catch(() => null);
    }
    await auditLogRepository.record({ userId: req.user.id, action: 'SETTINGS_UPDATED', entity: 'Setting', entityId: 'global', metadata: req.body });
    return new ApiResponse(200, s, 'Settings updated').send(res);
  })
);

router.get('/holidays', asyncHandler(async (req, res) => new ApiResponse(200, await settingsService.listHolidays(req.query), 'Holidays').send(res)));

router.post(
  '/holidays',
  admin,
  body('date').isISO8601(),
  body('name').isString().trim().notEmpty().isLength({ max: 120 }),
  body('type').optional().isIn(['PUBLIC', 'INSTITUTE', 'EXAM', 'OTHER']),
  validate,
  asyncHandler(async (req, res) => new ApiResponse(201, await settingsService.addHoliday(req.body), 'Holiday added').send(res))
);

router.delete(
  '/holidays/:id',
  admin,
  param('id').isString(),
  validate,
  asyncHandler(async (req, res) => {
    await settingsService.removeHoliday(req.params.id);
    return new ApiResponse(200, null, 'Holiday removed').send(res);
  })
);

module.exports = router;
