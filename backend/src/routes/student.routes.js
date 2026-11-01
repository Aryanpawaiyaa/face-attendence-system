const express = require('express');
const studentController = require('../controllers/student.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { uploadStudentPhoto } = require('../config/upload');
const {
  createRules,
  updateRules,
  idParamRule,
  listQueryRules,
} = require('../validators/student.validator');

const router = express.Router();

router.use(authenticate);

/**
 * @openapi
 * /students:
 *   post:
 *     summary: Add a student (multipart/form-data; optional "photo" file field)
 *     tags: [Students]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema: { $ref: '#/components/schemas/StudentInput' }
 *     responses:
 *       201: { description: Student created }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/ValidationError' } } } }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN/TEACHER role }
 *       409: { description: rollNumber, email, or faceId already in use }
 *   get:
 *     summary: List/search students (paginated, filterable by department/semester/section/status)
 *     tags: [Students]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: departmentId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: semester
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: section
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE, GRADUATED, SUSPENDED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200: { description: Paginated list of students }
 *       401: { description: Not authenticated }
 */
router.post(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'),
  uploadStudentPhoto.single('photo'),
  createRules,
  validate,
  studentController.create
);
router.get('/', listQueryRules, validate, studentController.list);

/**
 * @openapi
 * /students/{id}:
 *   get:
 *     summary: Get a student's profile by id
 *     tags: [Students]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Student found }
 *       401: { description: Not authenticated }
 *       404: { description: Student not found }
 *   put:
 *     summary: Update a student (multipart/form-data; optional new "photo" replaces the old one)
 *     tags: [Students]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/StudentInput'
 *               - type: object
 *                 properties:
 *                   status: { type: string, enum: [ACTIVE, INACTIVE, GRADUATED, SUSPENDED] }
 *     responses:
 *       200: { description: Student updated }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/ValidationError' } } } }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN/TEACHER role }
 *       404: { description: Student not found }
 *   delete:
 *     summary: Delete a student (blocked if attendance history exists — use status change instead)
 *     tags: [Students]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Student deleted }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN role }
 *       409: { description: Student has attendance history }
 */
router.get('/:id', idParamRule, validate, studentController.getById);
router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'),
  uploadStudentPhoto.single('photo'),
  updateRules,
  validate,
  studentController.update
);
router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  idParamRule,
  validate,
  studentController.remove
);

module.exports = router;
