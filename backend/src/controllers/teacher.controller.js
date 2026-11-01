const teacherService = require('../services/teacher.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');

const teacherController = {
  create: asyncHandler(async (req, res) => {
    const { teacher, temporaryPassword } = await teacherService.create(req.body);
    return new ApiResponse(
      201,
      { teacher, temporaryPassword },
      'Teacher created — share the temporary password securely; it will not be shown again'
    ).send(res);
  }),

  list: asyncHandler(async (req, res) => {
    const { search, departmentId, page = 1, limit = 20 } = req.query;
    const result = await teacherService.list({ search, departmentId, page, limit });
    return new ApiResponse(200, result, 'Teachers retrieved').send(res);
  }),

  getById: asyncHandler(async (req, res) => {
    const teacher = await teacherService.getById(req.params.id);
    return new ApiResponse(200, teacher, 'Teacher retrieved').send(res);
  }),

  update: asyncHandler(async (req, res) => {
    const teacher = await teacherService.update(req.params.id, req.body);
    return new ApiResponse(200, teacher, 'Teacher updated').send(res);
  }),

  remove: asyncHandler(async (req, res) => {
    await teacherService.remove(req.params.id);
    return new ApiResponse(200, null, 'Teacher removed').send(res);
  }),
};

module.exports = teacherController;
