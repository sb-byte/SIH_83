'use strict';
/**
 * Login throttling + token revocation. Both are in-process (Map/Set) because the
 * server is a single node with a JSON store; a multi-instance deployment must move
 * these to Redis or the DB or the limits become per-instance.
 *
 * WHY THROTTLING IS LOAD-BEARING HERE, not a nicety:
 * GET /api/directory publishes every credential ID (the login screen needs it) and
 * the seeded demo password is documented. That leaves the rotating TOTP code as the
 * only thing standing between the public internet and Tier-1 national authority.
 * A 6-digit code with a +/-1 step window is 3 acceptable values out of 1e6, so an
 * unthrottled endpoint is guessable in about an hour at 100 req/s. With the limits
 * below the same attack needs centuries.
 */

const WINDOW_MS = 15 * 60 * 1000;   // failures older than this are forgotten
const CRED_MAX = 8;                 // failures per credential before lockout
const IP_MAX = 30;                  // failures per source address before lockout
const LOCK_MS = 15 * 60 * 1000;     // lockout duration
const BASE_DELAY_MS = 250;          // linear backoff per recent failure
const MAX_DELAY_MS = 4000;

const buckets = new Map();          // key -> { fails: number[], lockedUntil: number }
const usedTotp = new Set();         // `${userId}:${counter}` — burnt codes
const revoked = new Map();          // jti -> expiry epoch seconds

function bucket(key) {
  let b = buckets.get(key);
  if (!b) { b = { fails: [], lockedUntil: 0 }; buckets.set(key, b); }
  const cutoff = Date.now() - WINDOW_MS;
  b.fails = b.fails.filter((t) => t > cutoff);
  return b;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Called BEFORE the password is checked. Returns null to proceed, or
 * { retryAfter } when the caller should be refused with 429.
 */
function checkLogin(ip, credentialId) {
  const now = Date.now();
  for (const key of [`ip:${ip}`, `cred:${String(credentialId || '').toUpperCase()}`]) {
    const b = bucket(key);
    if (b.lockedUntil > now) {
      return { retryAfter: Math.ceil((b.lockedUntil - now) / 1000), key };
    }
  }
  return null;
}

/** Linear backoff so a scripted attacker pays for every miss. */
async function delayForFailures(ip, credentialId) {
  const n = Math.max(
    bucket(`ip:${ip}`).fails.length,
    bucket(`cred:${String(credentialId || '').toUpperCase()}`).fails.length,
  );
  if (n > 0) await sleep(Math.min(n * BASE_DELAY_MS, MAX_DELAY_MS));
}

function recordFailure(ip, credentialId) {
  const now = Date.now();
  const pairs = [[`ip:${ip}`, IP_MAX], [`cred:${String(credentialId || '').toUpperCase()}`, CRED_MAX]];
  let locked = false;
  for (const [key, max] of pairs) {
    const b = bucket(key);
    b.fails.push(now);
    if (b.fails.length >= max) { b.lockedUntil = now + LOCK_MS; b.fails = []; locked = true; }
  }
  return locked;
}

function recordSuccess(ip, credentialId) {
  buckets.delete(`ip:${ip}`);
  buckets.delete(`cred:${String(credentialId || '').toUpperCase()}`);
}

/**
 * Burn a TOTP counter. A code stays mathematically valid for ~90s across the skew
 * window; without this, one shoulder-surfed code mints tokens repeatedly.
 * Returns false if this counter was already spent for this user.
 */
function consumeTotp(userId, counter) {
  const key = `${userId}:${counter}`;
  if (usedTotp.has(key)) return false;
  usedTotp.add(key);
  // Counters are monotonic; drop anything more than 5 steps old.
  if (usedTotp.size > 500) {
    const floor = counter - 5;
    for (const k of usedTotp) {
      const [, c] = k.split(':');
      if (Number(c) < floor) usedTotp.delete(k);
    }
  }
  return true;
}

function revoke(jti, exp) { if (jti) revoked.set(jti, exp || 0); }

function isRevoked(jti) {
  if (!jti) return false;
  const now = Math.floor(Date.now() / 1000);
  for (const [k, e] of revoked) if (e && e < now) revoked.delete(k);  // token expired anyway
  return revoked.has(jti);
}

module.exports = {
  checkLogin, delayForFailures, recordFailure, recordSuccess,
  consumeTotp, revoke, isRevoked,
  _limits: { WINDOW_MS, CRED_MAX, IP_MAX, LOCK_MS },
};
