// ===========================================================================
// UNITY EOC INDIA — AUTHENTICATION & RBAC CLIENT
// ===========================================================================
// This module is a THIN CLIENT over the access-control API in ../server.
// It deliberately keeps the same exported names the UI already consumes, but
// every decision now comes from the server:
//
//   • passwords are verified server-side with scrypt (never sent to the client)
//   • 2FA is real RFC-6238 TOTP (rotating codes; secrets stay on the server)
//   • the session is a signed HS256 JWT carrying role + region + site + team
//   • which tabs/buttons you get comes from GET /api/me, not from this file
//   • row-level jurisdiction filtering happens in the API's query layer; the
//     filter here only trims what the server already scoped, for presentation
//
// THERE IS NO CLIENT-SIDE CREDENTIAL STORE AND NO DEMO FALLBACK. If the API is
// unreachable, login fails closed — the UI must not pretend someone is signed in.
//
// 5-TIER STRICTLY ORDERED HIERARCHY (role is assigned by credential, never chosen):
//   Tier 1 — Authority   (NDMA national command)      — 2FA mandatory
//   Tier 2 — Strategist  (State EOC, one region)      — 2FA mandatory
//   Tier 3 — Coordinator (District hub, one site)
//   Tier 4 — Frontline   (Strike team, task scope)
//   Tier 5 — Volunteer   (Aapda Mitra, self scope)
// ===========================================================================

// Same-origin by default: Vite proxies /api in dev, and vercel.json rewrites it in
// production, so the browser never makes a cross-origin request. Set VITE_API_BASE
// only if you'd rather point straight at the API host (then set ALLOWED_ORIGINS on
// the server too). This is a public URL, not a secret — VITE_ vars are inlined into
// the bundle by design. The `import.meta.env &&` guard keeps this file importable by
// plain Node, which the end-to-end test harness relies on.
const API_BASE = String(
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) || '/api',
).replace(/\/$/, '');
const SESSION_STORAGE_KEY = 'unity-eoc-active-session';
const AUDIT_STORAGE_KEY = 'unity-eoc-auth-audit-trail';

// Server tiers are 'T1'..'T5'. The existing UI keys off the longer names, so we
// translate at the boundary and keep both on the session object.
const LEGACY_ROLE = {
  T1: 'T1_AUTHORITY', T2: 'T2_STRATEGIST', T3: 'T3_COORDINATOR',
  T4: 'T4_FRONTLINE', T5: 'T5_VOLUNTEER',
};
const TIER_OF = Object.fromEntries(Object.entries(LEGACY_ROLE).map(([t, l]) => [l, t]));

// ===========================================================================
// 1. TRANSPORT
// ===========================================================================
/** Last transport failure, so the UI can say "API down" instead of "bad password". */
export let apiOffline = false;

async function api(method, path, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    apiOffline = true;
    return { ok: false, status: 0, body: { error: 'api_unreachable' } };
  }
  apiOffline = false;
  let payload = {};
  try { payload = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, body: payload };
}

/** Authenticated request using the active session token. */
export function apiFetch(method, path, body) {
  const s = getAuthSession();
  return api(method, path, { body, token: s ? s.token : null });
}

// ===========================================================================
// 2. CREDENTIAL DIRECTORY (presentation only — no secrets)
// ===========================================================================
// The login screen shows five tier cards before anyone signs in, so it needs
// names/avatars/jurisdictions. GET /api/directory serves exactly that and
// nothing more: no password hashes, no TOTP secrets. Knowing that a credential
// exists is not a capability — you still have to authenticate against it.
//
// Exported as a live array (same reference, filled in place) so existing
// `USERS_DB.find(...)` / `.map(...)` call sites keep working.
export const USERS_DB = [];

export async function loadDirectory() {
  const r = await api('GET', '/directory');
  USERS_DB.length = 0;
  if (r.ok && Array.isArray(r.body.users)) {
    const sorted = [...r.body.users].sort((a, b) => {
      const tA = Number(a.tierLevel) || (a.role === 'T1' ? 1 : a.role === 'T2' ? 2 : a.role === 'T3' ? 3 : a.role === 'T4' ? 4 : 5);
      const tB = Number(b.tierLevel) || (b.role === 'T1' ? 1 : b.role === 'T2' ? 2 : b.role === 'T3' ? 3 : b.role === 'T4' ? 4 : 5);
      if (tA !== tB) return tA - tB;
      return (a.credentialId || '').localeCompare(b.credentialId || '');
    });
    USERS_DB.push(...sorted);
  }
  return USERS_DB;
}

export function findCredential(credentialId) {
  const v = String(credentialId || '').trim().toUpperCase();
  return USERS_DB.find((u) => u.credentialId.toUpperCase() === v) || null;
}

