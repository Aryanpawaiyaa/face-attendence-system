const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { UnknownFace } = require('../models');
const faceEnrollmentService = require('../services/faceEnrollment.service');
const { readAsBase64 } = require('../utils/imageStore');

const router = express.Router();
router.use(authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'));

/**
 * @openapi
 * /unknown-faces:
 *   get:
 *     summary: Review queue of unrecognised faces captured by cameras
 *     tags: [Unknown Faces]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  query('status').optional().isIn(['PENDING', 'RESOLVED', 'DISMISSED']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validate,
  asyncHandler(async (req, res) => {
    const { status = 'PENDING', page = 1, limit = 24 } = req.query;
    const q = { status };
    const [items, total] = await Promise.all([
      UnknownFace.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('deviceId', 'deviceName deviceCode').populate('resolvedStudentId', 'firstName lastName rollNumber').lean(),
      UnknownFace.countDocuments(q),
    ]);
    return new ApiResponse(200, { items: items.map((i) => ({ ...i, id: i._id })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }, 'Unknown faces').send(res);
  })
);

/** Assign an unknown capture to a student; optionally add it to their face template. */
router.post(
  '/:id/resolve',
  param('id').isString().trim().notEmpty().withMessage('Invalid unknown face id'),
  body('studentId').isString().trim().notEmpty().withMessage('Invalid student id'),
  body('enroll').optional().isBoolean(),
  validate,
  asyncHandler(async (req, res) => {
    const doc = await UnknownFace.findById(req.params.id);
    if (!doc) throw ApiError.notFound('Unknown face not found');
    let enrollment = null;
    if (req.body.enroll && doc.snapshotUrl) {
      const b64 = await readAsBase64(doc.snapshotUrl);
      if (!b64) throw ApiError.badRequest('Snapshot file is missing');
      enrollment = await faceEnrollmentService.enroll(req.body.studentId, { images: [b64] }, req.user);
    }
    doc.status = 'RESOLVED';
    doc.resolvedStudentId = req.body.studentId;
    doc.resolvedBy = req.user.id;
    await doc.save();
    return new ApiResponse(200, { unknownFace: doc.toObject(), enrollment }, 'Resolved').send(res);
  })
);

router.post(
  '/:id/dismiss',
  param('id').isString().trim().notEmpty().withMessage('Invalid unknown face id'),
  validate,
  asyncHandler(async (req, res) => {
    const r = await UnknownFace.updateOne({ _id: req.params.id }, { $set: { status: 'DISMISSED', resolvedBy: req.user.id } });
    if (!r.matchedCount) throw ApiError.notFound('Unknown face not found');
    return new ApiResponse(200, null, 'Dismissed').send(res);
  })
);

router.delete(
  '/purge',
  authorize('SUPER_ADMIN', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const days = Math.max(Number(req.query.olderThanDays) || 30, 1);
    const r = await UnknownFace.deleteMany({ createdAt: { $lt: new Date(Date.now() - days * 86400000) } });
    return new ApiResponse(200, { deleted: r.deletedCount }, 'Purged').send(res);
  })
);

module.exports = router;
