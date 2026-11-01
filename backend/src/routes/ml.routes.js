/**
 * Authenticated gateway to the face-recognition service.
 * The Python service is never exposed directly to browsers.
 */
const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const mlClient = require('../services/mlClient');
const recognitionService = require('../services/recognition.service');

const router = express.Router();
const staff = authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER');
const SOURCES = ['WEB_CAMERA', 'KIOSK', 'GROUP_PHOTO', 'IP_CAMERA', 'AMB82_MINI', 'STREAM', 'DEVICE'];

router.use(authenticate);

/**
 * @openapi
 * /ml/status:
 *   get:
 *     summary: Model, gallery and camera-stream status of the face engine
 *     tags: [Face Recognition]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    try {
      const ml = await mlClient.status();
      return res.json({ success: true, online: true, ...ml.data });
    } catch (err) {
      return res.json({ success: false, online: false, status: 'offline', message: err.message });
    }
  })
);

/**
 * @openapi
 * /ml/recognize:
 *   post:
 *     summary: Recognise every face in a frame; optionally mark attendance
 *     tags: [Face Recognition]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image: { type: string, description: base64 / data URL JPEG }
 *               autoMark: { type: boolean }
 *               sessionId: { type: string }
 *               courseId: { type: string }
 *               source: { type: string, enum: [WEB_CAMERA, KIOSK, GROUP_PHOTO] }
 */
router.post(
  '/recognize',
  staff,
  body('image').isString().isLength({ min: 100 }).withMessage('image (base64) is required'),
  body('autoMark').optional().isBoolean(),
  body('sessionId').optional({ values: 'falsy' }).isString().trim(),
  body('courseId').optional({ values: 'falsy' }).isString().trim(),
  body('source').optional().isIn(SOURCES),
  validate,
  asyncHandler(async (req, res) => {
    const { image, autoMark = false, sessionId, courseId, source = 'WEB_CAMERA' } = req.body;
    const result = await recognitionService.recognizeImage({
      image,
      autoMark,
      sessionId,
      courseId,
      user: req.user,
      source,
      // Live camera: require 2 consistent frames. Group photo: single shot.
      requireConsistency: source !== 'GROUP_PHOTO',
      recordUnknowns: autoMark && source !== 'GROUP_PHOTO',
    });
    return new ApiResponse(200, result, `${result.faces.length} face(s) analysed`).send(res);
  })
);

router.post(
  '/reload',
  authorize('SUPER_ADMIN', 'ADMIN'),
  asyncHandler(async (req, res) => new ApiResponse(200, (await mlClient.reload()).data, 'Gallery reloaded').send(res))
);

/** Re-embeds all stored enrolment images - run after changing FACE_MODEL. */
router.post(
  '/rebuild',
  authorize('SUPER_ADMIN', 'ADMIN'),
  asyncHandler(async (req, res) => new ApiResponse(200, (await mlClient.rebuild()).data, 'Gallery rebuilt with current model').send(res))
);

router.get(
  '/identities',
  authorize('SUPER_ADMIN', 'ADMIN'),
  asyncHandler(async (req, res) => new ApiResponse(200, (await mlClient.identities()).data, 'Identities').send(res))
);

module.exports = router;
