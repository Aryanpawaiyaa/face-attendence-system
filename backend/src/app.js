require('express-async-errors');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
const fs = require('fs');

const env = require('./config/env');
const logger = require('./config/logger');
const swaggerSpec = require('./config/swagger');
const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { authenticateFlexible } = require('./middleware/auth.middleware');

const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow <img> of /uploads from the Vite origin
  })
);

app.use(
  cors({
    // Allow same-origin / curl / AMB82 (no Origin header) and configured web
    // origins. Unknown origins simply get no CORS headers (browser blocks) -
    // previously this threw and every such request became a 500.
    origin(origin, cb) {
      cb(null, !origin || env.corsOrigins.includes(origin) || env.corsOrigins.includes('*'));
    },
    credentials: true,
  })
);

// Do not compress SSE / MJPEG streams (they must flush immediately)
app.use(
  compression({
    filter: (req, res) => {
      if (
        req.path.includes('/live/events') ||
        req.path.includes('/stream/') ||
        req.path.includes('/live-feed') ||
        req.path.includes('/proxy-frame')
      ) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);
// Student photo uploads can be large (multiple high-res images as base64)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// EventSource / <img> requests carry ?token=<JWT>; never write it to logs
morgan.token('url', (req) => (req.originalUrl || req.url).replace(/([?&]token=)[^&]+/g, '$1[redacted]'));
app.use(
  morgan(env.isProduction ? 'combined' : 'dev', {
    stream: { write: (message) => logger.info(message.trim()) },
    // Frame pushes arrive every second from each camera - keep logs readable
    skip: (req) => req.originalUrl.startsWith('/api/devices/frame') || req.originalUrl.startsWith('/api/live/'),
  })
);

app.use(env.apiPrefix, apiLimiter);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'FaceAttend Pro API' }));
// Student photos and recognition snapshots are biometric data: they used to
// be world-readable by URL. Now a valid login is required (?token= for <img>).
app.use(
  '/uploads',
  authenticateFlexible,
  (req, res, next) => {
    res.setHeader('Cache-Control', 'private, max-age=3600');
    next();
  },
  express.static(path.join(process.cwd(), env.upload.dir), { dotfiles: 'deny', index: false })
);
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use(env.apiPrefix, routes);

// Serve the built React app (frontend/dist) in production / single-port mode
const distCandidates = [
  path.resolve(__dirname, '../../frontend/dist'),
  path.resolve(__dirname, '../frontend/dist'),
  process.resourcesPath ? path.join(process.resourcesPath, 'frontend/dist') : null,
].filter(Boolean);

const distDir = distCandidates.find((d) => fs.existsSync(path.join(d, 'index.html')));
if (distDir) {
  app.use(express.static(distDir, { maxAge: '1h', index: false }));
  app.get(/^\/(?!api|uploads|api-docs).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));
} else {
  app.get('/', (req, res) =>
    res.json({ success: true, message: 'FaceAttend Pro API. Run the frontend with "npm run dev" in /frontend.', docs: '/api-docs' })
  );
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
