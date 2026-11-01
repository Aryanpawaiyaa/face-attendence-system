const { body, param, query } = require('express-validator');

const createRules = [
  body('firstName').isString().trim().notEmpty().withMessage('First name is required'),
  body('lastName').isString().trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('phone').optional().isString().trim(),
  body('role')
    .optional()
    .isIn(['ADMIN', 'SUPER_ADMIN'])
    .withMessage('Role must be ADMIN or SUPER_ADMIN'),
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
];

const updateRules = [
  param('id').isString().trim().notEmpty().withMessage('Invalid admin id'),
  body('firstName').optional().isString().trim().notEmpty(),
  body('lastName').optional().isString().trim().notEmpty(),
  body('phone').optional().isString().trim(),
  body('role').optional().isIn(['ADMIN', 'SUPER_ADMIN']).withMessage('Role must be ADMIN or SUPER_ADMIN'),
  body('status').optional().isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED']).withMessage('Invalid status'),
  body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
];

const idParamRule = [param('id').isString().trim().notEmpty().withMessage('Invalid admin id')];

const listQueryRules = [
  query('search').optional().isString().trim(),
  query('role').optional().isIn(['ADMIN', 'SUPER_ADMIN']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = {
  createRules,
  updateRules,
  idParamRule,
  listQueryRules,
};
