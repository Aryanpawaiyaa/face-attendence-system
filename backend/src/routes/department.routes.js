const express = require('express');
const departmentController = require('../controllers/department.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const {
  createRules,
  updateRules,
  idParamRule,
  listQueryRules,
} = require('../validators/department.validator');

const router = express.Router();

router.use(authenticate);

/**
 * @openapi
 * /departments:
 *   post:
 *     summary: Create a department
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/DepartmentInput' }
 *     responses:
 *       201: { description: Department created }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/ValidationError' } } } }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN role }
 *       409: { description: Department code already exists }
 *   get:
 *     summary: List departments (paginated, searchable)
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Matches against department name/code
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200: { description: Paginated list of departments }
 *       401: { description: Not authenticated }
 */
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), createRules, validate, departmentController.create);
router.get('/', listQueryRules, validate, departmentController.list);

/**
 * @openapi
 * /departments/{id}:
 *   get:
 *     summary: Get a department by id
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Department found }
 *       401: { description: Not authenticated }
 *       404: { description: Department not found }
 *   put:
 *     summary: Update a department
 *     tags: [Departments]
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
 *           schema: { $ref: '#/components/schemas/DepartmentInput' }
 *     responses:
 *       200: { description: Department updated }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/ValidationError' } } } }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN role }
 *       404: { description: Department not found }
 *   delete:
 *     summary: Delete a department (only if it has no students assigned)
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Department deleted }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN role }
 *       409: { description: Department still has students assigned }
 */
router.get('/:id', idParamRule, validate, departmentController.getById);
router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  updateRules,
  validate,
  departmentController.update
);
router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  idParamRule,
  validate,
  departmentController.remove
);

module.exports = router;
