const fs = require('fs/promises');
const path = require('path');
const ApiError = require('../utils/ApiError');
const studentRepository = require('../repositories/student.repository');
const departmentRepository = require('../repositories/department.repository');
const mlClient = require('./mlClient');

async function deletePhotoFile(photoUrl) {
  if (!photoUrl) return;
  try {
    // photoUrl is stored as a relative path (e.g. "/uploads/students/xyz.jpg")
    const filePath = path.join(process.cwd(), photoUrl.replace(/^\//, ''));
    await fs.unlink(filePath);
  } catch {
    // Non-fatal: file may already be gone. Don't block the DB operation on it.
  }
}

const studentService = {
  async create(data, photoFile) {
    const existingRoll = await studentRepository.findByRollNumber(data.rollNumber);
    if (existingRoll) throw ApiError.conflict('A student with this roll number already exists');

    if (data.email) {
      const existingEmail = await studentRepository.findByEmail(data.email);
      if (existingEmail) throw ApiError.conflict('A student with this email already exists');
    }

    if (data.faceId) {
      const existingFace = await studentRepository.findByFaceId(data.faceId);
      if (existingFace) throw ApiError.conflict('This faceId is already registered to another student');
    }

    const department = await departmentRepository.findById(data.departmentId);
    if (!department) throw ApiError.badRequest('departmentId does not reference a valid department');

    const photoUrl = photoFile ? `/uploads/students/${photoFile.filename}` : undefined;

    return studentRepository.create({ ...data, photoUrl });
  },

  async getById(id) {
    const student = await studentRepository.findById(id);
    if (!student) throw ApiError.notFound('Student not found');
    return student;
  },

  async list({ search, departmentId, semester, section, status, faceEnrolled, page = 1, limit = 20 }) {
    const { items, total } = await studentRepository.findAll({
      faceEnrolled,
      search,
      departmentId,
      semester,
      section,
      status,
      page,
      limit,
    });
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  async update(id, data, photoFile) {
    const student = await studentService.getById(id);

    if (data.rollNumber && data.rollNumber !== student.rollNumber) {
      const existing = await studentRepository.findByRollNumber(data.rollNumber);
      if (existing) throw ApiError.conflict('A student with this roll number already exists');
    }

    if (data.email && data.email !== student.email) {
      const existing = await studentRepository.findByEmail(data.email);
      if (existing) throw ApiError.conflict('A student with this email already exists');
    }

    if (data.faceId && data.faceId !== student.faceId) {
      const existing = await studentRepository.findByFaceId(data.faceId);
      if (existing) throw ApiError.conflict('This faceId is already registered to another student');
    }

    if (data.departmentId) {
      const department = await departmentRepository.findById(data.departmentId);
      if (!department) throw ApiError.badRequest('departmentId does not reference a valid department');
    }

    let photoUrl;
    if (photoFile) {
      photoUrl = `/uploads/students/${photoFile.filename}`;
      await deletePhotoFile(student.photoUrl); // replace old photo
    }

    return studentRepository.update(id, { ...data, ...(photoUrl ? { photoUrl } : {}) });
  },

  async remove(id) {
    const student = await studentService.getById(id);
    if (!student) throw ApiError.notFound('Student not found');
    
    // Automatically delete associated attendance records so the student can be deleted cleanly
    try {
      const { prisma } = require('../config/database');
      await prisma.attendance.deleteMany({ where: { studentId: id } });
    } catch {
      // Non-fatal
    }

    await studentRepository.delete(id);
    await deletePhotoFile(student.photoUrl);
    // Biometric data must not outlive the student record
    if (student.faceId) await mlClient.removeIdentity(student.faceId).catch(() => null);
  },
};

module.exports = studentService;
