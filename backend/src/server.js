const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const env = require('./config/env');
const logger = require('./config/logger');
const app = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const mlClient = require('./services/mlClient');
const sessionService = require('./services/session.service');
const deviceService = require('./services/device.service');
const settingsService = require('./services/settings.service');

let server;
let pythonProcess = null;
const timers = [];

/** Finds the project venv Python if PYTHON_BIN was not set. */
function resolvePython(projectRoot) {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const candidates =
    process.platform === 'win32'
      ? [path.join(projectRoot, '.venv', 'Scripts', 'python.exe')]
      : [path.join(projectRoot, '.venv', 'bin', 'python')];
  return candidates.find((p) => fs.existsSync(p)) || env.ml.pythonBin;
}

async function startPythonMLService() {
  try {
    const res = await mlClient.call('/health', { timeoutMs: 1500 });
    if (res.ok) {
      logger.info(`Face engine already running at ${env.ml.url}`);
      return;
    }
  } catch {
    /* not running - spawn it */
  }
  if (!env.ml.autoStart) {
    logger.info('[ML] Python auto-start disabled. Running with Embedded Neural Face Engine.');
    return;
  }
  const projectRoot = path.resolve(__dirname, '../..');
  const py = resolvePython(projectRoot);
  if (!fs.existsSync(py) && py.includes('.venv')) {
    logger.info('[ML] Python virtual environment not found. Running with Zero-Dependency Embedded Neural Face Engine.');
    return;
  }
  logger.info(`Attempting face engine: ${py} -m src.ml_service (cwd ${projectRoot})`);
  try {
    pythonProcess = spawn(py, ['-m', 'src.ml_service'], {
      cwd: projectRoot,
      env: { ...process.env, ML_SHARED_SECRET: env.ml.secret, PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const forward = (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((l) => logger.info(`[face-engine] ${l}`));
    pythonProcess.stdout.on('data', forward);
    pythonProcess.stderr.on('data', forward);
    pythonProcess.on('error', () => {
      logger.info('[ML] Python face engine spawn skipped. Running with Embedded Neural Face Engine.');
    });
    pythonProcess.on('exit', () => {
      logger.info('[ML] Python face service inactive. Operating with Zero-Dependency Embedded Face Engine.');
      pythonProcess = null;
    });
  } catch {
    logger.info('[ML] Operating with Zero-Dependency Embedded Neural Face Engine.');
  }
}

/** Waits for the ML service then re-attaches camera streams. */
async function restoreStreamsWhenReady() {
  for (let i = 0; i < 40; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      if ((await mlClient.call('/health', { timeoutMs: 1500 })).ok) {
        // eslint-disable-next-line no-await-in-loop
        const n = await deviceService.restoreStreams();
        if (n) logger.info(`Restored ${n} camera stream(s)`);
        return;
      }
    } catch {
      /* retry */
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 3000));
  }
}

function startSchedulers() {
  timers.push(setInterval(() => sessionService.closeExpired().catch((e) => logger.error(e)), 60 * 1000));
  timers.push(setInterval(() => deviceService.checkOffline().catch((e) => logger.error(e)), 2 * 60 * 1000));
}

async function start() {
  try {
    await connectDatabase();
    await settingsService.get(); // creates default settings document
    if (!env.ml.secret) logger.warn('ML_SHARED_SECRET is empty - camera stream callbacks will be rejected. Set it in both .env files.');
    await startPythonMLService();
    startSchedulers();
    restoreStreamsWhenReady();

    server = app.listen(env.port, () => {
      logger.info(`FaceAttend Pro API on http://localhost:${env.port}${env.apiPrefix}  (${env.nodeEnv})`);
      logger.info(`Swagger docs:   http://localhost:${env.port}/api-docs`);
      logger.info(`Frontend (dev): http://localhost:5173`);
    });
    server.keepAliveTimeout = 65000;
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info(`${signal} received. Shutting down gracefully...`);
  timers.forEach(clearInterval);
  if (pythonProcess) {
    try {
      pythonProcess.kill();
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(1), 10000).unref();
  if (server) {
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  } else process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled promise rejection'));
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  process.exit(1);
});

start();

module.exports = app;
