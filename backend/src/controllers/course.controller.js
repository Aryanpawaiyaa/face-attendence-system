const courseService = require('../services/course.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');

const courseController = {
  create: asyncHandler(async (req, res) => {
    const course = await courseService.create(req.body);
    return new ApiResponse(201, course, 'Course created').send(res);
  }),

  list: asyncHandler(async (req, res) => {
    const { search, departmentId, semester, facultyId, page = 1, limit = 20 } = req.query;
    const result = await courseService.list({ search, departmentId, semester, facultyId, page, limit });
    return new ApiResponse(200, result, 'Courses retrieved').send(res);
  }),

  getById: asyncHandler(async (req, res) => {
    const course = await courseService.getById(req.params.id);
    return new ApiResponse(200, course, 'Course retrieved').send(res);
  }),

  update: asyncHandler(async (req, res) => {
    const course = await courseService.update(req.params.id, req.body);
    return new ApiResponse(200, course, 'Course updated').send(res);
  }),

  assignFaculty: asyncHandler(async (req, res) => {
    const course = await courseService.assignFaculty(req.params.id, req.body.facultyId);
    return new ApiResponse(200, course, 'Faculty assigned').send(res);
  }),

  mapSemester: asyncHandler(async (req, res) => {
    const course = await courseService.mapSemester(req.params.id, req.body.semester);
    return new ApiResponse(200, course, 'Semester mapping updated').send(res);
  }),

  remove: asyncHandler(async (req, res) => {
    await courseService.remove(req.params.id);
    return new ApiResponse(200, null, 'Course deleted').send(res);
  }),
};

module.exports = courseController;
