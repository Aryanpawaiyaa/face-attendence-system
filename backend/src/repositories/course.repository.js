const { prisma } = require('../config/database');

const courseRepository = {
  create(data) {
    return prisma.course.create({
      data,
      include: {
        department: true,
        faculty: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  },

  findById(id) {
    return prisma.course.findUnique({
      where: { id },
      include: {
        department: true,
        faculty: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  },

  findByCode(code) {
    return prisma.course.findUnique({ where: { code } });
  },

  async findAll({ search, departmentId, semester, facultyId, page, limit }) {
    const where = {
      ...(departmentId ? { departmentId } : {}),
      ...(semester ? { semester } : {}),
      ...(facultyId ? { facultyId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ semester: 'asc' }, { name: 'asc' }],
        include: {
          department: true,
          faculty: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.course.count({ where }),
    ]);

    return { items, total };
  },

  update(id, data) {
    return prisma.course.update({
      where: { id },
      data,
      include: {
        department: true,
        faculty: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  },

  delete(id) {
    return prisma.course.delete({ where: { id } });
  },

  countAttendance(id) {
    return prisma.attendance.count({ where: { courseId: id } });
  },
};

module.exports = courseRepository;