/**
 * Current TOTP code for a demo credential. Only works when the server was
 * started with UNITY_DEMO_MODE=1 (the `npm run dev` script sets it); otherwise
 * the endpoint 404s and this returns null. Never rely on it in production.
 */
export async function fetchDemoTotp(credentialId) {
  const r = await api('GET', `/demo/totp/${encodeURIComponent(credentialId)}`);
  return r.ok ? r.body.code : null;
}

// ===========================================================================
// 3. ROLE PRESENTATION + SERVER-SUPPLIED PERMISSIONS
// ===========================================================================
// Only cosmetics are hardcoded here (badge colour, display name). The fields
// that actually gate the UI — allowedViews, defaultView, actions — are written
// from the server's /api/me response every time a session is established, so
// this object can never grant more than the server does.
export const ROLE_PERMISSIONS = {
  T1_AUTHORITY: { roleName: 'Tier 1 — Authority', badgeClass: 'tier1-badge', allowedViews: [], defaultView: 'command' },
  T2_STRATEGIST: { roleName: 'Tier 2 — Strategist', badgeClass: 'tier2-badge', allowedViews: [], defaultView: 'command' },
  T3_COORDINATOR: { roleName: 'Tier 3 — Coordinator', badgeClass: 'tier3-badge', allowedViews: [], defaultView: 'command' },
  T4_FRONTLINE: { roleName: 'Tier 4 — Frontline', badgeClass: 'tier4-badge', allowedViews: [], defaultView: 'command' },
  T5_VOLUNTEER: { roleName: 'Tier 5 — Volunteer', badgeClass: 'tier5-badge', allowedViews: [], defaultView: 'landing' },
};

function applyServerPermissions(legacyRole, permissions) {
  const slot = ROLE_PERMISSIONS[legacyRole];
  if (!slot || !permissions) return;
  slot.allowedViews = Array.isArray(permissions.views) ? permissions.views.slice() : [];
  slot.defaultView = permissions.defaultView || slot.defaultView;
  slot.actions = permissions.actions || {};
  slot.buttons = permissions.buttons || {};
  slot.channels = permissions.channels || [];
}

// ===========================================================================
// 4. AUDIT TRAIL
// ===========================================================================
// Failed logins happen before a token exists, so they are recorded locally for
// the on-screen trail. The server keeps its own authoritative audit log
// (GET /api/audit, scoped by tier) which is merged in once signed in.
function readLocalTrail() {
  try { return JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) || '[]'); } catch { return []; }
}
function writeLocalTrail(trail) {
  try { localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(trail.slice(0, 100))); } catch { /* quota */ }
}

let sessionAuditTrail = readLocalTrail();

