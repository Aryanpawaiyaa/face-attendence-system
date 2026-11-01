const express = require('express');
const notificationController = require('../controllers/notification.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { createRules, listQueryRules, idParamRule } = require('../validators/notification.validator');

const router = express.Router();

router.use(authenticate);

/**
 * @openapi
 * /notifications:
 *   post:
 *     summary: Create a notification (targeted at a user, or broadcast when userId is omitted)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/NotificationInput' }
 *     responses:
 *       201: { description: Notification created }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/ValidationError' } } } }
 *       401: { description: Not authenticated }
 *       403: { description: Caller lacks SUPER_ADMIN/ADMIN role }
 *       404: { description: Target user not found }
 *   get:
 *     summary: List notifications visible to the authenticated user (own + broadcast), paginated
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: unread
 *         schema: { type: boolean }
 *         description: When true, only unread notifications are returned
 *     responses:
 *       200: { description: Paginated list of notifications }
 */
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), createRules, validate, notificationController.create);
router.get('/', listQueryRules, validate, notificationController.list);

/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Notification marked as read }
 *       400: { description: Broadcast/system notifications cannot be marked as read individually }
 *       401: { description: Not authenticated }
 *       403: { description: Notification belongs to another user }
 *       404: { description: Notification not found }
 */
router.patch('/:id/read', idParamRule, validate, notificationController.markRead);

module.exports = router;
