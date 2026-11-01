const adminService = require('../services/admin.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');

const adminController = {
  create: asyncHandler(async (req, res) => {
    const { admin, temporaryPassword } = await adminService.create(req.body);
    const msg = temporaryPassword
      ? 'Administrator created — temporary password generated'
      : 'Administrator created successfully';
    return new ApiResponse(201, { admin, temporaryPassword }, msg).send(res);
  }),

  list: asyncHandler(async (req, res) => {
    const { search, role, page = 1, limit = 20 } = req.query;
    const result = await adminService.list({ search, role, page, limit });
    return new ApiResponse(200, result, 'Administrators retrieved').send(res);
  }),

  getById: asyncHandler(async (req, res) => {
    const admin = await adminService.getById(req.params.id);
    return new ApiResponse(200, admin, 'Administrator retrieved').send(res);
  }),

  update: asyncHandler(async (req, res) => {
    const admin = await adminService.update(req.params.id, req.body);
    return new ApiResponse(200, admin, 'Administrator updated').send(res);
  }),

  remove: asyncHandler(async (req, res) => {
    await adminService.remove(req.params.id, req.user?.id);
    return new ApiResponse(200, null, 'Administrator removed').send(res);
  }),
};

module.exports = adminController;
