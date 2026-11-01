const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');

function requestMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

const authController = {
  login: asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.login({ email, password }, requestMeta(req));
    return new ApiResponse(200, result, 'Login successful').send(res);
  }),

  refresh: asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const result = await authService.refresh(refreshToken, requestMeta(req));
    return new ApiResponse(200, result, 'Token refreshed').send(res);
  }),

  logout: asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken, req.user, requestMeta(req));
    return new ApiResponse(200, null, 'Logged out successfully').send(res);
  }),

  changePassword: asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, { currentPassword, newPassword });
    return new ApiResponse(200, null, 'Password changed successfully').send(res);
  }),

  forgotPassword: asyncHandler(async (req, res) => {
    const { email } = req.body;
    await authService.forgotPassword(email);
    // Generic message regardless of outcome — avoids user enumeration.
    return new ApiResponse(
      200,
      null,
      'If an account with that email exists, password reset instructions have been sent'
    ).send(res);
  }),

  resetPassword: asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    await authService.resetPassword({ token, newPassword });
    return new ApiResponse(200, null, 'Password reset successfully').send(res);
  }),

  me: asyncHandler(async (req, res) => {
    return new ApiResponse(200, req.user, 'Current user').send(res);
  }),
};

module.exports = authController;
