'use strict';
/**
 * RFC 6238 TOTP (time-based one-time password) — real 2FA, compatible with
 * Google Authenticator / Authy. SHA1, 6 digits, 30s step. Built on crypto only.
 *
 * For the demo we also expose the current code via `npm run totp <credential>`
 * so you can log in as a Tier 1/2 user without provisioning an authenticator app.
 * // TODO(prod): back this with per-user enrolled secrets + rate-limited attempts.
 */
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, val = 0, out = '';
  for (const byte of buf) {
    val = (val << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0, val = 0; const out = [];
  for (const ch of String(str).replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

function hotp(secretB32, counter) {
  const key = base32Decode(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code = ((h[offset] & 0x7f) << 24) | ((h[offset + 1] & 0xff) << 16) |
               ((h[offset + 2] & 0xff) << 8) | (h[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, '0');
}

function generate(secretB32, time = Date.now(), step = 30) {
  return hotp(secretB32, Math.floor(time / 1000 / step));
}

// Returns the matched counter (so the caller can burn it and prevent replay of a
// still-valid code) or null. verify() is the boolean wrapper.
function matchCounter(secretB32, token, { time = Date.now(), step = 30, window = 1 } = {}) {
  if (!token) return null;
  token = String(token).trim();
  if (!/^[0-9]{6}$/.test(token)) return null;
  const c = Math.floor(time / 1000 / step);
  for (let w = -window; w <= window; w++) {
    if (hotp(secretB32, c + w) === token) return c + w; // accept ±1 step for clock skew
  }
  return null;
}

function verify(secretB32, token, opts = {}) {
  return matchCounter(secretB32, token, opts) !== null;
}

function otpauthURI(secretB32, label, issuer = 'Unity EOC') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}` +
         `?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = { generateSecret, generate, verify, matchCounter, otpauthURI, base32Encode, base32Decode };
