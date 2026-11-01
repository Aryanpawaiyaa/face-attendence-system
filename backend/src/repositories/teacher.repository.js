const { prisma } = require('../config/database');

const teacherRepository = {
  create(data) {
    return prisma.teacher.create({
      data,
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, status: true } }, department: true },
    });
  },

  findById(id) {
    return prisma.teacher.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, status: true } }, department: true },
    });
  },

  findByUserId(userId) {
    return prisma.teacher.findUnique({ where: { userId } });
  },

  findByEmployeeId(employeeId) {
    return prisma.teacher.findUnique({ where: { employeeId } });
  },

  async findAll({ search, departmentId, page, limit }) {
    const where = {
      ...(departmentId ? { departmentId } : {}),
      ...(search
        ? {
            OR: [
              { employeeId: { contains: search, mode: 'insensitive' } },
              { user: { firstName: { contains: search, mode: 'insensitive' } } },
              { user: { lastName: { contains: search, mode: 'insensitive' } } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.teacher.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, status: true } },
          department: true,
        },
      }),
      prisma.teacher.count({ where }),
    ]);

    return { items, total };
  },

  update(id, data) {
    return prisma.teacher.update({
      where: { id },
      data,
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, status: true } }, department: true },
    });
  },

  delete(id) {
    return prisma.teacher.delete({ where: { id } });
  },
};

module.exports = teacherRepository;
