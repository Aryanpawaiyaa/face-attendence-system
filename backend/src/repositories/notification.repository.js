const { prisma } = require('../config/database');

/**
 * Data-access layer for Notification. Keeps Prisma calls out of the
 * service layer so persistence details can change without touching
 * business logic.
 *
 * A notification with userId === null is treated as a broadcast /
 * system notification, visible to every authenticated user.
 */
const notificationRepository = {
  create(data) {
    return prisma.notification.create({ data });
  },

  findById(id) {
    return prisma.notification.findUnique({ where: { id } });
  },

  /**
   * Pre-check used by the attendance-alert flow. Mirrors the pattern in
   * attendanceRepository.findExisting: an explicit read before the write,
   * with the DB's unique constraint on attendanceId as the backstop for
   * the race-condition case.
   */
  findByAttendanceId(attendanceId) {
    return prisma.notification.findUnique({ where: { attendanceId } });
  },

  /**
   * Returns notifications addressed to `userId` plus any broadcast
   * (userId: null) notifications, newest first.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {boolean} [params.unreadOnly]
   * @param {number} params.page
   * @param {number} params.limit
   */
  async findForUser({ userId, unreadOnly, page, limit }) {
    const where = {
      OR: [{ userId }, { userId: null }],
      ...(unreadOnly ? { isRead: false } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    return { items, total };
  },

  markRead(id) {
    return prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  },
};

module.exports = notificationRepository;
