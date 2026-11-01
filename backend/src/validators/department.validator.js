const { body, param, query } = require('express-validator');

const createRules = [
  body('name').isString().trim().notEmpty().withMessage('name is required'),
  body('code').isString().trim().notEmpty().withMessage('code is required').isLength({ max: 20 }),
  body('description').optional().isString().trim(),
];

const updateRules = [
  param('id').isString().trim().notEmpty().withMessage('Invalid department id'),
  body('name').optional().isString().trim().notEmpty(),
  body('code').optional().isString().trim().notEmpty().isLength({ max: 20 }),
  body('description').optional().isString().trim(),
];

const idParamRule = [param('id').isString().trim().notEmpty().withMessage('Invalid department id')];

const listQueryRules = [
  query('search').optional().isString().trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = { createRules, updateRules, idParamRule, listQueryRules };
