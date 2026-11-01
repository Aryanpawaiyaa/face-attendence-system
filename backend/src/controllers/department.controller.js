const departmentService = require('../services/department.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');

const departmentController = {
  create: asyncHandler(async (req, res) => {
    const department = await departmentService.create(req.body);
    return new ApiResponse(201, department, 'Department created').send(res);
  }),

  list: asyncHandler(async (req, res) => {
    const { search, page = 1, limit = 20 } = req.query;
    const result = await departmentService.list({ search, page, limit });
    return new ApiResponse(200, result, 'Departments retrieved').send(res);
  }),

  getById: asyncHandler(async (req, res) => {
    const department = await departmentService.getById(req.params.id);
    return new ApiResponse(200, department, 'Department retrieved').send(res);
  }),

  update: asyncHandler(async (req, res) => {
    const department = await departmentService.update(req.params.id, req.body);
    return new ApiResponse(200, department, 'Department updated').send(res);
  }),

  remove: asyncHandler(async (req, res) => {
    await departmentService.remove(req.params.id);
    return new ApiResponse(200, null, 'Department deleted').send(res);
  }),
};

module.exports = departmentController;
