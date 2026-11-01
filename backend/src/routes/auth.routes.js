const express = require('express');
const authController = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  loginRules,
  refreshRules,
  changePasswordRules,
  forgotPasswordRules,
  resetPasswordRules,
} = require('../validators/auth.validator');

const router = express.Router();

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Authenticate an admin/teacher and receive access + refresh tokens
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful, returns user + tokens
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', authLimiter, loginRules, validate, authController.login);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Exchange a valid refresh token for a new access token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New token pair issued
 *       401:
 *         description: Refresh token invalid, expired, or revoked
 */
router.post('/refresh', authLimiter, refreshRules, validate, authController.refresh);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Revoke the given refresh token (logout of current session)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @openapi
 * /auth/change-password:
 *   post:
 *     summary: Change the authenticated user's password
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ChangePasswordInput' }
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ValidationError' }
 *       401:
 *         description: Current password incorrect / not authenticated
 */
router.post(
  '/change-password',
  authenticate,
  changePasswordRules,
  validate,
  authController.changePassword
);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset token for the given email
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ForgotPasswordInput' }
 *     responses:
 *       200:
 *         description: Generic confirmation (does not reveal if the email exists)
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ValidationError' }
 */
router.post(
  '/forgot-password',
  authLimiter,
  forgotPasswordRules,
  validate,
  authController.forgotPassword
);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using a valid reset token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ResetPasswordInput' }
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Token invalid or expired, or validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ValidationError' }
 */
router.post(
  '/reset-password',
  authLimiter,
  resetPasswordRules,
  validate,
  authController.resetPassword
);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get the currently authenticated user's profile
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Current user
 *       401:
 *         description: Not authenticated
 */
router.get('/me', authenticate, authController.me);

module.exports = router;
