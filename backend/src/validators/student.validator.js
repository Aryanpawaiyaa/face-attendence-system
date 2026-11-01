const { body, param, query } = require('express-validator');

const createRules = [
  body('rollNumber').isString().trim().notEmpty().withMessage('rollNumber is required'),
  body('firstName').isString().trim().notEmpty(),
  body('lastName').isString().trim().notEmpty(),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('email must be valid').normalizeEmail(),
  body('phone').optional().isString().trim(),
  body('departmentId').isString().trim().notEmpty().withMessage('departmentId is required and must be a valid id'),
  body('branch').optional().isString().trim(),
  body('semester').isInt({ min: 1, max: 12 }).withMessage('semester must be an integer between 1 and 12').toInt(),
  body('section').optional().isString().trim(),
  body('year').isInt({ min: 1, max: 2100 }).withMessage('year is required (year of study, e.g. 3)').toInt(),
  body('faceId').optional().isString().trim(),
  body('guardianEmail').optional({ values: 'falsy' }).isEmail().normalizeEmail(),
];

const updateRules = [
  param('id').isString().trim().notEmpty().withMessage('Invalid student id'),
  body('rollNumber').optional().isString().trim().notEmpty(),
  body('firstName').optional().isString().trim().notEmpty(),
  body('lastName').optional().isString().trim().notEmpty(),
  body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail(),
  body('phone').optional().isString().trim(),
  body('departmentId').optional({ values: 'falsy' }).isString().trim().notEmpty(),
  body('branch').optional().isString().trim(),
  body('semester').optional().isInt({ min: 1, max: 12 }).toInt(),
  body('section').optional().isString().trim(),
  body('year').optional().isInt({ min: 1, max: 2100 }).toInt(),
  body('faceId').optional().isString().trim(),
  body('guardianEmail').optional({ values: 'falsy' }).isEmail().normalizeEmail(),
  body('status').optional().isIn(['ACTIVE', 'INACTIVE', 'GRADUATED', 'SUSPENDED']),
];

const idParamRule = [param('id').isString().trim().notEmpty().withMessage('Invalid student id')];

const listQueryRules = [
  query('search').optional().isString().trim(),
  query('departmentId').optional({ values: 'falsy' }).isString().trim(),
  query('semester').optional().isInt({ min: 1, max: 12 }).toInt(),
  query('section').optional().isString().trim(),
  query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'GRADUATED', 'SUSPENDED']),
  query('faceEnrolled').optional().isIn(['true', 'false']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 500 }).toInt(),
];

module.exports = { createRules, updateRules, idParamRule, listQueryRules };
