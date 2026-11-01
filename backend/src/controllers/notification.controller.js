const notificationService = require('../services/notification.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');

const notificationController = {
  create: asyncHandler(async (req, res) => {
    const { userId, type, channel, title, message } = req.body;
    const notification = await notificationService.create({ userId, type, channel, title, message });
    return new ApiResponse(201, notification, 'Notification created').send(res);
  }),

  list: asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, unread } = req.query;
    const result = await notificationService.list({
      userId: req.user.id,
      unread,
      page,
      limit,
    });
    return new ApiResponse(200, result, 'Notifications retrieved').send(res);
  }),

  markRead: asyncHandler(async (req, res) => {
    const notification = await notificationService.markAsRead(req.params.id, req.user.id);
    return new ApiResponse(200, notification, 'Notification marked as read').send(res);
  }),
};

module.exports = notificationController;
