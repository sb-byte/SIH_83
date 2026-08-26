'use strict';
/**
 * Adversarial break-test suite.
 * ---------------------------------------------------------------------------
 * These tests actively TRY to violate the spec's hard security boundaries and
 * assert that the server REFUSES. They run against a real booted server over
 * HTTP, using a throwaway test database (never touches data/unity-eoc.json).
 *
 * Run: npm test   (or: node test/break-tests.js)
 * Exit code is non-zero if any boundary is breached.
 */

// Isolate test data + secret BEFORE requiring anything that reads env.
const os = require('os');
const path = require('path');
const fs = require('fs');
process.env.DB_PATH = path.join(os.tmpdir(), 'unity-eoc-test.json');
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.TOKEN_TTL = '3600';
try { fs.unlinkSync(process.env.DB_PATH); } catch { }

const store = require('../src/db/store');
const totp = require('../src/auth/totp');
const { DEMO_PASSWORD } = require('../src/config/env');
const { seed } = require('../src/db/seed');
const { start } = require('../src/server');

const PORT = 4100;
const BASE = `http://localhost:${PORT}`;
const PW = DEMO_PASSWORD;

let pass = 0, fail = 0; const failed = [];
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', X = '\x1b[0m';
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ${G}✓${X} ${name}`); }
  else { fail++; failed.push(name); console.log(`  ${R}✗ ${name}${X}${extra ? '  -> ' + extra : ''}`); }
}
function section(t) { console.log(`\n${Y}${t}${X}`); }

async function api(method, p, { token, body } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null; try { j = await res.json(); } catch { }
  return { status: res.status, body: j };
}

// TOTP codes are single-use (replay defence), so a 2FA account cannot log in twice
// inside the same 30s step. Tokens are therefore memoised per credential; pass
// { fresh: true } when a test genuinely needs a second, independent session and the
// helper will wait for the next TOTP window rather than replay a spent code.
const tokenCache = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(cred, { code, password, fresh } = {}) {
  if (!fresh && !code && !password && tokenCache.has(cred)) return tokenCache.get(cred);
  const u = store.all('users').find((x) => x.credential_id === cred);
  for (let attempt = 0; attempt < 3; attempt++) {
    const body = { credential_id: cred, password: password || PW };
    if (u && u.totp_secret) body.tfa_code = code || totp.generate(u.totp_secret);
    const r = await api('POST', '/api/login', { body });
    if (r.status === 200) {
      if (!password && !code && !fresh) tokenCache.set(cred, r.body.token);  // a 'fresh' token may be deliberately revoked by a test
      return r.body.token;
    }
    // A spent code just means we are inside the same 30s step — wait it out.
    const spent = r.body && /already been used/.test(r.body.message || '');
    if (!spent || code) throw new Error(`login ${cred} failed: ${JSON.stringify(r.body)}`);
    await sleep(31000 - (Date.now() % 30000));
  }
  throw new Error(`login ${cred} failed after retries`);
}

(async () => {
  seed({ reset: true });
  const server = await start(PORT);

  // Handy IDs from the seeded data
  const odResource = store.all('resources').find((r) => r.region === 'Odisha');
  const wbSite = store.all('sites').find((s) => s.region === 'West Bengal');
  const wbTask = store.all('tasks').find((t) => t.region === 'West Bengal');
  const odTask = store.all('tasks').find((t) => t.region === 'Odisha');

  // Tokens
  const t1 = await login('NDMA-AUTH-01');
  const t2od = await login('STRAT-OD-01');
  const t2wb = await login('STRAT-WB-02');
  const t3od = await login('COORD-BHK-01');
  const t4od = await login('TACT-NDRF-01');
  const t5od = await login('VOL-AM-01');

  // ============ AUTH / 2FA ============
  section('Authentication & 2FA');
  check('wrong password rejected (401)', (await api('POST', '/api/login', { body: { credential_id: 'COORD-BHK-01', password: 'nope' } })).status === 401);
  check('T1 login without 2FA code rejected (tfa_required)', (await api('POST', '/api/login', { body: { credential_id: 'NDMA-AUTH-01', password: PW } })).body.error === 'tfa_required');
  check('T1 login with WRONG 2FA code rejected (invalid_tfa)', (await api('POST', '/api/login', { body: { credential_id: 'NDMA-AUTH-01', password: PW, tfa_code: '000000' } })).body.error === 'invalid_tfa');
  check('T3 (no 2FA) logs in without code', !!t3od);
  check('unauthenticated request to protected route -> 401', (await api('GET', '/api/tasks')).status === 401);

  // Forged token: tamper the role claim -> signature must fail
  const forged = (() => {
    const [h, p] = t5od.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    payload.role = 'T1';
    const p2 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${h}.${p2}.${t5od.split('.')[2]}`; // reuse old signature (now invalid)
  })();
  check('tampered JWT (role escalated to T1) -> 401 bad signature', (await api('GET', '/api/declarations', { token: forged })).status === 401);

  // ============ RULE #1: T5 blocked from resources ============
  section('Boundary #1 — Tier 5 can never touch resources');
  check('T5 GET /api/resources -> 403', (await api('GET', '/api/resources', { token: t5od })).status === 403);
  check('T5 GET /api/resources/:id -> 403 (not just hidden)', (await api('GET', `/api/resources/${odResource.id}`, { token: t5od })).status === 403);
  check('T5 POST /api/resources -> 403', (await api('POST', '/api/resources', { token: t5od, body: { type: 'Drone', label: 'X' } })).status === 403);
  check('T5 POST /api/resource-requests -> 403', (await api('POST', '/api/resource-requests', { token: t5od, body: { label: 'X' } })).status === 403);

  // ============ RULE #2: T4 never gets aggregate / multi-site ============
  section('Boundary #2 — Tier 4 never receives aggregate or multi-site data');
  const t4sites = await api('GET', '/api/sites', { token: t4od });
  check('T4 GET /api/sites returns only own site', t4sites.body.data.every((s) => s.site === 'Bhadrak / Dhamra'), JSON.stringify(t4sites.body.data.map((s) => s.site)));
  check('T4 site view is NOT aggregate', t4sites.body.view !== 'aggregate', t4sites.body.view);
  const t4res = await api('GET', '/api/resources', { token: t4od });
  check('T4 resources are own-equipment only (owner=self)', t4res.status === 200 && t4res.body.data.every((r) => String(r.owner_user_id) === String(store.all('users').find((u) => u.credential_id === 'TACT-NDRF-01').id)));
  check('T4 GET /api/incidents -> 403 (no read grant)', (await api('GET', '/api/incidents', { token: t4od })).status === 403);

  // ============ RULE #3: only T1/T2 action escalations ============
  section('Boundary #3 — only T1/T2 may approve/deny escalations');
  // Create a fresh T3(Odisha) escalation (routes to T2), then probe who can action it.
  const esc = (await api('POST', '/api/escalations', { token: t3od, body: { reason: 'need pumps' } })).body.data;
  check('T3 escalation routes to T2', esc.routed_to_tier === 'T2');
  check('T3 cannot approve an escalation -> 403', (await api('POST', `/api/escalations/${esc.id}/approve`, { token: t3od })).status === 403);
  check('T4 cannot approve -> 403', (await api('POST', `/api/escalations/${esc.id}/approve`, { token: t4od })).status === 403);
  check('T5 cannot approve -> 403', (await api('POST', `/api/escalations/${esc.id}/approve`, { token: t5od })).status === 403);
  check('T2 in WRONG region cannot action it -> 403', (await api('POST', `/api/escalations/${esc.id}/approve`, { token: t2wb })).status === 403);
  const approve = await api('POST', `/api/escalations/${esc.id}/approve`, { token: t2od });
  check('T2 in-region approves -> 200, status=approved', approve.status === 200 && approve.body.data.status === 'approved');
  check('re-actioning an already-actioned request -> 409', (await api('POST', `/api/escalations/${esc.id}/deny`, { token: t2od })).status === 409);

  // Routing variants
  check('T4 escalation bypasses T3 -> routed to T2', (await api('POST', '/api/escalations', { token: t4od, body: { reason: 'boat' } })).body.data.routed_to_tier === 'T2');
  check('T5 escalation routes only to T3', (await api('POST', '/api/escalations', { token: t5od, body: { reason: 'water' } })).body.data.routed_to_tier === 'T3');

  // ============ RULE #4: only T1 writes declarations ============
  section('Boundary #4 — only Tier 1 may create/modify declarations');
  check('T2 POST /api/declarations -> 403', (await api('POST', '/api/declarations', { token: t2od, body: { title: 'X' } })).status === 403);
  check('T3 POST /api/declarations -> 403', (await api('POST', '/api/declarations', { token: t3od, body: { title: 'X' } })).status === 403);
  const decl = await api('POST', '/api/declarations', { token: t1, body: { title: 'Test Emergency', region: 'Odisha', status: 'approved' } });
  check('T1 POST /api/declarations -> 201', decl.status === 201);
  const t2decl = await api('GET', '/api/declarations', { token: t2od });
  check('T2 reads declarations as STATUS-ONLY (no created_by leaked)', t2decl.status === 200 && t2decl.body.data.every((d) => !('created_by' in d)), JSON.stringify(t2decl.body.data[0] || {}));
  check('T5 GET /api/declarations -> 403', (await api('GET', '/api/declarations', { token: t5od })).status === 403);

  // ============ RULE #5: jurisdiction isolation ============
  section('Boundary #5 — jurisdiction isolation (even with a guessed valid ID)');
  check('T2(Odisha) GET West Bengal site by ID -> 404 (no leak)', (await api('GET', `/api/sites/${wbSite.id}`, { token: t2od })).status === 404);
  check('T3(Odisha) GET West Bengal task by ID -> 404', (await api('GET', `/api/tasks/${wbTask.id}`, { token: t3od })).status === 404);
  const t2odInc = await api('GET', '/api/incidents', { token: t2od });
  check('T2(Odisha) incident feed contains ONLY Odisha rows', t2odInc.body.data.every((i) => i.region === 'Odisha'));
  check('T2(Odisha) incident feed excludes West Bengal rows', !t2odInc.body.data.some((i) => i.region === 'West Bengal'));
  // Same-region, DIFFERENT-site isolation: the two Odisha coordinators must not
  // see each other's district even though they share a region.
  const t3knp = await login('COORD-KNP-02');
  const bhkTask = store.all('tasks').find((t) => t.site === 'Bhadrak / Dhamra');
  const knpTask = store.all('tasks').find((t) => t.site === 'Kendrapara / Rajnagar');
  check('T3(Bhadrak) GET Kendrapara task by ID -> 404 (same region, other site)', (await api('GET', `/api/tasks/${knpTask.id}`, { token: t3od })).status === 404);
  check('T3(Kendrapara) GET Bhadrak task by ID -> 404 (reverse direction)', (await api('GET', `/api/tasks/${bhkTask.id}`, { token: t3knp })).status === 404);
  const t3knpTasks = await api('GET', '/api/tasks', { token: t3knp });
  check('T3(Kendrapara) task list is own-site only', t3knpTasks.body.data.every((t) => t.site === 'Kendrapara / Rajnagar'));

  // Attempt to forge region on write
  const forgedWrite = await api('POST', '/api/incidents', { token: t3od, body: { title: 'spoof', region: 'West Bengal', site: 'Kolkata / Sunderbans' } });
  check('T3 write with spoofed region is pinned to own jurisdiction', forgedWrite.status === 201 && forgedWrite.body.data.region === 'Odisha' && forgedWrite.body.data.site === 'Bhadrak / Dhamra', JSON.stringify({ r: forgedWrite.body.data.region, s: forgedWrite.body.data.site }));

  // ============ POSITIVE SANITY (grants that SHOULD work) ============
  section('Positive sanity — legitimate access works');
  const t1sitesDefault = await api('GET', '/api/sites', { token: t1 });
  check('T1 sites default to AGGREGATE (boundary #6 default)', t1sitesDefault.body.view === 'aggregate' && Array.isArray(t1sitesDefault.body.data));
  const t1sitesDetail = await api('GET', '/api/sites?view=detail', { token: t1 });
  check('T1 can DRILL DOWN to detail (soft, not blocked)', t1sitesDetail.body.view === 'full' && t1sitesDetail.body.data.length >= 3);
  check('T1 detail spans BOTH regions (national scope)', new Set(t1sitesDetail.body.data.map((s) => s.region)).size >= 2);
  const t3tasks = await api('GET', '/api/tasks', { token: t3od });
  check('T3 sees own-site tasks', t3tasks.status === 200 && t3tasks.body.data.every((t) => t.site === 'Bhadrak / Dhamra'));
  const t4tasks = await api('GET', '/api/tasks', { token: t4od });
  check('T4 sees ONLY own assigned tasks', t4tasks.body.data.every((t) => String(t.assigned_to) === String(store.all('users').find((u) => u.credential_id === 'TACT-NDRF-01').id)));
  const me = await api('GET', '/api/me', { token: t5od });
  check('T5 /api/me exposes nav perms (landing only)', me.body.permissions.views.length === 1 && me.body.permissions.views[0] === 'landing');
  check('audit log recorded login events', (await api('GET', '/api/audit', { token: t1 })).body.data.some((a) => a.action === 'login'));

  // ====== BOUNDARY #7 — regressions for the adversarial-review findings ======
  // Every test below corresponds to a hole that WAS present and is now closed.
  // They are here so it cannot silently reopen.
  section('Boundary #7 — hardening regressions (previously exploitable)');

  const t2wbTok = await login('STRAT-WB-02');

  // (1) T2 mass-assignment of `site`. Was: any string accepted, letting an Odisha
  // T2 plant rows inside a West Bengal site (invisible to that region's own T2)
  // and push free text into the DB as stored XSS.
  const crossSite = await api('POST', '/api/tasks', { token: t2od, body: { title: 'planted', site: 'Kolkata / Sunderbans' } });
  check('T2 cannot plant a row in another REGION’s site -> 400', crossSite.status === 400, JSON.stringify(crossSite.body));
  const xssSite = await api('POST', '/api/tasks', { token: t2od, body: { title: 'xss', site: '<img src=x onerror=alert(1)>' } });
  check('T2 cannot write a free-text site (stored-XSS vector) -> 400', xssSite.status === 400, JSON.stringify(xssSite.body));
  const goodSite = await api('POST', '/api/tasks', { token: t2od, body: { title: 'legit', site: 'Kendrapara / Rajnagar' } });
  check('T2 CAN still target a real site inside its own region -> 201', goodSite.status === 201 && goodSite.body.data.site === 'Kendrapara / Rajnagar', JSON.stringify(goodSite.body));
  const xssRes = await api('POST', '/api/resources', { token: t2od, body: { type: 'boat', label: 'x', site: 'nowhere' } });
  check('same validation on /api/resources -> 400', xssRes.status === 400);
  const xssInc = await api('POST', '/api/incidents', { token: t2od, body: { title: 'x', site: 'nowhere' } });
  check('same validation on /api/incidents -> 400', xssInc.status === 400);
  const badDecl = await api('POST', '/api/declarations', { token: t1, body: { title: 'x', region: 'Atlantis' } });
  check('T1 cannot declare over an unknown region -> 400', badDecl.status === 400);

  // (2) SITE scope must also match REGION. A site name is only unique within its
  // region, so a bare name match let a same-named site leak across regions.
  check('SITE scope is region-aware (rowInScope)',
    require('../src/services/scope').rowInScope('SITE', { region: 'West Bengal', site: 'Bhadrak / Dhamra' }, { region: 'Odisha', site: 'Bhadrak / Dhamra' }, 'tasks') === false);
  check('null site does NOT match a site-less row (fail closed)',
    require('../src/services/scope').rowInScope('SITE', { region: 'Odisha', site: null }, { region: 'Odisha', site: null }, 'tasks') === false);

  // (3) ?view= could WIDEN a tier's projection. T5 is pinned to 'basic' by the
  // matrix but simply asked for ?view=detail and got population_at_risk.
  const t5widen = await api('GET', '/api/sites?view=detail', { token: t5od });
  check('T5 cannot widen its projection with ?view=detail', t5widen.status === 200 && t5widen.body.data.every((r) => !('population_at_risk' in r)), JSON.stringify(t5widen.body.data && t5widen.body.data[0]));
  const t5widenId = await api('GET', '/api/sites/1?view=full', { token: t5od });
  check('...nor on the by-id route with ?view=full', t5widenId.status !== 200 || !('population_at_risk' in (t5widenId.body.data || {})));
  const t4widen = await api('GET', '/api/sites?view=detail', { token: t4od });
  check('T4 clamped to its `task` projection too', t4widen.body.data.every((r) => !('population_at_risk' in r)));
  const t5narrow = await api('GET', '/api/sites?view=basic', { token: t5od });
  check('narrowing a projection is still allowed', t5narrow.status === 200 && t5narrow.body.view === 'basic');
  const t5junk = await api('GET', '/api/sites?view=../../etc/passwd', { token: t5od });
  check('unknown ?view= falls back to the tier default (fails closed)', t5junk.body.view === 'basic', JSON.stringify(t5junk.body.view));

  // (4) TOTP replay. A code is mathematically valid for ~90s across the skew
  // window, so one glimpsed code used to mint unlimited sessions.
  const t1u = store.all('users').find((u) => u.credential_id === 'NDMA-AUTH-01');
  let _c = null; const oneCode2 = () => (_c = _c || totp.generate(t1u.totp_secret));
  await sleep(31000 - (Date.now() % 30000));   // start of a clean TOTP step
  const first = await api('POST', '/api/login', { body: { credential_id: 'NDMA-AUTH-01', password: PW, tfa_code: oneCode2() } });
  const replay = await api('POST', '/api/login', { body: { credential_id: 'NDMA-AUTH-01', password: PW, tfa_code: oneCode2() } });
  check('a TOTP code works exactly once', first.status === 200, JSON.stringify(first.body));
  check('replaying the SAME still-valid TOTP code -> 401', replay.status === 401 && replay.body.error === 'invalid_tfa', JSON.stringify(replay.body));
  check('the replay is audit-logged as denied_tfa_replay',
    (await api('GET', '/api/audit', { token: t1 })).body.data.some((a) => a.result === 'denied_tfa_replay'));
  check('a non-numeric TOTP code is rejected without a timing side channel',
    totp.matchCounter(t1u.totp_secret, 'abcdef') === null && totp.matchCounter(t1u.totp_secret, '12345') === null);

  // (5) Logout was a no-op: a copied token stayed live for the rest of TOKEN_TTL.
  const doomed = await login('COORD-KNP-02', { fresh: true });
  check('token works before logout', (await api('GET', '/api/me', { token: doomed })).status === 200);
  await api('POST', '/api/logout', { token: doomed });
  const afterLogout = await api('GET', '/api/me', { token: doomed });
  check('the SAME token is dead after logout -> 401 revoked', afterLogout.status === 401 && afterLogout.body.reason === 'revoked', JSON.stringify(afterLogout.body));

  // (6) The token's role was trusted for the whole TTL, so a demotion did not
  // take effect until it expired. The DB must win on every request.
  const demotable = store.all('users').find((u) => u.credential_id === 'VOL-AM-02');
  const demotedTok = await login('VOL-AM-02');
  check('token valid while the account is unchanged', (await api('GET', '/api/me', { token: demotedTok })).status === 200);
  store.update('users', demotable.id, { role: 'T1', region: null, site: null });   // "promote" behind the token's back
  const stale = await api('GET', '/api/me', { token: demotedTok });
  check('a token whose account changed is refused -> stale_token', stale.status === 401 && stale.body.reason === 'stale_token', JSON.stringify(stale.body));
  store.update('users', demotable.id, { role: 'T5', region: 'Odisha', site: 'Kendrapara / Rajnagar' });  // restore
  const goneTok = await login('VOL-AM-02', { fresh: true });
  store.update('users', demotable.id, { role: 'T5', region: 'Odisha', site: 'Kendrapara / Rajnagar' });
  check('...and the restored account authenticates again', (await api('GET', '/api/me', { token: goneTok })).status === 200);

  // (7) A token with no exp never expired.
  const { sign } = require('../src/auth/jwt');
  const crypto = require('crypto');
  const noExp = (() => {
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const b = Buffer.from(JSON.stringify({ sub: t1u.id, id: t1u.id, role: 'T1', region: null, site: null, team: null })).toString('base64url');
    const sig = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${h}.${b}`).digest('base64url');
    return `${h}.${b}.${sig}`;
  })();
  const noExpRes = await api('GET', '/api/me', { token: noExp });
  check('a validly-SIGNED token with no exp is refused -> no_expiry', noExpRes.status === 401 && noExpRes.body.reason === 'no_expiry', JSON.stringify(noExpRes.body));
  const expired = sign({ sub: t1u.id, id: t1u.id, role: 'T1', region: null, site: null, team: null }, { expiresIn: -10 });
  check('an expired token is refused', (await api('GET', '/api/me', { token: expired })).status === 401);

  // (8) Login was unthrottled, making T1's 6-digit second factor brute-forceable
  // in about an hour (the credential list is public and the demo password is known).
  let sawThrottle = 0, sawLock = false;
  for (let i = 0; i < 12; i++) {
    const r = await api('POST', '/api/login', { body: { credential_id: 'NDMA-AUTH-02', password: PW, tfa_code: '000000' } });
    if (r.status === 429) { sawThrottle++; if (!sawLock) sawLock = true; }
  }
  check('repeated 2FA guesses trigger a 429 lockout', sawLock, `429s seen: ${sawThrottle}`);
  const lockedOutEvenWithGoodCode = await api('POST', '/api/login', {
    body: { credential_id: 'NDMA-AUTH-02', password: PW, tfa_code: totp.generate(store.all('users').find((u) => u.credential_id === 'NDMA-AUTH-02').totp_secret) },
  });
  check('a locked credential is refused even with the CORRECT code', lockedOutEvenWithGoodCode.status === 429, JSON.stringify(lockedOutEvenWithGoodCode.body));
  check('the lockout is audit-logged', (await api('GET', '/api/audit', { token: t1 })).body.data.some((a) => a.result === 'denied_throttled'));
  check('a Retry-After is advertised', typeof lockedOutEvenWithGoodCode.body.retry_after === 'number');

  // (9) Per-user salts: one cracked hash must not compromise the whole roster.
  const hashes = store.all('users').map((u) => u.password_hash);
  check('every account has its own scrypt salt', new Set(hashes).size === hashes.length, `${new Set(hashes).size}/${hashes.length} distinct`);

  // (10) T5 -> T3 was a dead letter: T3 could neither see nor act on it.
  const t5knp = await login('VOL-AM-02', { fresh: true });
  const vEsc = await api('POST', '/api/escalations', { token: t5knp, body: { kind: 'medical', reason: 'insulin needed at shelter' } });
  check('T5 escalation is created and routed to T3', vEsc.status === 201 && vEsc.body.data.routed_to_tier === 'T3');
  const t3knpTok = await login('COORD-KNP-02');
  const t3inbox = await api('GET', '/api/escalations', { token: t3knpTok });
  check('T3 can SEE the volunteer escalation routed to it', t3inbox.body.data.some((r) => String(r.id) === String(vEsc.body.data.id)), JSON.stringify(t3inbox.body.count));
  const t3bhkTok = t3od;
  const otherInbox = await api('GET', '/api/escalations', { token: t3bhkTok });
  check('...but the OTHER district’s T3 cannot', !otherInbox.body.data.some((r) => String(r.id) === String(vEsc.body.data.id)));
  check('T3 still cannot APPROVE it (Boundary #3 intact)',
    (await api('POST', `/api/escalations/${vEsc.body.data.id}/approve`, { token: t3knpTok })).status === 403);
  const fwd = await api('POST', `/api/escalations/${vEsc.body.data.id}/forward`, { token: t3knpTok, body: { note: 'verified on site' } });
  check('T3 CAN forward it up to T2 (triage, not approval)', fwd.status === 200 && fwd.body.data.routed_to_tier === 'T2', JSON.stringify(fwd.body));
  check('forwarding cannot change the status', fwd.body.data.status === 'pending');
  const fwdOther = await api('POST', `/api/escalations/${vEsc.body.data.id}/forward`, { token: t3bhkTok });
  check('a T3 cannot forward another district’s request -> 404', fwdOther.status === 404);
  const t5fwd = await api('POST', `/api/escalations/${vEsc.body.data.id}/forward`, { token: t5knp });
  check('T5 cannot forward at all -> 404', t5fwd.status === 404);

  // (11) T1's reach past the routed tier is legal but must be conspicuous.
  const ovEsc = await api('POST', '/api/escalations', { token: t5od, body: { reason: 'override target' } });
  const ovApprove = await api('POST', `/api/escalations/${ovEsc.body.data.id}/approve`, { token: t1 });
  check('T1 may still override a lower tier’s inbox', ovApprove.status === 200);
  check('...and the override is tagged national_override in the audit trail',
    (await api('GET', '/api/audit', { token: t1 })).body.data.some((a) => String(a.detail || '').includes('national_override')));

  // (12) Credential enumeration via error text.
  const noSuch = await api('POST', '/api/login', { body: { credential_id: 'NOPE-99', password: 'x' } });
  const realBadPw = await api('POST', '/api/login', { body: { credential_id: 'VOL-AM-01', password: 'x' } });
  check('unknown credential and wrong password return the SAME error',
    noSuch.status === realBadPw.status && noSuch.body.error === realBadPw.body.error && noSuch.body.message === realBadPw.body.message);

  // ---- summary ----
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`  ${pass} passed, ${fail} failed`);
  if (fail) console.log(`  ${R}FAILED:${X} ${failed.join(', ')}`);
  else console.log(`  ${G}All security boundaries held.${X}`);
  console.log('─'.repeat(52));
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST HARNESS ERROR:', e); process.exit(2); });
