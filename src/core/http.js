// src/core/http.js
//
// Wrappers around fetch with the policies the app needs uniformly.
//
// Right now there's just one wrapper: fetchWithRetry, which handles
// transient HTTP errors (429 Too Many Requests, 503 Service
// Unavailable) by waiting and retrying with exponential backoff.
// Without it, momentary rate limits from Wikidata or Wikipedia
// surface as hard error states in the UI even though the right
// thing was usually to wait a second and try again.
//
// Why a centralized wrapper rather than per-fetcher logic: the
// retry policy should be consistent across every external request
// the app makes. Fetchers that bypass this would each invent their
// own ad-hoc retry, or — more commonly — invent none and fail
// loudly on transient errors.
//
// What we deliberately don't do here:
//   - Caching. That lives in src/core/data-cache.js, one layer up.
//     A retry on a 429 is about retrying the same request; caching
//     is about not making the request at all when we already have
//     the answer.
//   - Authentication. None of our APIs require it.
//   - Body parsing. Callers do their own .json() / .text().

/**
 * Default retry budget. Three retries plus the original attempt =
 * up to four total. Rate limits typically clear within a few
 * seconds of backoff; if they don't, surfacing the error to the
 * user is more honest than retrying forever.
 */
const DEFAULT_MAX_RETRIES = 3;

/**
 * Base delay between retries, in milliseconds. Each retry waits
 * 2^attempt * BASE_DELAY plus a jitter, so attempt 0 waits ~800ms,
 * attempt 1 ~1600ms, attempt 2 ~3200ms, etc. The jitter avoids
 * thundering-herd retries from multiple in-flight fetchers all
 * hitting their backoff at the same instant.
 */
const BASE_DELAY_MS = 800;

/**
 * Maximum jitter added to each backoff window. Random in [0, max).
 */
const MAX_JITTER_MS = 400;

/**
 * HTTP statuses that mean "try again later, this isn't a permanent
 * failure." Anything else (4xx other than 429, or any 5xx other
 * than 503) is returned to the caller without retry — those are
 * usually genuine errors that won't get better with patience.
 */
const RETRY_STATUSES = new Set([429, 503]);

/**
 * Fetch with automatic retry on transient errors.
 *
 * Successful responses (any status outside RETRY_STATUSES, even
 * 4xx) are returned immediately so the caller can do its own
 * status-based handling (e.g. treating 404 as "no such article").
 *
 * @param {string | URL} url
 * @param {RequestInit} [init]
 * @param {object} [options]
 * @param {number} [options.maxRetries] - Override DEFAULT_MAX_RETRIES.
 * @returns {Promise<Response>} The Response from the first
 *     successful (or non-retriable) attempt.
 */
export async function fetchWithRetry(url, init, options = {}) {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  let attempt = 0;

  while (true) {
    let response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      // Network errors (DNS, offline, CORS rejection) — retry the
      // first couple of times, since transient connectivity blips
      // shouldn't fail loudly. After max retries, surface the error.
      if (attempt >= maxRetries) throw err;
      await wait(backoffMs(attempt));
      attempt++;
      continue;
    }

    if (!RETRY_STATUSES.has(response.status)) {
      return response;
    }

    if (attempt >= maxRetries) {
      // Out of retries — return the response and let the caller
      // surface it as an error. We've done what we can.
      return response;
    }

    // Honor Retry-After if present. Wikipedia and Wikidata both
    // sometimes set it on 429s. The spec allows seconds (most
    // common) or an HTTP-date; we only handle seconds — anything
    // else falls back to our exponential backoff.
    const retryAfter = response.headers.get("Retry-After");
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : 0;
    const delay = Math.max(backoffMs(attempt), retryAfterMs || 0);

    await wait(delay);
    attempt++;
  }
}

/** Compute exponential backoff with jitter for a given attempt. */
function backoffMs(attempt) {
  const exp = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * MAX_JITTER_MS;
  return exp + jitter;
}

/** Promisified setTimeout — `await wait(ms)` reads naturally in
 *  retry loops. */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
