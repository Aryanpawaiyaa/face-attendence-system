const ApiError = require('../utils/ApiError');
const courseRepository = require('../repositories/course.repository');
const departmentRepository = require('../repositories/department.repository');
const { prisma } = require('../config/database');

/**
 * Faculty assigned to a course must be a TEACHER or ADMIN/SUPER_ADMIN
 * account in good standing.
 */
async function assertValidFaculty(facultyId) {
  const faculty = await prisma.user.findUnique({ where: { id: facultyId } });
  if (!faculty) throw ApiError.badRequest('facultyId does not reference a valid user');
  if (faculty.status !== 'ACTIVE') throw ApiError.badRequest('This user is not active and cannot be assigned as faculty');
  if (!['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(faculty.role)) {
    throw ApiError.badRequest('facultyId must reference a teacher or admin account');
  }
  return faculty;
}

const courseService = {
  async create({ name, code, semester, departmentId, facultyId }) {
    const existing = await courseRepository.findByCode(code);
    if (existing) throw ApiError.conflict('A course with this code already exists');

    const department = await departmentRepository.findById(departmentId);
    if (!department) throw ApiError.badRequest('departmentId does not reference a valid department');

    if (facultyId) await assertValidFaculty(facultyId);

    return courseRepository.create({ name, code, semester, departmentId, facultyId });
  },

  async getById(id) {
    const course = await courseRepository.findById(id);
    if (!course) throw ApiError.notFound('Course not found');
    return course;
  },

  async list({ search, departmentId, semester, facultyId, page = 1, limit = 20 }) {
    const { items, total } = await courseRepository.findAll({
      search,
      departmentId,
      semester,
      facultyId,
      page,
      limit,
    });
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  async update(id, data) {
    await courseService.getById(id);

    if (data.code) {
      const existing = await courseRepository.findByCode(data.code);
      if (existing && existing.id !== id) throw ApiError.conflict('A course with this code already exists');
    }
    if (data.departmentId) {
      const department = await departmentRepository.findById(data.departmentId);
      if (!department) throw ApiError.badRequest('departmentId does not reference a valid department');
    }
    if (data.facultyId) await assertValidFaculty(data.facultyId);

    return courseRepository.update(id, data);
  },

  /**
   * Dedicated faculty-assignment action (maps to the "Assign Faculty"
   * feature called out in the original spec, separate from a generic update).
   */
  async assignFaculty(id, facultyId) {
    await courseService.getById(id);
    await assertValidFaculty(facultyId);
    return courseRepository.update(id, { facultyId });
  },

  /**
   * Dedicated semester-mapping action ("Semester Mapping" in the spec).
   */
  async mapSemester(id, semester) {
    await courseService.getById(id);
    return courseRepository.update(id, { semester });
  },

  async remove(id) {
    await courseService.getById(id);
    const attendanceCount = await courseRepository.countAttendance(id);
    if (attendanceCount > 0) {
      throw ApiError.conflict(
        `Cannot delete course: ${attendanceCount} attendance record(s) reference it`
      );
    }
    await courseRepository.delete(id);
  },
};

module.exports = courseService;
