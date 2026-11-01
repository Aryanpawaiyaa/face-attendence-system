const express = require('express');
const deviceController = require('../controllers/device.controller');
const validate = require('../middleware/validate');
const { authenticate, authenticateFlexible, authorize } = require('../middleware/auth.middleware');
const authenticateDevice = require('../middleware/device.middleware');
const { registerRules, updateRules, idParamRule, listQueryRules, attendancePayloadRules } = require('../validators/device.validator');

const router = express.Router();
const admin = [authenticate, authorize('SUPER_ADMIN', 'ADMIN')];
const staff = [authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER')];

/**
 * @openapi
 * /devices/frame:
 *   post:
 *     summary: AMB82 Mini push mode - raw JPEG frame, server-side recognition + attendance
 *     tags: [Devices]
 *     security: []
 *     parameters:
 *       - { in: header, name: x-device-code, required: true, schema: { type: string } }
 *       - { in: header, name: x-device-api-key, required: true, schema: { type: string } }
 *     requestBody:
 *       content: { image/jpeg: { schema: { type: string, format: binary } } }
 *     responses:
 *       200: { description: "{ ok, faces, recognized, marked[], led }" }
 */
router.post('/frame', express.raw({ type: ['image/jpeg', 'image/jpg', 'application/octet-stream'], limit: '25mb' }), authenticateDevice, deviceController.submitFrame);
router.post('/verify', authenticateDevice, deviceController.verify);
router.post('/heartbeat', authenticateDevice, deviceController.heartbeat);
router.post('/attendance', authenticateDevice, attendancePayloadRules, validate, deviceController.submitAttendance);

router.post('/register', ...admin, registerRules, validate, deviceController.register);
router.get('/', authenticate, listQueryRules, validate, deviceController.list);
router.get('/:id', authenticate, idParamRule, validate, deviceController.getById);
router.put('/:id', ...admin, updateRules, validate, deviceController.update);
router.delete('/:id', ...admin, idParamRule, validate, deviceController.remove);
router.post('/:id/enable', ...admin, idParamRule, validate, deviceController.enable);
router.post('/:id/disable', ...admin, idParamRule, validate, deviceController.disable);
router.post('/:id/rotate-key', ...admin, idParamRule, validate, deviceController.rotateKey);
router.get('/:id/firmware-config', ...admin, idParamRule, validate, deviceController.firmwareConfig);

// RTSP / MJPEG pull streams (AMB82 StreamRTSP firmware or any IP camera)
router.post('/quick-connect', ...staff, deviceController.quickConnect);
router.post('/stream-frame', ...staff, deviceController.streamFrame);
router.get('/proxy-frame', authenticateFlexible, deviceController.proxyFrame);
router.get('/live-feed', authenticateFlexible, deviceController.liveFeed);

router.post('/:id/stream/start', ...staff, idParamRule, validate, deviceController.startStream);
router.post('/:id/stream/stop', ...staff, idParamRule, validate, deviceController.stopStream);
router.get('/:id/stream/status', authenticate, idParamRule, validate, deviceController.streamStatus);
router.get('/:id/stream/preview', authenticateFlexible, idParamRule, validate, deviceController.streamPreview);
router.get('/:id/stream/snapshot', authenticateFlexible, idParamRule, validate, deviceController.streamSnapshot);

module.exports = router;
