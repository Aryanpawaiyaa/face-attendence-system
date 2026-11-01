const studentService = require('../services/student.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');

const studentController = {
  create: asyncHandler(async (req, res) => {
    const student = await studentService.create(req.body, req.file);
    return new ApiResponse(201, student, 'Student created').send(res);
  }),

  list: asyncHandler(async (req, res) => {
    const { search, departmentId, semester, section, status, faceEnrolled, page = 1, limit = 20 } = req.query;
    const result = await studentService.list({ search, departmentId, semester, section, status, faceEnrolled, page, limit });
    return new ApiResponse(200, result, 'Students retrieved').send(res);
  }),

  getById: asyncHandler(async (req, res) => {
    const student = await studentService.getById(req.params.id);
    return new ApiResponse(200, student, 'Student retrieved').send(res);
  }),

  update: asyncHandler(async (req, res) => {
    const student = await studentService.update(req.params.id, req.body, req.file);
    return new ApiResponse(200, student, 'Student updated').send(res);
  }),

  remove: asyncHandler(async (req, res) => {
    await studentService.remove(req.params.id);
    return new ApiResponse(200, null, 'Student deleted').send(res);
  }),
};

module.exports = studentController;
