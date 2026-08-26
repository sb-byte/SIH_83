'use strict';
/**
 * Environment & configuration.
 * JWT secret precedence: process.env.JWT_SECRET -> data/.jwt_secret (dev, auto-generated).
 * In production ALWAYS set JWT_SECRET explicitly.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

const IS_PROD = process.env.NODE_ENV === 'production';

function resolveSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  // Refuse to boot in production rather than invent a secret. On a host with an
  // ephemeral filesystem (Render's free tier, any container) a generated secret is
  // regenerated on every restart, which silently invalidates every live session —
  // a confusing failure to debug mid-demo. Better to fail loudly at boot.
  if (IS_PROD) {
    console.error('\n[env] FATAL: JWT_SECRET is not set and NODE_ENV=production.');
    console.error('       Set JWT_SECRET to a long random string in your host\'s environment.');
    console.error('       Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"\n');
    process.exit(1);
  }
  ensureDataDir();
  const p = path.join(DATA_DIR, '.jwt_secret');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(p, s, { mode: 0o600 });
  console.warn('[env] No JWT_SECRET set — generated a dev secret in data/.jwt_secret. Set JWT_SECRET in production.');
  return s;
}

// Origins allowed to call this API cross-origin. Comma-separated; empty by
// default, so cross-origin access is refused until you opt in.
// e.g. ALLOWED_ORIGINS="https://unity-eoc.vercel.app,https://*.vercel.app"
function resolveOrigins() {
  return String(process.env.ALLOWED_ORIGINS || '')
    .split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
}

// Stable TOTP secrets, so a redeploy or reseed does not invalidate the authenticator
// app a demo account is already enrolled in. Shape: {"NDMA-AUTH-01":"BASE32...",...}
// Generate with `npm run enroll`. Absent -> the seeder mints fresh random secrets.
function resolveTotpSecrets() {
  const raw = process.env.TOTP_SECRETS;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return parsed;
  } catch (e) {
    console.error(`[env] TOTP_SECRETS is not valid JSON (${e.message}); falling back to random secrets.`);
    return null;
  }
}

module.exports = {
  ROOT,
  DATA_DIR,
  IS_PROD,
  ALLOWED_ORIGINS: resolveOrigins(),
  TOTP_SECRETS: resolveTotpSecrets(),
  ensureDataDir,
  PORT: parseInt(process.env.PORT || '4000', 10),
  JWT_SECRET: resolveSecret(),
  TOKEN_TTL_SECONDS: parseInt(process.env.TOKEN_TTL || '3600', 10),
  DB_PATH: process.env.DB_PATH || path.join(DATA_DIR, 'unity-eoc.json'),
  // Demo-only shared password for all seeded accounts. Documented in README.
  DEMO_PASSWORD: process.env.DEMO_PASSWORD || 'Unity@2026',
};
