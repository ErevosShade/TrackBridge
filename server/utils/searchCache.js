/**
 * searchCache.js
 *
 * In-memory LRU-style cache for track search results.
 * Saves 100 YouTube units every time the same "artist - name"
 * combo is looked up more than once (e.g. same song in two playlists).
 *
 * TTL: 24 hours  |  Max entries: 2,000
 */

const TTL_MS    = 1000 * 60 * 60 * 24; // 24 hours
const MAX_SIZE  = 2_000;

const cache = new Map();

function makeKey(platform, name, artist) {
  return `${platform}:${name.toLowerCase().trim()}:${artist.toLowerCase().trim()}`;
}

function get(platform, name, artist) {
  const key = makeKey(platform, name, artist);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) { cache.delete(key); return null; }
  return entry.value;
}

function set(platform, name, artist, value) {
  // Evict oldest entry if at capacity
  if (cache.size >= MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  const key = makeKey(platform, name, artist);
  cache.set(key, { value, ts: Date.now() });
}

function stats() {
  return { size: cache.size, maxSize: MAX_SIZE };
}

module.exports = { get, set, stats };
