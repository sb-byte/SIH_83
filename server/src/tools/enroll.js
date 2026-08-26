'use strict';
/**
 * `npm run enroll` — mint STABLE TOTP secrets for the Tier 1 / Tier 2 accounts.
 *
 * Why this exists: on a deployed demo you cannot run `npm run totp`, and the demo
 * TOTP endpoint is (correctly) disabled outside UNITY_DEMO_MODE. Without stable
 * secrets, every redeploy reseeds the database with new ones and orphans whatever
 * you enrolled in Google Authenticator.
 *
 * Run it ONCE, paste the TOTP_SECRETS line into your host's environment, and scan
 * the otpauth:// URIs into an authenticator app. The secrets are then fixed across
 * redeploys — and they still never travel over HTTP.
 */
const totp = require('../auth/totp');
const roster = require('../db/roster');

const twoFactor = roster.ROSTER.filter((u) => u.role === 'T1' || u.role === 'T2');
const secrets = {};
for (const u of twoFactor) secrets[u.cred] = totp.generateSecret();

console.log('\n=== 1. Set this environment variable on your host (Render → Environment) ===\n');
console.log(`TOTP_SECRETS=${JSON.stringify(secrets)}`);

console.log('\n=== 2. Enrol these in Google Authenticator / Authy (scan or paste) ===\n');
for (const u of twoFactor) {
  console.log(`  ${u.cred}  (${u.role} — ${u.name})`);
  console.log(`    secret : ${secrets[u.cred]}`);
  console.log(`    uri    : ${totp.otpauthURI(secrets[u.cred], u.cred)}`);
  console.log(`    code now: ${totp.generate(secrets[u.cred])}\n`);
}

console.log('=== 3. Then reseed so the database picks them up ===\n');
console.log('  TOTP_SECRETS=\'<the line above>\' npm run reset      (locally)');
console.log('  ...or just redeploy — the server seeds an empty database on boot.\n');
console.log('Treat this output as a secret. Anyone holding it can generate valid');
console.log('second factors for the Tier 1 national accounts.\n');
