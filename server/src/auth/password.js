'use strict';
/**
 * Password hashing with scrypt (Node built-in KDF). No plaintext is ever stored.
 * Stored format: scrypt$N$r$p$saltB64$hashB64. Verification is constant-time.
 */
const crypto = require('crypto');

const N = 16384, r = 8, p = 1, KEYLEN = 32, MAXMEM = 64 * 1024 * 1024;

function hash(password) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(password, salt, KEYLEN, { N, r, p, maxmem: MAXMEM });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

function verify(password, stored) {
  try {
    const [scheme, N_, r_, p_, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const dk = crypto.scryptSync(password, salt, expected.length,
      { N: +N_, r: +r_, p: +p_, maxmem: MAXMEM });
    return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}

module.exports = { hash, verify };
