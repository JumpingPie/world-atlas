// src/core/data-cache.js
//
// Browser-side cache for fetched country data.
//
// What this is: a small TTL-aware key/value store backed by
// localStorage. Fetchers feed into it; panels and layers read from it.
//
// Why it exists: a stats card or layer that's clicked twice shouldn't
// re-hit Wikidata. We also want the cache to survive page reloads, so
// re-clicking a country after a refresh is instant. localStorage is
// the right tool: persistent, synchronous, ~5MB available, and we're
// only storing JSON, not blobs.
//
// Why this isn't simply Section 1's data/ folder: that folder is
// populated by the scheduled refresh (a GitHub Action, added in a
// later section). Until that exists, the browser is the only place
// that ever runs a fetcher, and it needs somewhere to remember the
// result. Once the scheduled refresh exists, this cache will become a
// secondary layer: pre-baked JSON in data/ gets first dibs, and the
// cache only stores ad-hoc fetches (e.g. countries the schedule
// missed).

const CACHE_PREFIX = "atlas.cache.";

/**
 * One cache entry on disk has this shape:
 *
 *   {
 *     v: <schema version>,    // bumped if we ever change entry shape
 *     t: <unix ms timestamp>, // when it was written
 *     d: <data>,              // whatever the fetcher returned
 *   }
 *
 * Bumping CACHE_FORMAT_VERSION invalidates all old entries on first
 * read after deploy — useful if we ever change what fetchers return
 * and don't want stale shapes confusing consumers.
 */
const CACHE_FORMAT_VERSION = 1;

/**
 * Read a cached value if it exists and is still fresh.
 *
 * @param {string} key - Cache key (caller's choice; convention is
 *     `${fetcherId}:${countryCode}`).
 * @param {number} ttlMs - How old the entry can be before it's
 *     considered stale. Pass Infinity to ignore TTL.
 * @returns {any | undefined} The cached data, or undefined if missing
 *     or stale.
 */
export function readCache(key, ttlMs) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw);
    if (entry.v !== CACHE_FORMAT_VERSION) return undefined;
    if (Date.now() - entry.t > ttlMs) return undefined;
    return entry.d;
  } catch (err) {
    // Corrupt entry — discard it so we don't keep tripping over it.
    console.warn(`[data-cache] discarding corrupt entry "${key}":`, err);
    try {
      localStorage.removeItem(CACHE_PREFIX + key);
    } catch {
      /* ignore */
    }
    return undefined;
  }
}

/**
 * Write a value to the cache.
 *
 * @param {string} key
 * @param {any} data - Anything JSON-serializable.
 */
export function writeCache(key, data) {
  try {
    const entry = { v: CACHE_FORMAT_VERSION, t: Date.now(), d: data };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch (err) {
    // Most likely cause: quota exceeded. Log and carry on; the next
    // page load will just refetch. We don't try to evict here yet —
    // we'll add an LRU policy if cache size becomes a real issue.
    console.warn(`[data-cache] failed to write "${key}":`, err);
  }
}

/**
 * In-flight promise map. Coalesces concurrent calls to the same
 * key — if three cards all call getOrFetch("wikidata-stats:818")
 * at the same time, only the first triggers a network request and
 * the other two await the same promise.
 *
 * Without this, simultaneous mounts of the stats card, summary
 * card, and bottom-panel timeline (all of which call
 * fetchCountryStats) would each fire their own SPARQL query for
 * the same country before any of them got far enough to write the
 * cache entry — tripling the load on Wikidata's rate limiter for
 * no benefit.
 */
const inFlight = new Map();

/**
 * Get-or-fetch helper. Tries the cache; on miss, runs the fetcher,
 * caches the result, and returns it. Concurrent calls with the
 * same key share one fetch.
 *
 * @param {string} key
 * @param {number} ttlMs - Max acceptable age for the cached value.
 * @param {() => Promise<any>} fetcher - Called only on cache miss.
 * @returns {Promise<any>}
 */
export async function getOrFetch(key, ttlMs, fetcher) {
  const cached = readCache(key, ttlMs);
  if (cached !== undefined) return cached;

  // If a fetch for this key is already in flight, return the same
  // promise instead of starting another one. The first caller's
  // fetcher() is the only one that runs; everyone else awaits the
  // same result.
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const promise = (async () => {
    try {
      const data = await fetcher();
      writeCache(key, data);
      return data;
    } finally {
      // Clear the in-flight entry whether we resolved or rejected,
      // so the next call (after a failure) can retry. With this,
      // a transient network error doesn't poison the key forever.
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/**
 * Wipe every entry this cache owns. Useful for development and for a
 * future "clear cache" UI button. Leaves other localStorage entries
 * (e.g. the Ollama settings) alone.
 */
export function clearCache() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
  }
  for (const k of keys) localStorage.removeItem(k);
}
