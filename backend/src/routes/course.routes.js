const express = require('express');
const courseController = require('../controllers/course.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const {
  createRules,
  updateRules,
  idParamRule,
  listQueryRules,
  assignFacultyRules,
  mapSemesterRules,
} = require('../validators/course.validator');

const router = express.Router();

router.use(authenticate);

/**
 * @openapi
 * /courses:
 *   post:
 *     summary: Add a course
 *     tags: [Courses]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CourseInput' }
 *     responses:
 *       201: { description: Course created }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/ValidationError' } } } }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN role }
 *       409: { description: Course code already exists }
 *   get:
 *     summary: List/search courses (filterable by department/semester/faculty)
 *     tags: [Courses]
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
 *         name: facultyId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200: { description: Paginated list of courses }
 *       401: { description: Not authenticated }
 */
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), createRules, validate, courseController.create);
router.get('/', listQueryRules, validate, courseController.list);

/**
 * @openapi
 * /courses/{id}:
 *   get:
 *     summary: Get a course by id
 *     tags: [Courses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Course found }
 *       401: { description: Not authenticated }
 *       404: { description: Course not found }
 *   put:
 *     summary: Update a course
 *     tags: [Courses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CourseInput' }
 *     responses:
 *       200: { description: Course updated }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/ValidationError' } } } }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN role }
 *       404: { description: Course not found }
 *   delete:
 *     summary: Delete a course (blocked if attendance records reference it)
 *     tags: [Courses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Course deleted }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN role }
 *       409: { description: Attendance records still reference this course }
 */
router.get('/:id', idParamRule, validate, courseController.getById);
router.put('/:id', authorize('SUPER_ADMIN', 'ADMIN'), updateRules, validate, courseController.update);
router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  idParamRule,
  validate,
  courseController.remove
);

/**
 * @openapi
 * /courses/{id}/assign-faculty:
 *   post:
 *     summary: Assign a faculty member (teacher/admin) to a course
 *     tags: [Courses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [facultyId]
 *             properties:
 *               facultyId: { type: string, format: uuid }
 *     responses:
 *       200: { description: Faculty assigned }
 *       400: { description: facultyId does not reference a valid teacher/admin }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN role }
 *       404: { description: Course not found }
 */
router.post(
  '/:id/assign-faculty',
  authorize('SUPER_ADMIN', 'ADMIN'),
  assignFacultyRules,
  validate,
  courseController.assignFaculty
);

/**
 * @openapi
 * /courses/{id}/semester:
 *   put:
 *     summary: Update the semester mapping for a course
 *     tags: [Courses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [semester]
 *             properties:
 *               semester: { type: integer, minimum: 1, maximum: 12 }
 *     responses:
 *       200: { description: Semester mapping updated }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/ValidationError' } } } }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN role }
 *       404: { description: Course not found }
 */
router.put(
  '/:id/semester',
  authorize('SUPER_ADMIN', 'ADMIN'),
  mapSemesterRules,
  validate,
  courseController.mapSemester
);

module.exports = router;
