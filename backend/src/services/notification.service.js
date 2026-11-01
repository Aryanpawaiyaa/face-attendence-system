const ApiError = require('../utils/ApiError');
const notificationRepository = require('../repositories/notification.repository');
const userRepository = require('../repositories/user.repository');
const courseRepository = require('../repositories/course.repository');

const ALERT_STATUSES = ['LATE', 'ABSENT'];

const notificationService = {
  /**
   * Creates a notification. Omitting `userId` creates a broadcast
   * notification visible to every authenticated user.
   */
  async create({ userId, type, channel, title, message }) {
    if (userId) {
      const targetUser = await userRepository.findById(userId);
      if (!targetUser) throw ApiError.notFound('Target user not found');
    }

    return notificationRepository.create({
      userId: userId || null,
      type,
      channel,
      title,
      message,
    });
  },

  /**
   * Lists notifications visible to `userId` (their own + broadcasts),
   * newest first, with pagination and an optional unread filter.
   */
  async list({ userId, unread, page = 1, limit = 20 }) {
    const { items, total } = await notificationRepository.findForUser({
      userId,
      unreadOnly: unread,
      page,
      limit,
    });

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
    };
  },

  /**
   * Automatically raises an ATTENDANCE_ALERT notification for a LATE or
   * ABSENT attendance record. Called by attendanceService right after an
   * attendance record is created — this is the single place that decides
   * *whether* an alert is warranted and *who* it goes to, so that rule
   * lives here once instead of being duplicated at every attendance call
   * site.
   *
   * Idempotent per attendance record: a pre-check plus the database's
   * unique constraint on Notification.attendanceId together guarantee at
   * most one alert is ever created for a given attendanceId, even under
   * concurrent calls.
   *
   * Never throws for the "no alert needed" / "already alerted" cases —
   * only unexpected errors propagate, and the caller (attendanceService)
   * treats even those as non-fatal so a notification failure can never
   * block attendance marking.
   *
   * @param {object} params
   * @param {string} params.attendanceId
   * @param {string} params.studentName
   * @param {string} params.status - the attendance record's status
   * @param {string|null} [params.courseId]
   */
  async createAttendanceAlert({ attendanceId, studentName, status, courseId }) {
    if (!ALERT_STATUSES.includes(status)) return null;

    const existingAlert = await notificationRepository.findByAttendanceId(attendanceId);
    if (existingAlert) return existingAlert;

    let targetUserId = null; // no resolvable faculty -> broadcast to all authenticated users
    let courseLabel = 'an unspecified course';
    if (courseId) {
      const course = await courseRepository.findById(courseId);
      if (course) {
        courseLabel = course.name;
        if (course.facultyId) targetUserId = course.facultyId;
      }
    }

    const title = `Attendance Alert: ${studentName} marked ${status}`;
    const message = `${studentName} was marked ${status} for ${courseLabel}.`;

    try {
      return await notificationRepository.create({
        userId: targetUserId,
        attendanceId,
        type: 'ATTENDANCE_ALERT',
        channel: 'IN_APP',
        title,
        message,
      });
    } catch (err) {
      // Race: a concurrent call already created the alert for this
      // attendance record; the unique constraint on attendanceId is the
      // backstop. Treat it the same as the pre-check hit above.
      if (err.code === 'P2002') {
        return notificationRepository.findByAttendanceId(attendanceId);
      }
      throw err;
    }
  },

  /**
   * Marks a single notification as read on behalf of `userId`.
   * Idempotent — marking an already-read notification just returns it.
   */
  async markAsRead(id, userId) {
    const notification = await notificationRepository.findById(id);
    if (!notification) throw ApiError.notFound('Notification not found');

    if (notification.userId === null) {
      throw ApiError.badRequest('System notifications cannot be marked as read individually');
    }

    if (notification.userId !== userId) {
      throw ApiError.forbidden('You cannot modify another user\'s notification');
    }

    if (notification.isRead) return notification;

    return notificationRepository.markRead(id);
  },
};

module.exports = notificationService;
