const express = require('express');
const teacherController = require('../controllers/teacher.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const {
  createRules,
  updateRules,
  idParamRule,
  listQueryRules,
} = require('../validators/teacher.validator');

const router = express.Router();

router.use(authenticate);

/**
 * @openapi
 * /teachers:
 *   post:
 *     summary: Add a teacher (creates a linked user account with a temporary password)
 *     tags: [Teachers]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TeacherInput' }
 *     responses:
 *       201: { description: Teacher created }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/ValidationError' } } } }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN role }
 *       409: { description: Email or employee id already in use }
 *   get:
 *     summary: List/search teachers (paginated)
 *     tags: [Teachers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: departmentId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200: { description: Paginated list of teachers }
 *       401: { description: Not authenticated }
 */
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), createRules, validate, teacherController.create);
router.get('/', listQueryRules, validate, teacherController.list);

/**
 * @openapi
 * /teachers/{id}:
 *   get:
 *     summary: Get a teacher by id
 *     tags: [Teachers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Teacher found }
 *       401: { description: Not authenticated }
 *       404: { description: Teacher not found }
 *   put:
 *     summary: Update a teacher
 *     tags: [Teachers]
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
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phone: { type: string }
 *               departmentId: { type: string, format: uuid }
 *               designation: { type: string }
 *     responses:
 *       200: { description: Teacher updated }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/ValidationError' } } } }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN role }
 *       404: { description: Teacher not found }
 *   delete:
 *     summary: Remove a teacher (deactivates the linked user account)
 *     tags: [Teachers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Teacher removed }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN role }
 *       404: { description: Teacher not found }
 */
router.get('/:id', idParamRule, validate, teacherController.getById);
router.put('/:id', authorize('SUPER_ADMIN', 'ADMIN'), updateRules, validate, teacherController.update);
router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  idParamRule,
  validate,
  teacherController.remove
);

module.exports = router;
