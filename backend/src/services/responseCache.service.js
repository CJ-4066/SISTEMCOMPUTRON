const env = require('../config/env');

const DEFAULT_TTL_MS = env.responseCacheTtlMs;
const MAX_CACHE_ENTRIES = env.responseCacheMaxEntries;

const cacheStore = new Map();

const stableSerialize = (value) => {
  if (value === null || value === undefined) return 'null';
  const valueType = typeof value;

  if (valueType === 'number' || valueType === 'boolean') {
    return String(value);
  }

  if (valueType === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  if (valueType === 'object') {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(String(value));
};

const buildCacheKey = (namespace, payload = {}) => `${namespace}:${stableSerialize(payload)}`;

const pruneExpiredEntries = () => {
  const now = Date.now();
  for (const [key, entry] of cacheStore.entries()) {
    if (!entry || entry.expiresAt <= now) {
      cacheStore.delete(key);
    }
  }
};

const enforceMaxEntries = () => {
  const maxEntries = Number.isFinite(MAX_CACHE_ENTRIES) ? Math.max(1, MAX_CACHE_ENTRIES) : 500;
  if (cacheStore.size <= maxEntries) return;

  const overflow = cacheStore.size - maxEntries;
  let removed = 0;
  for (const key of cacheStore.keys()) {
    cacheStore.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
};

const getCachedResponse = (key) => {
  if (!key) return null;

  const entry = cacheStore.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    cacheStore.delete(key);
    return null;
  }

  return entry.value ?? null;
};

const setCachedResponse = (key, value, ttlMs = DEFAULT_TTL_MS) => {
  if (!key) return;

  const safeTtlMs = Number.isFinite(Number(ttlMs)) ? Math.max(1_000, Number(ttlMs)) : DEFAULT_TTL_MS;
  pruneExpiredEntries();
  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + safeTtlMs,
  });
  enforceMaxEntries();
};

const invalidateCacheByPrefix = (prefix) => {
  if (!prefix) {
    cacheStore.clear();
    return;
  }

  const namespacedPrefix = `${String(prefix)}:`;
  for (const key of cacheStore.keys()) {
    if (key.startsWith(namespacedPrefix)) {
      cacheStore.delete(key);
    }
  }
};

module.exports = {
  buildCacheKey,
  getCachedResponse,
  setCachedResponse,
  invalidateCacheByPrefix,
};
