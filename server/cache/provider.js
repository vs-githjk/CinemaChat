import { logger } from '../observability/logger.js';

function now() {
  return Date.now();
}

class MemoryCacheProvider {
  constructor() {
    this.map = new Map();
  }

  async get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, ttlSeconds = 300) {
    const expiresAt = now() + Math.max(1, ttlSeconds) * 1000;
    this.map.set(key, { value, expiresAt });
  }
}

class RedisCacheProvider {
  constructor() {
    throw new Error('Redis cache provider is not implemented yet. Falling back to memory cache.');
  }
}

export function createCacheProvider() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    try {
      return new RedisCacheProvider(redisUrl);
    } catch (err) {
      logger.warn('Redis cache unavailable, using memory cache', { reason: err.message });
    }
  }
  return new MemoryCacheProvider();
}

