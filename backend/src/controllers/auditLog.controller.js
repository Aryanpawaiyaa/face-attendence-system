const auditLogService = require('../services/auditLog.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');

const auditLogController = {
  list: asyncHandler(async (req, res) => {
    const { userId, action, from, to, page = 1, limit = 20 } = req.query;
    const result = await auditLogService.list({ userId, action, from, to, page, limit });
    return new ApiResponse(200, result, 'Audit logs retrieved').send(res);
  }),

  getById: asyncHandler(async (req, res) => {
    const log = await auditLogService.getById(req.params.id);
    return new ApiResponse(200, log, 'Audit log entry retrieved').send(res);
  }),
};

module.exports = auditLogController;
