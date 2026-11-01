const ApiError = require('../utils/ApiError');
const deviceService = require('../services/device.service');

/**
 * Authenticates an AMB82 Mini device using credentials sent as headers:
 *   x-device-code:    the device's human-facing deviceCode
 *   x-device-api-key: the plaintext API key issued at registration
 *
 * On success, attaches the verified Device record to req.device.
 * Credentials are deliberately kept out of the JSON body so device
 * identity/auth is never confused with the face-recognition payload.
 */
async function authenticateDevice(req, res, next) {
  try {
    const deviceCode = req.header('x-device-code');
    const apiKey = req.header('x-device-api-key');

    const device = await deviceService.verifyCredentials(deviceCode, apiKey);
    req.device = device;
    next();
  } catch (err) {
    next(err instanceof ApiError ? err : ApiError.unauthorized('Device authentication failed'));
  }
}

module.exports = authenticateDevice;
