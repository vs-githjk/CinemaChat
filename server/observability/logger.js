function serializeError(err) {
  if (!err) return null;
  return {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
}

function write(level, message, context = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export const logger = {
  info(message, context) {
    write('info', message, context);
  },
  warn(message, context) {
    write('warn', message, context);
  },
  error(message, context) {
    const next = { ...context };
    if (next?.error instanceof Error) {
      next.error = serializeError(next.error);
    }
    write('error', message, next);
  },
};

