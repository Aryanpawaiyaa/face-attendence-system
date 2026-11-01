const ApiError = require('../utils/ApiError');
const departmentRepository = require('../repositories/department.repository');

const departmentService = {
  async create(data) {
    const existing = await departmentRepository.findByCode(data.code);
    if (existing) throw ApiError.conflict('A department with this code already exists');
    return departmentRepository.create(data);
  },

  async getById(id) {
    const department = await departmentRepository.findById(id);
    if (!department) throw ApiError.notFound('Department not found');
    return department;
  },

  async list({ search, page = 1, limit = 20 }) {
    const { items, total } = await departmentRepository.findAll({ search, page, limit });
    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async update(id, data) {
    await departmentService.getById(id); // ensures 404 if missing

    if (data.code) {
      const existing = await departmentRepository.findByCode(data.code);
      if (existing && existing.id !== id) {
        throw ApiError.conflict('A department with this code already exists');
      }
    }

    return departmentRepository.update(id, data);
  },

  async remove(id) {
    await departmentService.getById(id);
    const studentCount = await departmentRepository.countStudents(id);
    if (studentCount > 0) {
      throw ApiError.conflict(
        `Cannot delete department: ${studentCount} student(s) are still assigned to it`
      );
    }
    await departmentRepository.delete(id);
  },
};

module.exports = departmentService;
