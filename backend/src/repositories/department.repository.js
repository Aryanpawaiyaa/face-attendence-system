const { prisma } = require('../config/database');

const departmentRepository = {
  create(data) {
    return prisma.department.create({ data });
  },

  findById(id) {
    return prisma.department.findUnique({ where: { id } });
  },

  findByCode(code) {
    return prisma.department.findUnique({ where: { code } });
  },

  async findAll({ search, page, limit }) {
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.department.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.department.count({ where }),
    ]);

    return { items, total };
  },

  update(id, data) {
    return prisma.department.update({ where: { id }, data });
  },

  delete(id) {
    return prisma.department.delete({ where: { id } });
  },

  countStudents(id) {
    return prisma.student.count({ where: { departmentId: id } });
  },
};

module.exports = departmentRepository;
