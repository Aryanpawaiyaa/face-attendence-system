/**
 * Centralized environment configuration.
 * Fails fast on boot if a required variable is missing.
 */
try {
  require('dotenv').config();
} catch (e) {
  // Ignore missing dotenv module in bundled/packaged environment
}

// Fallback defaults so app starts even if .env is missing on professor's laptop
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'mongodb://127.0.0.1:27017/smart_attendance';
}
if (!process.env.JWT_ACCESS_SECRET) {
  process.env.JWT_ACCESS_SECRET = '72f6129a0f1679d241b1f0331307ef81468bf20794aaefd96e41fdf872b84e49';
}
if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'b7d661e019742c9ad7ea2377ee39021b60c60b0d11983deede9d615c5d4a5dbf';
}
if (!process.env.ML_SHARED_SECRET) {
  process.env.ML_SHARED_SECRET = 'bd2afe58b621580c424ed560980b57bba42a4fc72ffb90490d97852bf89233b3';
}
if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
  // eslint-disable-next-line no-console
  console.warn('[WARN] JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are identical - refresh tokens could be used as access tokens.');
}

const port = parseInt(process.env.PORT, 10) || 5001;
const apiPrefix = process.env.API_PREFIX || '/api';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port,
  apiPrefix,

  databaseUrl: process.env.DATABASE_URL,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 3000,
  },

  authRateLimit: {
    windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 20,
  },

  deviceHmacSecret: process.env.DEVICE_HMAC_SECRET || '',

  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB, 10) || 50,
  },

  ml: {
    url: (process.env.ML_SERVICE_URL || 'http://127.0.0.1:5002').replace(/\/$/, ''),
    secret: process.env.ML_SHARED_SECRET || '',
    autoStart: (process.env.ML_AUTOSTART || 'true').toLowerCase() === 'true',
    pythonBin: process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3'),
    timeoutMs: parseInt(process.env.ML_TIMEOUT_MS, 10) || 20000,
  },

  // URL the ML service uses to call back into this backend (camera stream events)
  internalBaseUrl: (process.env.INTERNAL_BASE_URL || `http://127.0.0.1:${port}${apiPrefix}`).replace(/\/$/, ''),

  timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',

  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = env;
