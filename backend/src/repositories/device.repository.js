const { prisma } = require('../config/database');

const deviceRepository = {
  create(data) {
    return prisma.device.create({ data });
  },

  findById(id) {
    return prisma.device.findUnique({ where: { id } });
  },

  findByCode(deviceCode) {
    return prisma.device.findUnique({ where: { deviceCode } });
  },

  findByIp(ipAddress) {
    if (!ipAddress) return null;
    return prisma.device.findFirst({ where: { ipAddress } });
  },

  async findAll({ search, status, page, limit }) {
    const where = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { deviceName: { contains: search, mode: 'insensitive' } },
              { deviceCode: { contains: search, mode: 'insensitive' } },
              { building: { contains: search, mode: 'insensitive' } },
              { room: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.device.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.device.count({ where }),
    ]);

    return { items, total };
  },

  update(id, data) {
    return prisma.device.update({ where: { id }, data });
  },

  updateLastActive(id) {
    return prisma.device.update({ where: { id }, data: { lastActiveAt: new Date() } });
  },

  delete(id) {
    return prisma.device.delete({ where: { id } });
  },
};

module.exports = deviceRepository;
