const ApiError = require('../utils/ApiError');
const auditLogRepository = require('../repositories/auditLog.repository');

const auditLogService = {
  /**
   * Paginated, filterable, newest-first audit trail listing.
   */
  async list({ userId, action, from, to, page = 1, limit = 20 }) {
    const { items, total } = await auditLogRepository.findAll({
      userId,
      action,
      from,
      to,
      page,
      limit,
    });

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
    };
  },

  async getById(id) {
    const log = await auditLogRepository.findById(id);
    if (!log) throw ApiError.notFound('Audit log entry not found');
    return log;
  },
};

module.exports = auditLogService;
