const { body } = require('express-validator');

const loginRules = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isString().notEmpty().withMessage('Password is required'),
];

const refreshRules = [
  body('refreshToken').isString().notEmpty().withMessage('refreshToken is required'),
];

const changePasswordRules = [
  body('currentPassword').isString().notEmpty().withMessage('currentPassword is required'),
  body('newPassword')
    .isString()
    .isLength({ min: 8 })
    .withMessage('newPassword must be at least 8 characters long'),
];

const forgotPasswordRules = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
];

const resetPasswordRules = [
  body('token').isString().notEmpty().withMessage('token is required'),
  body('newPassword')
    .isString()
    .isLength({ min: 8 })
    .withMessage('newPassword must be at least 8 characters long'),
];

module.exports = {
  loginRules,
  refreshRules,
  changePasswordRules,
  forgotPasswordRules,
  resetPasswordRules,
};
