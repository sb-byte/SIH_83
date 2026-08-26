'use strict';
/**
 * Hand-rolled HS256 JWT (no external dependency).
 * Token embeds { sub/id, role, region, site, team } — the authorization scope.
 * The signature is verified server-side on EVERY request; a client-sent role or
 * jurisdiction is never trusted. Signature comparison is constant-time.
 */
const crypto = require('crypto');
const { JWT_SECRET, TOKEN_TTL_SECONDS } = require('../config/env');

const b64urlJSON = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function sign(payload, { expiresIn = TOKEN_TTL_SECONDS } = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresIn, jti: crypto.randomUUID() };
  const data = `${b64urlJSON(header)}.${b64urlJSON(body)}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verify(token) {
  if (typeof token !== 'string') return { valid: false, error: 'no_token' };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, error: 'malformed' };
  const data = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, error: 'bad_signature' };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return { valid: false, error: 'bad_payload' };
  }
  const now = Math.floor(Date.now() / 1000);
  // A token with no (or a non-numeric) exp is REJECTED rather than treated as
  // eternal. sign() always sets one, so this only matters if the signing key ever
  // leaks — and then an unexpiring token is the worst thing an attacker can mint.
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return { valid: false, error: 'no_expiry' };
  }
  if (now >= payload.exp) return { valid: false, error: 'expired' };
  return { valid: true, payload };
}

module.exports = { sign, verify };
