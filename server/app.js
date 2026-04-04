import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

import authRoutes from './routes/auth.js';
import recommendationRoutes from './routes/recommendations.js';
import socialRoutes from './routes/social.js';
import userRoutes from './routes/users.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { logger } from './observability/logger.js';
import { reportError } from './observability/monitoring.js';

export function createApp({ env, pool }) {
  const app = express();
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    req.log = {
      info: (message, context = {}) => logger.info(message, { requestId: req.requestId, ...context }),
      warn: (message, context = {}) => logger.warn(message, { requestId: req.requestId, ...context }),
      error: (message, context = {}) => logger.error(message, { requestId: req.requestId, ...context }),
    };
    res.setHeader('X-Request-Id', req.requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (env.nodeEnv === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(cors({
    origin(origin, callback) {
      if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
  }));

  app.use(express.json({ limit: env.requestBodyLimit }));

  app.use(createRateLimiter({ windowMs: 60_000, max: 120, keyPrefix: 'global' }));
  app.use('/api/auth', createRateLimiter({ windowMs: 15 * 60_000, max: 30, keyPrefix: 'auth' }));
  app.use('/api/recommendations', createRateLimiter({ windowMs: 60_000, max: 20, keyPrefix: 'recommendations' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/recommendations', recommendationRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/users', userRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      env: env.nodeEnv,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.get('/api/ready', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not_ready' });
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, req, res, _next) => {
    const status = err.message === 'Not allowed by CORS' ? 403 : 500;
    reportError(err, {
      requestId: req.requestId,
      operation: 'express_error_handler',
      path: req.path,
      method: req.method,
    });
    res.status(status).json({
      error: status === 403 ? 'Origin not allowed' : 'Server error',
      requestId: req.requestId,
    });
  });

  return app;
}

