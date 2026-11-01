const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/**
 * General-purpose limiter applied to the whole API.
 */
const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.isProduction ? 50000 : 1000000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Never rate limit ML real-time video frames, health checks, or local dev calls
    const url = req.originalUrl || req.url || '';
    return (
      !env.isProduction ||
      url.includes('/ml/') ||
      url.includes('/dashboard/') ||
      url.includes('/attendance/') ||
      url.includes('/devices/frame') ||
      url.includes('/devices/heartbeat') ||
      url.includes('/devices/stream') ||
      url.includes('/devices/live-feed') ||
      url.includes('/devices/proxy-frame') ||
      url.includes('/live/') ||
      url.includes('/stream/') ||
      url.includes('/internal/')
    );
  },
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

/**
 * Stricter limiter for authentication endpoints to slow down
 * credential-stuffing / brute-force attempts.
 */
const authLimiter = rateLimit({
  windowMs: env.authRateLimit.windowMs,
  max: env.authRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
});

module.exports = { apiLimiter, authLimiter };
