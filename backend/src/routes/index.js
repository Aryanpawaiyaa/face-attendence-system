const express = require('express');
const authRoutes = require('./auth.routes');
const departmentRoutes = require('./department.routes');
const teacherRoutes = require('./teacher.routes');
const faceRoutes = require('./face.routes');
const studentRoutes = require('./student.routes');
const deviceRoutes = require('./device.routes');
const attendanceRoutes = require('./attendance.routes');
const courseRoutes = require('./course.routes');
const dashboardRoutes = require('./dashboard.routes');
const reportRoutes = require('./report.routes');
const notificationRoutes = require('./notification.routes');
const auditLogRoutes = require('./auditLog.routes');
const mlRoutes = require('./ml.routes');
const sessionRoutes = require('./session.routes');
const settingsRoutes = require('./settings.routes');
const unknownFaceRoutes = require('./unknownFace.routes');
const analyticsRoutes = require('./analytics.routes');
const adminRoutes = require('./admin.routes');
const internalRoutes = require('./internal.routes');
const { authenticateFlexible } = require('../middleware/auth.middleware');
const realtime = require('../services/realtime.service');
const mlClient = require('../services/mlClient');
const mongoose = require('mongoose');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/departments', departmentRoutes);
router.use('/teachers', teacherRoutes);
router.use('/students', faceRoutes);
router.use('/students', studentRoutes);
router.use('/devices', deviceRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/courses', courseRoutes);
router.use('/admins', adminRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/ml', mlRoutes);
router.use('/sessions', sessionRoutes);
router.use('/settings', settingsRoutes);
router.use('/unknown-faces', unknownFaceRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/internal', internalRoutes);

/**
 * @openapi
 * /live/events:
 *   get:
 *     summary: Server-Sent Events stream (attendance, unknown_face, device, session, enrollment). Auth via ?token=
 *     tags: [Live]
 */
router.get('/live/events', authenticateFlexible, realtime.subscribe);

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Liveness + dependency check (database, face engine)
 *     tags: [Health]
 *     security: []
 */
router.get('/health', async (req, res) => {
  let ml = false;
  try {
    ml = (await mlClient.call('/health', { timeoutMs: 1500 })).ok;
  } catch {
    ml = false;
  }
  res.status(200).json({
    success: true,
    message: 'API is healthy',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'embedded',
    faceEngine: ml ? 'online' : 'offline',
    liveClients: realtime.clientCount,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
