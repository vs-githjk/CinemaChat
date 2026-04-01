const store = new Map();

function now() {
  return Date.now();
}

function cleanup() {
  const t = now();
  for (const [key, value] of store.entries()) {
    if (value.resetAt <= t) {
      store.delete(key);
    }
  }
}

setInterval(cleanup, 60_000).unref();

export function createRateLimiter({
  windowMs,
  max,
  keyPrefix,
  message = 'Too many requests. Please try again shortly.',
}) {
  return function rateLimiter(req, res, next) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const entry = store.get(key);
    const t = now();

    if (!entry || entry.resetAt <= t) {
      store.set(key, { count: 1, resetAt: t + windowMs });
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - t) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ error: message });
    }

    return next();
  };
}
