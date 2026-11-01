const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const env = require('../config/env');

/**
 * Translates MongoDB / Mongoose / adapter errors into ApiError instances so
 * the response shape stays consistent regardless of the failure source.
 */
function mapDbError(err) {
  if (!err) return null;
  if (err.code === 'P2002' || err.code === 11000) {
    const keys = err.meta?.target || Object.keys(err.keyPattern || {});
    const target = Array.isArray(keys) ? keys.join(', ') : keys;
    return ApiError.conflict(`A record with this ${target || 'value'} already exists`);
  }
  if (err.code === 'P2025') return ApiError.notFound('Requested record was not found');
  if (err.name === 'ValidationError' && err.errors) {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return ApiError.badRequest('Validation failed', errors);
  }
  if (err.name === 'CastError') return ApiError.badRequest(`Invalid value for ${err.path}`);
  if (err.name === 'MongoServerSelectionError') return new ApiError(503, 'Database unavailable', [], true);
  if (err.name === 'MulterError') return ApiError.badRequest(err.message);
  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;

  if (!(error instanceof ApiError)) {
    const mapped = mapDbError(err);
    if (mapped) {
      error = mapped;
    } else if (err.name === 'JsonWebTokenError') {
      error = ApiError.unauthorized('Invalid authentication token');
    } else if (err.name === 'TokenExpiredError') {
      error = ApiError.unauthorized('Authentication token has expired');
    } else if (err.type === 'entity.too.large') {
      error = new ApiError(413, 'Payload too large');
    } else if (err.type === 'entity.parse.failed') {
      error = ApiError.badRequest('Malformed JSON body');
    } else {
      error = ApiError.internal(env.isProduction ? 'Internal server error' : err.message);
    }
  }

  if (!error.isOperational) {
    logger.error({ err, path: req.originalUrl, method: req.method }, 'Unhandled error');
  } else {
    logger.warn({ err: error.message, path: req.originalUrl, method: req.method }, 'Handled error');
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    errors: error.errors && error.errors.length ? error.errors : undefined,
    stack: env.isProduction ? undefined : err.stack,
  });
}

module.exports = errorHandler;
