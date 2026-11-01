const { prisma } = require('../config/database');

const studentRepository = {
  create(data) {
    return prisma.student.create({ data, include: { department: true } });
  },

  findById(id) {
    return prisma.student.findUnique({ where: { id }, include: { department: true } });
  },

  findByRollNumber(rollNumber) {
    return prisma.student.findUnique({ where: { rollNumber } });
  },

  findByFaceId(faceId) {
    return prisma.student.findUnique({ where: { faceId }, include: { department: true } });
  },

  findByEmail(email) {
    return prisma.student.findUnique({ where: { email } });
  },

  async findAll({ search, departmentId, semester, section, status, faceEnrolled, page, limit }) {
    const where = {
      ...(faceEnrolled === true || faceEnrolled === 'true' ? { faceEnrolled: true } : {}),
      ...(faceEnrolled === false || faceEnrolled === 'false' ? { faceEnrolled: { not: true } } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(semester ? { semester } : {}),
      ...(section ? { section } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { rollNumber: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { department: true },
      }),
      prisma.student.count({ where }),
    ]);

    return { items, total };
  },

  update(id, data) {
    return prisma.student.update({ where: { id }, data, include: { department: true } });
  },

  delete(id) {
    return prisma.student.delete({ where: { id } });
  },

  countAttendance(id) {
    return prisma.attendance.count({ where: { studentId: id } });
  },
};

module.exports = studentRepository;
