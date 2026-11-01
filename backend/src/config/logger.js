const pino = require('pino');
const env = require('./env');

const isBundled = typeof __filename === 'string' && __filename.includes('server.bundle.js');

let transport;
try {
  if (!env.isProduction && !isBundled && !process.env.BUNDLED_SERVER) {
    // Only attempt worker thread pino-pretty if node_modules worker exists on disk
    const workerPath = require.resolve('pino/lib/worker.js');
    if (require('fs').existsSync(workerPath)) {
      transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      };
    }
  }
} catch {
  transport = undefined;
}

const logger = pino({
  level: env.logLevel || 'info',
  transport,
});

module.exports = logger;
