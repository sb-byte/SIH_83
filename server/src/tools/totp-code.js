'use strict';
/**
 * Dev helper: print the current TOTP code for a Tier 1/2 credential.
 *   npm run totp AUTH-IN-001
 * // TODO(prod): remove — in production the user reads codes from their own
 * // authenticator app; the server must never emit live codes.
 */
const store = require('../db/store');
const totp = require('../auth/totp');

const cred = process.argv[2];
store.load();

if (!cred) {
  const t = store.all('users').filter((u) => u.totp_secret);
  console.log('Tier 1/2 credentials with 2FA:');
  for (const u of t) console.log(`  ${u.credential_id}  code now: ${totp.generate(u.totp_secret)}`);
  process.exit(0);
}

const user = store.all('users').find((u) => u.credential_id === cred);
if (!user) { console.error(`No user with credential "${cred}"`); process.exit(1); }
if (!user.totp_secret) { console.error(`${cred} (role ${user.role}) does not use 2FA.`); process.exit(1); }
console.log(totp.generate(user.totp_secret));
