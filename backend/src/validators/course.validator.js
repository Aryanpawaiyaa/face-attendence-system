const { body, param, query } = require('express-validator');

const createRules = [
  body('name').isString().trim().notEmpty().withMessage('name is required'),
  body('code').isString().trim().notEmpty().withMessage('code is required'),
  body('semester').isInt({ min: 1, max: 12 }).withMessage('semester must be an integer between 1 and 12').toInt(),
  body('departmentId').isString().trim().notEmpty().withMessage('departmentId is required and must be a valid id'),
  body('facultyId').optional({ values: 'falsy' }).isString().trim().notEmpty().withMessage('facultyId must be a valid id'),
];

const updateRules = [
  param('id').isString().trim().notEmpty().withMessage('Invalid course id'),
  body('name').optional().isString().trim().notEmpty(),
  body('code').optional().isString().trim().notEmpty(),
  body('semester').optional().isInt({ min: 1, max: 12 }).toInt(),
  body('departmentId').optional({ values: 'falsy' }).isString().trim().notEmpty(),
  body('facultyId').optional({ values: 'falsy' }).isString().trim().notEmpty(),
];

const idParamRule = [param('id').isString().trim().notEmpty().withMessage('Invalid course id')];

const listQueryRules = [
  query('search').optional().isString().trim(),
  query('departmentId').optional({ values: 'falsy' }).isString().trim(),
  query('semester').optional().isInt({ min: 1, max: 12 }).toInt(),
  query('facultyId').optional({ values: 'falsy' }).isString().trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const assignFacultyRules = [
  param('id').isString().trim().notEmpty().withMessage('Invalid course id'),
  body('facultyId').isString().trim().notEmpty().withMessage('facultyId is required and must be a valid id'),
];

const mapSemesterRules = [
  param('id').isString().trim().notEmpty().withMessage('Invalid course id'),
  body('semester').isInt({ min: 1, max: 12 }).withMessage('semester must be an integer between 1 and 12').toInt(),
];

module.exports = {
  createRules,
  updateRules,
  idParamRule,
  listQueryRules,
  assignFacultyRules,
  mapSemesterRules,
};
