const { prisma } = require('../config/database');
const { localDateOnly } = require('../utils/time');

/**
 * Normalizes any Date/ISO string to the institution's local calendar day,
 * stored as UTC midnight of that day (see utils/time.js).
 */
function toDateOnly(dateInput) {
  return localDateOnly(dateInput || new Date());
}

const RECORD_INCLUDE = {
  student: true,
  device: true,
  course: true,
};

function shape(rec) {
  if (!rec) return rec;
  const pick = (o, keys) => (o ? Object.fromEntries(keys.map((k) => [k, o[k]])) : null);
  return {
    ...rec,
    studentId: rec.student?.id || rec.studentId,
    courseId: rec.course?.id || rec.courseId,
    deviceId: rec.device?.id || rec.deviceId,
    student: pick(rec.student, ['id', 'rollNumber', 'firstName', 'lastName', 'departmentId', 'photoUrl', 'semester', 'section']),
    device: pick(rec.device, ['id', 'deviceName', 'deviceCode']),
    course: pick(rec.course, ['id', 'name', 'code']),
  };
}

function buildWhere({ departmentId, status, courseId, sessionId, source, from, to, date, search } = {}) {
  return {
    ...(status ? { status } : {}),
    ...(courseId ? { courseId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(source ? { source } : {}),
    ...(date ? { attendanceDate: toDateOnly(date) } : {}),
    ...(!date && (from || to)
      ? {
          attendanceDate: {
            ...(from ? { gte: toDateOnly(from) } : {}),
            ...(to ? { lte: toDateOnly(to) } : {}),
          },
        }
      : {}),
    ...(departmentId || search
      ? {
          student: {
            ...(departmentId ? { departmentId } : {}),
            ...(search
              ? {
                  OR: [
                    { rollNumber: { contains: search, mode: 'insensitive' } },
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
        }
      : {}),
  };
}

const attendanceRepository = {
  toDateOnly,
  shape,

  findExisting({ studentId, courseId, attendanceDate }) {
    return prisma.attendance.findUnique({
      where: {
        studentId_courseId_attendanceDate: {
          studentId,
          courseId: courseId ?? null,
          attendanceDate,
        },
      },
    });
  },

  async findById(id) {
    return shape(await prisma.attendance.findUnique({ where: { id }, include: RECORD_INCLUDE }));
  },

  async create(data) {
    return shape(await prisma.attendance.create({ data, include: RECORD_INCLUDE }));
  },

  async update(id, data) {
    return shape(await prisma.attendance.update({ where: { id }, data, include: RECORD_INCLUDE }));
  },

  async findMany({ page = 1, limit = 50, ...filters } = {}) {
    const where = buildWhere(filters);
    const [items, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { markedAt: 'desc' },
        include: RECORD_INCLUDE,
      }),
      prisma.attendance.count({ where }),
    ]);
    return { items: items.map(shape), total };
  },

  async findToday({ departmentId, courseId, page = 1, limit = 50 }) {
    return attendanceRepository.findMany({ departmentId, courseId, date: new Date(), page, limit });
  },

  async findByStudent({ studentId, from, to, page = 1, limit = 50 }) {
    const where = { studentId, ...buildWhere({ from, to }) };
    const [items, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { attendanceDate: 'desc' },
        include: { course: true, device: true },
      }),
      prisma.attendance.count({ where }),
    ]);
    return { items: items.map(shape), total };
  },
};

module.exports = attendanceRepository;
