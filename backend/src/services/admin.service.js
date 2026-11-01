const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const userRepository = require('../repositories/user.repository');

const adminService = {
  /**
   * Create a new administrator account (ADMIN or SUPER_ADMIN).
   */
  async create({ firstName, lastName, email, phone, role = 'ADMIN', password }) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw ApiError.conflict('A user with this email already exists');
    }

    const tempPassword = password || crypto.randomBytes(9).toString('base64url');
    const saltRounds = env.bcryptSaltRounds || 10;
    const passwordHash = await bcrypt.hash(tempPassword, saltRounds);

    const user = await userRepository.create({
      firstName,
      lastName,
      email,
      phone: phone || null,
      role: role || 'ADMIN',
      status: 'ACTIVE',
      passwordHash,
    });

    const { passwordHash: _, passwordResetToken, passwordResetExpires, ...safeAdmin } = user;
    return {
      admin: safeAdmin,
      temporaryPassword: password ? null : tempPassword,
    };
  },

  /**
   * List administrators with filtering, searching, and pagination.
   */
  async list({ search, role, page = 1, limit = 20 } = {}) {
    const { items, total } = await userRepository.findAdmins({ search, role, page, limit });
    return {
      items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
    };
  },

  /**
   * Get an administrator by ID.
   */
  async getById(id) {
    const user = await userRepository.findById(id);
    if (!user || !['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      throw ApiError.notFound('Administrator not found');
    }
    const { passwordHash, passwordResetToken, passwordResetExpires, ...safeAdmin } = user;
    return safeAdmin;
  },

  /**
   * Update an administrator's profile, role, status, or password.
   */
  async update(id, { firstName, lastName, phone, role, status, password }) {
    await adminService.getById(id);

    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;

    if (password && password.trim().length >= 6) {
      const saltRounds = env.bcryptSaltRounds || 10;
      updateData.passwordHash = await bcrypt.hash(password, saltRounds);
    }

    const updated = await userRepository.update(id, updateData);
    const { passwordHash, passwordResetToken, passwordResetExpires, ...safeAdmin } = updated;
    return safeAdmin;
  },

  /**
   * Remove an administrator account with safety checks:
   * 1. Cannot delete yourself
   * 2. Cannot delete the last active SUPER_ADMIN
   */
  async remove(id, currentUserId) {
    if (id === currentUserId) {
      throw ApiError.badRequest('You cannot delete your own administrator account');
    }

    const target = await adminService.getById(id);

    if (target.role === 'SUPER_ADMIN') {
      const superAdminCount = await userRepository.count({
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      });
      if (superAdminCount <= 1) {
        throw ApiError.badRequest('Cannot delete the last active Super Admin account');
      }
    }

    // Revoke any active sessions
    await userRepository.revokeAllRefreshTokensForUser(id).catch(() => null);

    // Delete administrator record
    await userRepository.delete(id);
    return true;
  },
};

module.exports = adminService;
