/**
 * Wraps an async Express route/controller handler so any rejected
 * promise is forwarded to next(), instead of needing a try/catch
 * in every single controller.
 *
 * Usage: router.get('/x', asyncHandler(controller.method))
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
