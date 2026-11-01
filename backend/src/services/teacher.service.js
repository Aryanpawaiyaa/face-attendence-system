const bcrypt = require("bcryptjs");
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const { prisma } = require('../config/database');
const teacherRepository = require('../repositories/teacher.repository');
const userRepository = require('../repositories/user.repository');

const teacherService = {
  /**
   * Creates the underlying User account (role: TEACHER) and the Teacher
   * profile together, in a single transaction, so a Teacher never exists
   * without its User (and vice versa).
   */
  async create({ firstName, lastName, email, phone, employeeId, departmentId, designation }) {
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) throw ApiError.conflict('A user with this email already exists');

    const existingEmployee = await teacherRepository.findByEmployeeId(employeeId);
    if (existingEmployee) throw ApiError.conflict('A teacher with this employee id already exists');

    // Temporary password — the teacher is expected to reset it via
    // the forgot-password flow on first login.
    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, env.bcryptSaltRounds);

    const teacher = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, firstName, lastName, phone, role: 'TEACHER', status: 'ACTIVE' },
      });

      try {
        return await tx.teacher.create({
          data: { userId: user.id, employeeId, departmentId: departmentId || null, designation },
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, status: true } }, department: true },
        });
      } catch (err) {
        // Compensate: never leave an orphan login without a teacher profile
        await tx.user.delete({ where: { id: user.id } }).catch(() => null);
        throw err;
      }
    });

    return { teacher, temporaryPassword: tempPassword };
  },

  async getById(id) {
    const teacher = await teacherRepository.findById(id);
    if (!teacher) throw ApiError.notFound('Teacher not found');
    return teacher;
  },

  async list({ search, departmentId, page = 1, limit = 20 }) {
    const { items, total } = await teacherRepository.findAll({ search, departmentId, page, limit });
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  async update(id, { firstName, lastName, phone, departmentId, designation }) {
    const teacher = await teacherService.getById(id);

    await prisma.$transaction(async (tx) => {
      if (firstName !== undefined || lastName !== undefined || phone !== undefined) {
        await tx.user.update({
          where: { id: teacher.userId },
          data: {
            ...(firstName !== undefined ? { firstName } : {}),
            ...(lastName !== undefined ? { lastName } : {}),
            ...(phone !== undefined ? { phone } : {}),
          },
        });
      }
      if (departmentId !== undefined || designation !== undefined) {
        await tx.teacher.update({
          where: { id },
          data: {
            ...(departmentId !== undefined ? { departmentId } : {}),
            ...(designation !== undefined ? { designation } : {}),
          },
        });
      }
    });

    return teacherRepository.findById(id);
  },

  async remove(id) {
    const teacher = await teacherService.getById(id);
    // Deactivate the linked user rather than hard-deleting, to preserve
    // historical attendance/course records tied to that user.
    await prisma.user.update({ where: { id: teacher.userId }, data: { status: 'INACTIVE' } });
    await teacherRepository.delete(id);
  },
};

module.exports = teacherService;
