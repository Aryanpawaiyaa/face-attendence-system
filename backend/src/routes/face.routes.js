/**
 * Student face enrolment + CSV import routes, mounted under /api/students
 * BEFORE the generic student router so /import and /:id/face resolve here.
 */
const express = require('express');
const multer = require('multer');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const faceEnrollmentService = require('../services/faceEnrollment.service');
const studentImportService = require('../services/studentImport.service');
const auditLogRepository = require('../repositories/auditLog.repository');

const router = express.Router();
const staff = authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER');
const memory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 30 } });

router.use(authenticate);

router.get('/import/template', staff, (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="students-template.csv"');
  res.send(studentImportService.template());
});

/**
 * @openapi
 * /students/import:
 *   post:
 *     summary: Bulk import students from CSV (multipart field "file"); ?dryRun=true validates only
 *     tags: [Students]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/import',
  authorize('SUPER_ADMIN', 'ADMIN'),
  memory.single('file'),
  asyncHandler(async (req, res) => {
    const text = req.file ? req.file.buffer.toString('utf8') : req.body?.csv;
    if (!text) throw ApiError.badRequest('Upload a CSV file in field "file"');
    const result = await studentImportService.importCsv(text, { dryRun: String(req.query.dryRun) === 'true' });
    if (!result.dryRun) {
      await auditLogRepository.record({ userId: req.user.id, action: 'STUDENTS_IMPORTED', entity: 'Student', metadata: { created: result.created, failed: result.failed } });
    }
    return new ApiResponse(200, result, `${result.created} student(s) imported`).send(res);
  })
);

/** Live enrolment guidance - returns quality issues for a single webcam frame. */
router.post(
  '/face/quality',
  staff,
  body('image').isString().notEmpty(),
  validate,
  asyncHandler(async (req, res) => new ApiResponse(200, await faceEnrollmentService.quality(req.body.image), 'Quality checked').send(res))
);

router.post('/face/sync', authorize('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => new ApiResponse(200, await faceEnrollmentService.syncStatus(), 'Synced').send(res)));

/**
 * @openapi
 * /students/{id}/face:
 *   post:
 *     summary: Teacher enrols a student's face. JSON {images:[base64...], replace?} or multipart "images" files.
 *     tags: [Face Enrollment]
 *     security: [{ bearerAuth: [] }]
 *   delete:
 *     summary: Remove a student's face template
 *     tags: [Face Enrollment]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/:id/face',
  staff,
  memory.array('images', 20),
  param('id').isString().trim().notEmpty(),
  validate,
  asyncHandler(async (req, res) => {
    let images = Array.isArray(req.body.images) ? req.body.images : [];
    if (req.files && req.files.length) images = req.files.map((f) => f.buffer.toString('base64'));
    const truthy = (v) => v === true || v === 'true';
    const result = await faceEnrollmentService.enroll(
      req.params.id,
      { images, replace: truthy(req.body.replace), force: truthy(req.body.force) },
      req.user
    );
    return new ApiResponse(200, result, `${result.accepted} sample(s) enrolled, ${result.rejected} rejected`).send(res);
  })
);

router.delete(
  '/:id/face',
  staff,
  param('id').isString().trim().notEmpty(),
  validate,
  asyncHandler(async (req, res) => new ApiResponse(200, await faceEnrollmentService.remove(req.params.id, req.user), 'Face template removed').send(res))
);

module.exports = router;
