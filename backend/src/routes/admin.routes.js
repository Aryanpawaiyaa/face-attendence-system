const express = require('express');
const adminController = require('../controllers/admin.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const {
  createRules,
  updateRules,
  idParamRule,
  listQueryRules,
} = require('../validators/admin.validator');

const router = express.Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

/**
 * @openapi
 * /admins:
 *   post:
 *     summary: Create an administrator account
 *     tags: [Admins]
 *     security: [{ bearerAuth: [] }]
 *   get:
 *     summary: List administrators
 *     tags: [Admins]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/', createRules, validate, adminController.create);
router.get('/', listQueryRules, validate, adminController.list);

/**
 * @openapi
 * /admins/{id}:
 *   get:
 *     summary: Get an administrator by id
 *     tags: [Admins]
 *     security: [{ bearerAuth: [] }]
 *   put:
 *     summary: Update an administrator
 *     tags: [Admins]
 *     security: [{ bearerAuth: [] }]
 *   delete:
 *     summary: Delete an administrator
 *     tags: [Admins]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', idParamRule, validate, adminController.getById);
router.put('/:id', updateRules, validate, adminController.update);
router.delete('/:id', idParamRule, validate, adminController.remove);

module.exports = router;
