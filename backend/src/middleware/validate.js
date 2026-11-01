const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * Runs after an array of express-validator checks.
 * Collects any validation failures into a single ApiError(400).
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const formatted = errors.array().map((e) => ({
    field: e.path,
    message: e.msg,
  }));

  return next(ApiError.badRequest('Validation failed', formatted));
}

module.exports = validate;
