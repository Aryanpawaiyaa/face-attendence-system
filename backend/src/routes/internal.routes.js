/**
 * Machine-to-machine endpoints used by the Python ML service.
 * Protected by the shared secret (x-ml-secret) and restricted to loopback
 * unless ALLOW_REMOTE_ML=true.
 */
const express = require('express');
const crypto = require('crypto');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const recognitionService = require('../services/recognition.service');

const router = express.Router();

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

router.use((req, res, next) => {
  if (!env.ml.secret) return next(ApiError.forbidden('ML_SHARED_SECRET is not configured'));
  if (!safeEqual(req.header('x-ml-secret'), env.ml.secret)) return next(ApiError.forbidden('Invalid ML secret'));
  const ip = req.ip || '';
  const loopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!loopback && process.env.ALLOW_REMOTE_ML !== 'true') return next(ApiError.forbidden('Internal endpoint'));
  return next();
});

router.post(
  '/ml/events',
  express.json({ limit: '10mb' }),
  asyncHandler(async (req, res) => {
    const result = await recognitionService.handleStreamEvents(req.body || {});
    res.json({ success: true, ...result });
  })
);

module.exports = router;
