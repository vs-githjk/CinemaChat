import { logger } from './logger.js';

let sentryEnabled = false;

export function initMonitoring() {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (dsn) {
    sentryEnabled = true;
    logger.info('Sentry DSN detected. Monitoring hook enabled.');
  }
}

export function reportError(error, context = {}) {
  logger.error('Unhandled application error', { ...context, error });
  if (sentryEnabled) {
    logger.warn('Sentry capture hook called (SDK not yet wired)', {
      requestId: context.requestId,
      operation: context.operation,
    });
  }
}

