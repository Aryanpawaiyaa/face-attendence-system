const express = require('express');
const auditLogController = require('../controllers/auditLog.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { listQueryRules, idParamRule } = require('../validators/auditLog.validator');

const router = express.Router();

// Audit trail data (logins, admin actions, errors) is system-sensitive
// and system-wide (not scoped to a teacher's own courses/students), so
// access is restricted to SUPER_ADMIN/ADMIN — unlike dashboard/report
// endpoints, which also allow TEACHER.
router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN'));

/**
 * @openapi
 * /audit-logs:
 *   get:
 *     summary: List audit log entries (paginated, filterable, newest first)
 *     tags: [AuditLogs]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string, format: uuid }
 *         description: Filter by the user who performed the action
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *         description: Filter by AuditAction enum value
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Inclusive lower bound on createdAt (ISO 8601)
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: Inclusive upper bound on createdAt (ISO 8601)
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated list of audit log entries, newest first }
 */
router.get('/', listQueryRules, validate, auditLogController.list);

/**
 * @openapi
 * /audit-logs/{id}:
 *   get:
 *     summary: Get a single audit log entry by id
 *     tags: [AuditLogs]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Audit log entry found }
 *       404: { description: Audit log entry not found }
 */
router.get('/:id', idParamRule, validate, auditLogController.getById);

module.exports = router;
