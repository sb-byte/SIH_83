'use strict';
/**
 * Boots the auth API on a throwaway database, then runs the browser-client
 * harness (client-e2e.mjs) against it. Zero dependencies.
 *
 * UNITY_DEMO_MODE=1 is set here because the harness needs live TOTP codes for the
 * Tier 1 / Tier 2 accounts. Never set it in a deployment.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = process.env.PORT || '4000';
const DB = path.join(os.tmpdir(), 'unity-eoc-client-e2e.json');
try { fs.unlinkSync(DB); } catch { /* first run */ }

const env = {
  ...process.env,
  PORT,
  DB_PATH: DB,
  JWT_SECRET: 'client-e2e-secret-do-not-use-in-prod',
  UNITY_DEMO_MODE: '1',
};

const seed = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'db', 'seed.js'), '--reset'], { env, stdio: 'ignore' });
seed.on('exit', () => {
  const api = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], { env, stdio: 'ignore' });
  const done = (code) => { api.kill(); process.exit(code); };
  setTimeout(() => {
    const t = spawn(process.execPath, [path.join(__dirname, 'client-e2e.mjs')], {
      env: { ...env, UNITY_API_TARGET: `http://localhost:${PORT}` },
      stdio: 'inherit',
    });
    t.on('exit', done);
  }, 1200);
});
