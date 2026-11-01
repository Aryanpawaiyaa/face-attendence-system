const { prisma } = require('../config/database');

/**
 * A date-only value (no time component, e.g. "2026-08-04") used as an
 * inclusive upper bound would otherwise resolve to that day's midnight
 * and exclude virtually every entry from that calendar day. When `to`
 * has no time component, treat it as end-of-day (UTC) instead; a
 * value that already includes a time is used exactly as given.
 */
function toInclusiveUpperBound(value) {
  const date = new Date(value);
  const hasTimeComponent = /T\d/.test(String(value));
  if (!hasTimeComponent) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

const auditLogRepository = {
  /**
   * @param {object} params
   * @param {string} [params.userId]
   * @param {string} params.action - one of the AuditAction enum values
   * @param {string} [params.entity]
   * @param {string} [params.entityId]
   * @param {string} [params.ipAddress]
   * @param {string} [params.userAgent]
   * @param {object} [params.metadata]
   */
  record({ userId, action, entity, entityId, ipAddress, userAgent, metadata }) {
    return prisma.auditLog.create({
      data: { userId, action, entity, entityId, ipAddress, userAgent, metadata },
    });
  },

  findById(id) {
    return prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      },
    });
  },

  /**
   * Paginated, filterable, newest-first query over the audit trail.
   *
   * @param {object} params
   * @param {string} [params.userId]
   * @param {string} [params.action]
   * @param {string|Date} [params.from] - inclusive lower bound on createdAt
   * @param {string|Date} [params.to] - inclusive upper bound on createdAt
   * @param {number} params.page
   * @param {number} params.limit
   */
  async findAll({ userId, action, from, to, page, limit }) {
    const where = {
      ...(userId ? { userId } : {}),
      ...(action ? { action } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: toInclusiveUpperBound(to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { items, total };
  },
};

module.exports = auditLogRepository;
