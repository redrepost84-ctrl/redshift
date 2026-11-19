/**
 * Lightweight in-memory sliding-window rate limiter keyed by endpoint bucket + client/IP.
 */
export function createRateLimiter() {
  /** @type {Map<string, number[]>} */
  const buckets = new Map();
  let opsSincePrune = 0;

  /**
   * Records a hit for `key` within `windowMs`.
   * @param {string} key
   * @param {number} maxHits
   * @param {number} windowMs
   * @returns {{ ok: boolean; retryAfterSec: number }}
   */
  const check = (key, maxHits, windowMs) => {
    const now = Date.now();
    const cutoff = now - windowMs;
    const prev = buckets.get(key) ?? [];
    const active = prev.filter((ts) => ts > cutoff);

    if (active.length >= maxHits) {
      const oldest = active[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      buckets.set(key, active);
      return { ok: false, retryAfterSec };
    }

    active.push(now);
    buckets.set(key, active);

    opsSincePrune += 1;
    if (opsSincePrune >= 250) {
      opsSincePrune = 0;
      for (const [bKey, list] of buckets.entries()) {
        if (list.length === 0 || list[list.length - 1] <= now - 15 * 60_000) {
          buckets.delete(bKey);
        }
      }
    }

    return { ok: true, retryAfterSec: 0 };
  };

  return { check };
}

/** Extracts a normalized client IP string for per-IP rate limiting. */
export function getRequestClientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}
