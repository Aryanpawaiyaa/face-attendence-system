const { prisma } = require('../config/database');

/**
 * Data-access layer for User. Keeps Prisma calls out of the service
 * layer so persistence details can change without touching business logic.
 */
const userRepository = {
  findByEmail(email) {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id) {
    return prisma.user.findUnique({ where: { id } });
  },

  create(data) {
    return prisma.user.create({ data });
  },

  updatePassword(id, passwordHash) {
    return prisma.user.update({
      where: { id },
      data: { passwordHash, passwordResetToken: null, passwordResetExpires: null },
    });
  },

  setPasswordResetToken(id, token, expiresAt) {
    return prisma.user.update({
      where: { id },
      data: { passwordResetToken: token, passwordResetExpires: expiresAt },
    });
  },

  findByResetToken(token) {
    return prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() },
      },
    });
  },

  saveRefreshToken({ token, userId, expiresAt, createdByIp }) {
    return prisma.refreshToken.create({
      data: { token, userId, expiresAt, createdByIp },
    });
  },

  findRefreshToken(token) {
    return prisma.refreshToken.findUnique({ where: { token } });
  },

  revokeRefreshToken(token) {
    return prisma.refreshToken.update({
      where: { token },
      data: { revokedAt: new Date() },
    });
  },

  revokeAllRefreshTokensForUser(userId) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  async findAdmins({ search, role, page = 1, limit = 20 } = {}) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const roles = role ? [role] : ['SUPER_ADMIN', 'ADMIN'];
    const where = {
      role: { in: roles },
      ...(search
        ? {
            OR: [
              { firstName: { contains: search } },
              { lastName: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (p - 1) * l,
        take: l,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    // Strip passwordHash from results
    const safeItems = items.map((u) => {
      const { passwordHash, passwordResetToken, passwordResetExpires, ...safe } = u;
      return safe;
    });

    return { items: safeItems, total };
  },

  update(id, data) {
    return prisma.user.update({
      where: { id },
      data,
    });
  },

  delete(id) {
    return prisma.user.delete({
      where: { id },
    });
  },

  count(where) {
    return prisma.user.count({ where });
  },
};

module.exports = userRepository;
