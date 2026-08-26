// Exercises the REAL browser client (src/auth.js) against the REAL auth API over
// HTTP, stubbing only the two browser globals it touches. This is the half that the
// server-side break-tests cannot cover: that the UI layer fails closed, that it
// never fabricates a session, and that jurisdiction filtering of src/data.js
// actually narrows what each tier sees.
//
// Run:  npm run test:client       (boots the API for you)
// Needs the API on :4000 with UNITY_DEMO_MODE=1 (for the TOTP convenience endpoint).
// End-to-end test of the REAL client module (src/auth.js) against the REAL API.
// Stubs only the two browser globals it touches: sessionStorage/localStorage,
// and rewrites the relative /api base onto the running server.
const API = process.env.UNITY_API_TARGET || 'http://localhost:4000';
const mkStore = () => { const m = new Map(); return {
  getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k,v)=>m.set(k,String(v)),
  removeItem: k => m.delete(k), clear: ()=>m.clear() }; };
globalThis.sessionStorage = mkStore();
globalThis.localStorage = mkStore();
const realFetch = globalThis.fetch;
globalThis.fetch = (u, o) => realFetch(String(u).startsWith('/') ? API + u : u, o);

// Resolved relative to this file so the harness is portable.
const auth = await import(new URL('../../src/auth.js', import.meta.url).href);
const data = await import(new URL('../../src/data.js', import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, extra='') => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name} ${extra}`); }
};
const sec = t => console.log(`\n\x1b[1m${t}\x1b[0m`);
const PW = 'Unity@2026';
const totpFor = async cred => (await (await realFetch(`${API}/api/demo/totp/${cred}`)).json()).code;

sec('Credential directory (public, pre-login)');
await auth.loadDirectory();
check('directory returns 10 credentials', auth.USERS_DB.length === 10, auth.USERS_DB.length);
const raw = JSON.stringify(auth.USERS_DB);
check('directory leaks NO password hash', !/scrypt\$|password_hash/.test(raw));
check('directory leaks NO TOTP secret', !/totp_secret/.test(raw) && !/[A-Z2-7]{32}/.test(raw));
check('directory marks T1/T2 as 2FA-required',
  auth.USERS_DB.filter(u=>u.requires2FA).every(u=>['T1','T2'].includes(u.role)) &&
  auth.USERS_DB.filter(u=>u.requires2FA).length === 4);

sec('Login is server-enforced and fails closed');
check('no session before login', auth.getAuthSession() === null);
check('unauthenticated: only the login view is authorized',
  auth.isViewAuthorized('login') && !auth.isViewAuthorized('command') && !auth.isViewAuthorized('landing'));
check('unauthenticated: no action authorized', !auth.isActionAuthorized('transmit_sachet','EXERCISE') && !auth.isActionAuthorized('add_incident','LIVE'));
check('unauthenticated: jurisdiction filter yields nothing',
  auth.filterDataByJurisdiction(data.chronoIncidents).length === 0);
check('setAuthSession() refuses to fabricate a session', auth.setAuthSession() === null);
const bad = await auth.authenticateUser('COORD-BHK-01','wrong-password');
check('wrong password rejected', bad.success === false);
check('rejection message does not reveal whether the ID exists', !/exist|unknown|found/i.test(bad.error||''), bad.error);
const noTfa = await auth.authenticateUser('NDMA-AUTH-01', PW);
check('T1 without 2FA -> requires2FA challenge', noTfa.success === false && noTfa.requires2FA === true);
const badTfa = await auth.authenticateUser('NDMA-AUTH-01', PW, '000000');
check('T1 with wrong 2FA rejected', badTfa.success === false);

sec('Tier 5 volunteer — narrowest scope');
const t5 = await auth.authenticateUser('VOL-AM-01', PW);
check('T5 logs in (no 2FA required)', t5.success === true, t5.error);
check('T5 session carries server-assigned tier', t5.session.tier === 'T5' && t5.session.role === 'T5_VOLUNTEER');
check('T5 jurisdiction is Bhadrak (from the token, not the client)',
  t5.session.region === 'Odisha' && t5.session.site === 'Bhadrak / Dhamra');
check('T5 sees ONLY the landing view',
  auth.isViewAuthorized('landing') && !auth.isViewAuthorized('command') && !auth.isViewAuthorized('logistics') && !auth.isViewAuthorized('reports'));
check('T5 cannot transmit SACHET in either mode',
  !auth.isActionAuthorized('transmit_sachet','LIVE') && !auth.isActionAuthorized('transmit_sachet','EXERCISE'));
check('T5 cannot log an incident', !auth.isActionAuthorized('add_incident','LIVE'));
check('T5 radio clearance is the volunteer net only',
  JSON.stringify(auth.allowedChannelIds()) === JSON.stringify(['CH-05']), JSON.stringify(auth.allowedChannelIds()));
const t5res = await auth.apiFetch('GET','/resources');
check('BOUNDARY: T5 GET /api/resources -> 403 from the server', t5res.status === 403, t5res.status);
const t5inc = auth.filterDataByJurisdiction(data.chronoIncidents);
check('T5 incident rows are all own-site', t5inc.every(i=>i.site==='Bhadrak / Dhamra') && t5inc.length>0, t5inc.length);
await auth.clearAuthSession();

sec('Tier 3 coordinator — one district, cross-site isolation');
const t3 = await auth.authenticateUser('COORD-BHK-01', PW);
check('T3 logs in', t3.success === true);
const t3inc = auth.filterDataByJurisdiction(data.chronoIncidents);
check('T3 sees only Bhadrak incidents', t3inc.every(i=>i.site==='Bhadrak / Dhamra'), JSON.stringify([...new Set(t3inc.map(i=>i.site))]));
check('T3 does NOT see the other Odisha district', !t3inc.some(i=>i.site==='Kendrapara / Rajnagar'));
check('T3 does NOT see West Bengal', !t3inc.some(i=>i.region==='West Bengal'));
check('T3 may transmit SACHET in EXERCISE but NOT in LIVE',
  auth.isActionAuthorized('transmit_sachet','EXERCISE') === true &&
  auth.isActionAuthorized('transmit_sachet','LIVE') === false);
check('T3 cannot register an asset (T2 only)', !auth.isActionAuthorized('add_asset','LIVE'));
check('T3 may REQUEST an asset', auth.isActionAuthorized('request_asset','LIVE'));
check('T3 cannot sign the IAP', !auth.isActionAuthorized('sign_iap','LIVE'));
const t3decl = await auth.apiFetch('GET','/declarations');
check('BOUNDARY: T3 GET /api/declarations -> 403', t3decl.status === 403, t3decl.status);
const t3tasks = await auth.apiFetch('GET','/tasks');
check('T3 server task list is own-site only', t3tasks.body.data.every(t=>t.site==='Bhadrak / Dhamra'));
await auth.clearAuthSession();

sec('Tier 2 strategist — one region, cross-region isolation');
const t2 = await auth.authenticateUser('STRAT-OD-01', PW, await totpFor('STRAT-OD-01'));
check('T2 logs in WITH a live rotating TOTP code', t2.success === true, t2.error);
const t2inc = auth.filterDataByJurisdiction(data.chronoIncidents);
check('T2 sees the whole Odisha region', t2inc.every(i=>i.region==='Odisha') && new Set(t2inc.map(i=>i.site)).size>1);
check('T2 does NOT see West Bengal rows', !t2inc.some(i=>i.region==='West Bengal'));
check('T2 may register assets + mutual aid', auth.isActionAuthorized('add_asset','LIVE') && auth.isActionAuthorized('add_mutual_aid','LIVE'));
check('T2 may transmit SACHET in LIVE', auth.isActionAuthorized('transmit_sachet','LIVE'));
check('T2 cannot sign the IAP (T1 only)', !auth.isActionAuthorized('sign_iap','LIVE'));
check('T2 may approve escalations', auth.isActionAuthorized('approve_escalation','LIVE'));
const t2srv = await auth.apiFetch('GET','/incidents');
check('T2 server incident feed is region-pure', t2srv.body.data.every(i=>i.region==='Odisha'));
const spoof = await auth.apiFetch('POST','/incidents',{ title:'spoof attempt', region:'West Bengal', site:'Kolkata / Sunderbans' });
check('forged out-of-region site on write is REJECTED (400)', spoof.status===400, JSON.stringify(spoof.body||spoof.status));
const spoof2 = await auth.apiFetch('POST','/incidents',{ title:'spoof region only', region:'West Bengal' });
check('forged region alone is overwritten from the token',
  spoof2.status===201 && spoof2.body.data.region==='Odisha', JSON.stringify(spoof2.body.data||spoof2.status));
await auth.clearAuthSession();

sec('Tier 1 authority — national');
const t1 = await auth.authenticateUser('NDMA-AUTH-01', PW, await totpFor('NDMA-AUTH-01'));
check('T1 logs in with 2FA', t1.success === true, t1.error);
check('T1 sees all six views', ['landing','command','ics','logistics','simulation','reports'].every(v=>auth.isViewAuthorized(v)));
const t1inc = auth.filterDataByJurisdiction(data.chronoIncidents);
check('T1 sees every row unfiltered (both regions)',
  t1inc.length === data.chronoIncidents.length && new Set(t1inc.map(i=>i.region)).size===2);
check('T1 may sign the IAP + issue declarations', auth.isActionAuthorized('sign_iap','LIVE') && auth.isActionAuthorized('issue_declaration','LIVE'));
check('T1 cannot register assets (that is T2 field work)', !auth.isActionAuthorized('add_asset','LIVE'));
const t1sites = await auth.apiFetch('GET','/sites');
check('T1 sites default to AGGREGATE', t1sites.body.view === 'aggregate');
const t1detail = await auth.apiFetch('GET','/sites?view=detail');
check('T1 can drill down to detail', t1detail.body.view === 'full' && t1detail.body.data.length >= 3);

sec('Session restore + audit');
await auth.refreshAuditTrail();
const trail = auth.getAuditTrail();
check('audit trail merges server rows', trail.some(r=>r.source==='SERVER'), trail.length);
check('audit records the login events', trail.some(r=>/LOGIN|AUTHENTICATION/i.test(r.event||'')));
const restored = await auth.restoreSession();
check('a stored valid token restores the session', restored && restored.tier === 'T1');
await auth.clearAuthSession();
check('after logout there is no session', auth.getAuthSession() === null);
check('after logout nothing is authorized', !auth.isViewAuthorized('command') && !auth.isActionAuthorized('add_incident','EXERCISE'));

sec('Hardening (client side)');
// A revoked token must not restore. clearAuthSession() already POSTed /logout.
const t3b = await auth.authenticateUser('COORD-BHK-01', PW);
const stolen = t3b.session.token;
await auth.clearAuthSession();
globalThis.sessionStorage.setItem('unity-eoc-active-session', JSON.stringify({ token: stolen, role:'T3_COORDINATOR', tier:'T3' }));
check('a token revoked by logout cannot be restored', (await auth.restoreSession()) === null);
// TOTP single-use, observed through the client.
const code = await totpFor('STRAT-WB-02');
const a1 = await auth.authenticateUser('STRAT-WB-02', PW, code);
await auth.clearAuthSession();
const a2 = await auth.authenticateUser('STRAT-WB-02', PW, code);
check('a 2FA code the client already used is refused', a1.success === true && a2.success === false, `${a1.success}/${a2.success}`);
check('...and the client surfaces it as a 2FA problem, not a password one', a2.requires2FA === true);
// Lockout surfaces as a human message.
let lockMsg = '';
for (let i=0;i<12;i++){ const r = await auth.authenticateUser('VOL-AM-02','wrong'); if(/locked/i.test(r.error||'')) { lockMsg = r.error; break; } }
check('repeated failures surface a lockout message to the user', /locked/i.test(lockMsg), lockMsg);
await auth.clearAuthSession();

sec('Tampering');
globalThis.sessionStorage.setItem('unity-eoc-active-session', JSON.stringify({
  token:'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwicm9sZSI6IlQxIn0.forged',
  role:'T1_AUTHORITY', tier:'T1', permissions:{views:['landing','command','ics','logistics','simulation','reports']}
}));
const forged = await auth.restoreSession();
check('a forged token is rejected by the server on restore', forged === null);
check('forged session is purged from storage', globalThis.sessionStorage.getItem('unity-eoc-active-session') === null);

console.log(`\n${'─'.repeat(56)}\n  ${pass} passed, ${fail} failed\n${'─'.repeat(56)}`);
process.exit(fail ? 1 : 0);
