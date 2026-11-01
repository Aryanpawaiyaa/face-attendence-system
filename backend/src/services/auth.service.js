const bcrypt = require("bcryptjs");
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const userRepository = require('../repositories/user.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');

const REFRESH_TOKEN_TTL_MS = parseDurationToMs(env.jwt.refreshExpiresIn);

/** Converts a "7d" / "15m" style string to milliseconds. */
function parseDurationToMs(duration) {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default: 7 days
  const value = parseInt(match[1], 10);
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
  return value * unit;
}

function sanitizeUser(user) {
  const { passwordHash, passwordResetToken, passwordResetExpires, ...safe } = user;
  return safe;
}

async function issueTokenPair(user, { ip } = {}) {
  const accessToken = signAccessToken({ id: user.id, role: user.role });
  const refreshToken = signRefreshToken({ id: user.id });

  await userRepository.saveRefreshToken({
    token: refreshToken,
    userId: user.id,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    createdByIp: ip,
  });

  return { accessToken, refreshToken };
}

const authService = {
  /**
   * Authenticates a user with email/password and issues a token pair.
   */
  async login({ email, password }, meta = {}) {
    const user = await userRepository.findByEmail(email);

    // Same generic error whether the user doesn't exist or the password
    // is wrong — avoids leaking which emails are registered.
    if (!user || user.status !== 'ACTIVE') {
      await auditLogRepository.record({
        action: 'LOGIN_FAILED',
        entity: 'User',
        metadata: { email },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw ApiError.unauthorized('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await auditLogRepository.record({
        userId: user.id,
        action: 'LOGIN_FAILED',
        entity: 'User',
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw ApiError.unauthorized('Invalid email or password');
    }

    const tokens = await issueTokenPair(user, { ip: meta.ip });

    await auditLogRepository.record({
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return { user: sanitizeUser(user), ...tokens };
  },

  /**
   * Exchanges a valid, non-revoked refresh token for a new access token
   * (and rotates the refresh token).
   */
  async refresh(refreshToken, meta = {}) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    const stored = await userRepository.findRefreshToken(refreshToken);
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw ApiError.unauthorized('Refresh token is no longer valid');
    }

    const user = await userRepository.findById(payload.id);
    if (!user || user.status !== 'ACTIVE') {
      throw ApiError.unauthorized('Account is inactive or no longer exists');
    }

    // Rotate: revoke the old token, issue a fresh pair
    await userRepository.revokeRefreshToken(refreshToken);
    const tokens = await issueTokenPair(user, { ip: meta.ip });

    return { user: sanitizeUser(user), ...tokens };
  },

  async logout(refreshToken, user, meta = {}) {
    if (refreshToken) {
      const stored = await userRepository.findRefreshToken(refreshToken);
      if (stored && !stored.revokedAt) {
        await userRepository.revokeRefreshToken(refreshToken);
      }
    }
    await auditLogRepository.record({
      userId: user?.id,
      action: 'LOGOUT',
      entity: 'User',
      entityId: user?.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  },

  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found');

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) throw ApiError.unauthorized('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, env.bcryptSaltRounds);
    await userRepository.updatePassword(userId, passwordHash);
    // Invalidate all existing sessions after a password change
    await userRepository.revokeAllRefreshTokensForUser(userId);
  },

  /**
   * Generates a one-time password-reset token.
   * NOTE: sending the token via email/SMS is intentionally out of scope
   * here — wire this into a notification/mailer service in production.
   */
  async forgotPassword(email) {
    const user = await userRepository.findByEmail(email);
    // Always respond as if it succeeded, regardless of whether the
    // email exists, to avoid user enumeration.
    if (!user) return { token: null };

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await userRepository.setPasswordResetToken(user.id, token, expiresAt);

    return { token, userId: user.id };
  },

  async resetPassword({ token, newPassword }) {
    const user = await userRepository.findByResetToken(token);
    if (!user) throw ApiError.badRequest('Reset token is invalid or has expired');

    const passwordHash = await bcrypt.hash(newPassword, env.bcryptSaltRounds);
    await userRepository.updatePassword(user.id, passwordHash);
    await userRepository.revokeAllRefreshTokensForUser(user.id);
  },
};

module.exports = authService;
