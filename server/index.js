import pool from './db.js';
import { getEnv } from './config/env.js';
import { createApp } from './app.js';
import { initMonitoring } from './observability/monitoring.js';
import { logger } from './observability/logger.js';

const env = getEnv();
const PORT = env.port;
const app = createApp({ env, pool });
initMonitoring();

const server = app.listen(PORT, () => {
  logger.info('CinemaChat server started', { port: PORT, env: env.nodeEnv });
});

async function shutdown(signal) {
  logger.info('Shutdown signal received', { signal });
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
