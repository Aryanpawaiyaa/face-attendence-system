const { body, param, query } = require('express-validator');

const createRules = [
  body('firstName').isString().trim().notEmpty(),
  body('lastName').isString().trim().notEmpty(),
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('phone').optional().isString().trim(),
  body('employeeId').isString().trim().notEmpty(),
  body('departmentId').optional({ values: 'falsy' }).isString().trim().notEmpty().withMessage('departmentId must be a valid id'),
  body('designation').optional().isString().trim(),
];

const updateRules = [
  param('id').isString().trim().notEmpty().withMessage('Invalid teacher id'),
  body('firstName').optional().isString().trim().notEmpty(),
  body('lastName').optional().isString().trim().notEmpty(),
  body('phone').optional().isString().trim(),
  body('departmentId').optional({ values: 'falsy' }).isString().trim().notEmpty(),
  body('designation').optional().isString().trim(),
];

const idParamRule = [param('id').isString().trim().notEmpty().withMessage('Invalid teacher id')];

const listQueryRules = [
  query('search').optional().isString().trim(),
  query('departmentId').optional({ values: 'falsy' }).isString().trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = { createRules, updateRules, idParamRule, listQueryRules };
