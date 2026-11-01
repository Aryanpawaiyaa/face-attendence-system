const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/jwt');
const { prisma } = require('../config/database');

async function resolveUser(token) {
  const payload = verifyAccessToken(token);
  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, email: true, role: true, status: true, firstName: true, lastName: true },
  });
  if (!user || user.status !== 'ACTIVE') {
    throw ApiError.unauthorized('Account is inactive or no longer exists');
  }
  return user;
}

/** Verifies the Bearer access token and attaches req.user. */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Missing or malformed Authorization header');
    }
    req.user = await resolveUser(token);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Same as authenticate but also accepts ?token= - needed for browser APIs
 * that cannot set headers (EventSource for live events, <img> for MJPEG).
 */
async function authenticateFlexible(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, bearer] = header.split(' ');
    const token = scheme === 'Bearer' && bearer ? bearer : req.query.token;
    if (!token) throw ApiError.unauthorized('Missing access token');
    req.user = await resolveUser(String(token));
    next();
  } catch (err) {
    next(err);
  }
}

/** Restricts a route to one or more roles. */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    return next();
  };
}

module.exports = { authenticate, authenticateFlexible, authorize };