export function logAuthAudit(entry) {
  const now = new Date();
  const record = {
    id: `AUDIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST',
    date: now.toLocaleDateString('en-IN'),
    source: 'CLIENT',
    ...entry,
  };
  sessionAuditTrail.unshift(record);
  writeLocalTrail(sessionAuditTrail);
  return record;
}

export function getAuditTrail() { return sessionAuditTrail; }

/** Pull the server-side audit log (tier-scoped) and merge it into the trail. */
export async function refreshAuditTrail() {
  const s = getAuthSession();
  if (!s) return sessionAuditTrail;
  const r = await apiFetch('GET', '/audit');
  if (!r.ok || !Array.isArray(r.body.data)) return sessionAuditTrail;

  const serverRows = r.body.data.map((row) => {
    const ts = new Date(row.ts);
    return {
      id: `SRV-${row.id}`,
      timestamp: ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST',
      date: ts.toLocaleDateString('en-IN'),
      source: 'SERVER',
      credentialId: row.credential,
      role: row.role,
      jurisdiction: row.site ? `${row.region} · ${row.site}` : (row.region || '—'),
      event: `${String(row.action || '').toUpperCase()}${row.entity ? ' · ' + row.entity : ''}`,
      status: row.result === 'ok' ? 'AUTHORIZED' : String(row.result || '').toUpperCase(),
    };
  });

  const localOnly = sessionAuditTrail.filter((r2) => r2.source !== 'SERVER');
  sessionAuditTrail = [...serverRows, ...localOnly]
    .sort((a, b) => (b.id > a.id ? 1 : -1))
    .slice(0, 100);
  writeLocalTrail(sessionAuditTrail);
  return sessionAuditTrail;
}

// ===========================================================================
// 5. SESSION MANAGEMENT
// ===========================================================================
let activeUserSession = null;

/** Build the client session object from the server's authoritative payload. */
function hydrate(user, permissions, token) {
  const legacyRole = LEGACY_ROLE[user.role] || user.role;
  applyServerPermissions(legacyRole, permissions);

  activeUserSession = {
    token,
    userId: `usr_${user.id}`,
    credentialId: user.credential_id,
    name: user.name,
    // Long form for existing UI comparisons; `tier` is the server's own code.
    role: legacyRole,
    tier: user.role,
    tierLevel: user.tierLevel,
    tierName: user.tierName,
    // Enforcement keys, straight from the signed token — the client cannot edit
    // these in any way that matters, because the server re-reads them per request.
    region: user.region,
    site: user.site,
    team: user.team,
    jurisdiction: user.jurisdiction,
    jurisdictionLabel: user.jurisdictionLabel || user.jurisdiction,
    avatar: user.avatar || '🏛️',
    designation: user.designation || '',
    scopeLabel: user.scopeLabel,
    permissions: permissions || {},
    loginTime: new Date().toISOString(),
  };

  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(activeUserSession));
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(activeUserSession));
  } catch { /* private mode */ }

  return activeUserSession;
}

export function getAuthSession() {
  if (activeUserSession) return activeUserSession;
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY) || localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      activeUserSession = JSON.parse(raw);
      // Re-apply cached permissions so gating works during the brief window
      // before restoreSession() revalidates the token against the server.
      applyServerPermissions(activeUserSession.role, activeUserSession.permissions);
      return activeUserSession;
    }
  } catch { /* corrupt payload */ }
  return null;
}

/**
 * Kept for API compatibility. A session can ONLY come from the server now, so
 * this refuses to fabricate one — the previous build used it to silently sign
 * users in as Tier 1, which is exactly the hole this integration closes.
 */
export function setAuthSession() {
  console.warn('[auth] setAuthSession() is disabled: sessions are issued by the server via authenticateUser().');
  return getAuthSession();
}

export async function clearAuthSession() {
  const cur = getAuthSession();
  if (cur) {
    logAuthAudit({
      userId: cur.userId, credentialId: cur.credentialId, role: cur.tierName,
      jurisdiction: cur.jurisdictionLabel,
      event: 'SESSION_TERMINATED / LOGOUT', status: 'CLEARED',
    });
    await api('POST', '/logout', { token: cur.token });
  }
  activeUserSession = null;
  try { 
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch { /* ignore */ }
}

/**
 * Revalidate a stored token against the server on page load. Returns the
 * session, or null if there is no token / it expired / the API is unreachable.
 * This is what replaces the old "default to Tier 1" behaviour.
 */
export async function restoreSession() {
  let stored = null;
  try { stored = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) || 'null'); } catch { stored = null; }
  if (!stored || !stored.token) return null;

  const r = await api('GET', '/me', { token: stored.token });
  if (!r.ok) {
    // The server rejected the stored token. Reasons it cares about:
    //   revoked     -> the holder signed out (possibly in another tab)
    //   stale_token -> the account's tier or jurisdiction changed under it
    //   expired / no_expiry / bad_signature -> not a usable token
    // In every case the only safe action is to drop it and re-authenticate.
    const reason = (r.body && r.body.reason) || 'invalid';
    logAuthAudit({
      userId: stored.userId || 'UNKNOWN', credentialId: stored.credentialId || 'UNKNOWN',
      role: stored.role || 'NONE', jurisdiction: stored.jurisdictionLabel || 'UNRESOLVED',
      event: 'SESSION_RESTORE_REJECTED', status: String(reason).toUpperCase(),
    });
    activeUserSession = null;
    try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* ignore */ }
    return null;
  }
  return hydrate(r.body.user, r.body.permissions, stored.token);
}

// ===========================================================================
// 6. AUTHENTICATION CONTROLLER
// ===========================================================================
/**
 * Sign in against the server. ASYNC — callers must await.
 * Resolves to { success:true, session, user }
 *          or { success:false, error, requires2FA? }
 */
export async function authenticateUser(credentialId, passwordValue, otp = null) {
  const cred = String(credentialId || '').trim();
  const body = { credential_id: cred, password: passwordValue };
  if (otp) body.tfa_code = String(otp).trim();

  const r = await api('POST', '/login', { body });

  if (!r.ok) {
    const code = r.body && r.body.error;

    // Server says this tier needs a rotating 2FA code (T1/T2).
    if (code === 'tfa_required') {
      logAuthAudit({
        userId: 'PENDING', credentialId: cred, role: 'CHALLENGED',
        jurisdiction: 'UNRESOLVED', event: '2FA_CHALLENGE_ISSUED', status: 'CHALLENGE_REQUIRED',
      });
      return {
        success: false, requires2FA: true,
        error: 'Two-Factor Authentication required for Tier 1 & Tier 2 executive logins. Enter the current 6-digit code.',
      };
    }

    if (code === 'invalid_tfa') {
      logAuthAudit({
        userId: 'PENDING', credentialId: cred, role: 'CHALLENGED',
        jurisdiction: 'UNRESOLVED', event: '2FA_CHALLENGE_FAILED', status: 'REJECTED',
      });
      return { success: false, requires2FA: true, error: 'Incorrect or expired 2FA code. Codes rotate every 30 seconds — try the current one.' };
    }

    // Server-side lockout after repeated failures (brute-force defence).
    if (r.status === 429 || code === 'too_many_attempts') {
      const wait = (r.body && r.body.retry_after) || 0;
      logAuthAudit({
        userId: 'UNKNOWN', credentialId: cred, role: 'NONE',
        jurisdiction: 'UNRESOLVED', event: 'LOGIN_THROTTLED', status: 'LOCKED_OUT',
      });
      return {
        success: false,
        error: `Too many failed attempts. This credential is locked${wait ? ` for ${Math.ceil(wait / 60)} more minute(s)` : ''}.`,
      };
    }

    if (code === 'api_unreachable') {
      return {
        success: false,
        error: 'Access-control server unreachable. Start it with `npm run server` (or use `npm run dev` to run both).',
      };
    }

    // Deliberately generic: never reveal whether the credential exists.
    logAuthAudit({
      userId: 'UNKNOWN', credentialId: cred, role: 'NONE',
      jurisdiction: 'UNRESOLVED', event: 'LOGIN_ATTEMPT_FAILED', status: 'REJECTED',
    });
    return { success: false, error: (r.body && r.body.message) || 'Authentication failed. Check your credential ID and password.' };
  }

  const session = hydrate(r.body.user, r.body.permissions, r.body.token);
  logAuthAudit({
    userId: session.userId, credentialId: session.credentialId, role: session.tierName,
    jurisdiction: session.jurisdictionLabel, event: 'AUTHENTICATION_SUCCESS', status: 'AUTHORIZED',
  });
  return { success: true, session, user: session };
}

// ===========================================================================
// 7. PERMISSION GUARDS (mirrors of server rules — the server still enforces)
// ===========================================================================
/** May the current user see this nav tab? */
export function isViewAuthorized(viewId) {
  if (viewId === 'login' || viewId === 'unity-eoc-v3') return true; // gateway and dependency engine v3 always reachable
  const session = getAuthSession();
  if (!session) return false; // not signed in -> nothing but login
  const views = (session.permissions && session.permissions.views) || [];
  return views.includes(viewId);
}

/**
 * May the current user perform this action, in this mode?
 * `mode` is the app's 'LIVE' | 'EXERCISE'. Fails closed on anything unknown.
 */
export function isActionAuthorized(actionId, mode = 'LIVE') {
  const session = getAuthSession();
  if (!session) return false;
  const actions = (session.permissions && session.permissions.actions) || {};
  const cell = actions[actionId];
  if (!cell) return false;                       // unknown action -> denied
  return String(mode).toUpperCase() === 'EXERCISE' ? !!cell.exercise : !!cell.live;
}

/** Radio channel ids this tier is cleared for (server-supplied). */
export function allowedChannelIds() {
  const session = getAuthSession();
  if (!session) return [];
  return (session.permissions && session.permissions.channels) || [];
}

/**
 * Trim a client-held dataset to the user's jurisdiction.
 *
 * The API already scopes everything it serves; this exists because the demo
 * datasets in data.js are bundled with the front end. The rules match the
 * server's scope tokens exactly (services/scope.js):
 *   T1  -> ALL      (national)
 *   T2  -> REGION   (row.region === own region)
 *   T3  -> SITE     (row.site   === own site)
 *   T4  -> SITE/TEAM
 *   T5  -> SITE
 * Rows carrying neither field are shared/non-geographic (e.g. command nets)
 * and are left visible.
 */
export function filterDataByJurisdiction(items, itemJurisdictionField = 'jurisdiction', itemRegionField = 'region') {
  if (!Array.isArray(items)) return items;
  const session = getAuthSession();
  if (!session) return [];                       // signed out -> show nothing
  if (session.tier === 'T1') return items;       // national scope

  return items.filter((item) => {
    const rowRegion = item[itemRegionField] ?? item.region ?? null;
    const rowSite = item.site ?? item[itemJurisdictionField] ?? null;
    if (!rowRegion && !rowSite) return true;     // shared / non-geographic row

    if (session.tier === 'T2') {
      return !rowRegion || rowRegion === session.region;
    }
    // T3 / T4 / T5 are site-scoped. The region is checked too, mirroring
    // services/scope.js on the server: a site name is only unique within its
    // region, so matching on the name alone would let a same-named site in
    // another state slip through.
    if (rowSite && session.site) {
      if (rowSite !== session.site) return false;
      return !rowRegion || !session.region || rowRegion === session.region;
    }
    return false;                                  // located elsewhere, or unplaceable
  });
}
