'use strict';
/**
 * Auth routes: POST /api/login, POST /api/logout, GET /api/me.
 *
 * Login flow: credential -> resolve user -> verify password -> (if T1/T2) verify
 * TOTP -> issue JWT (embeds id/role/jurisdiction) -> return session + resolved
 * nav/button permissions + the default view to route to. Every attempt (success
 * or failure) is written to the audit log.
 */
const { sign } = require('../auth/jwt');
const gate = require('../auth/gatekeeper');
const password = require('../auth/password');
const totp = require('../auth/totp');
const store = require('../db/store');
const audit = require('../middleware/audit');
const { authenticate } = require('../middleware/authenticate');
const { tfaRequired, ROLE_META } = require('../config/roles');
const nav = require('../config/nav');
const roster = require('../db/roster');

// A throwaway scrypt hash of the same cost as a real one. Verified against it when
// the credential does not exist so that "no such user" and "wrong password" take the
// same time — otherwise the response latency enumerates valid credential IDs.
const DECOY_HASH = password.hash(require('crypto').randomBytes(24).toString('base64url'));

function clientIp(req) {
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function publicUser(u) {
  return {
    id: u.id, credential_id: u.credential_id, name: u.name, role: u.role,
    region: u.region, site: u.site, team: u.team,
    scopeLabel: (ROLE_META[u.role] || {}).scopeLabel,
    roleName: (ROLE_META[u.role] || {}).name,
    jurisdiction: u.site ? `${u.region} \u00b7 ${u.site}` : u.region,
    // Presentation fields the existing UI renders (header pill, tier cards).
    // Cosmetic only — never used for an access decision.
    tierLevel: roster.TIER_LEVEL[u.role],
    tierName: roster.TIER_NAME[u.role],
    avatar: u.avatar || null,
    designation: u.designation || null,
    jurisdictionLabel: u.jurisdiction_label || (u.site ? `${u.region} \u00b7 ${u.site}` : u.region),
    requires2FA: u.role === 'T1' || u.role === 'T2',
  };
}

function navPerms(role) {
  return {
    views: nav.allowedViews(role),
    actions: nav.actionPerms(role),   // semantic: isActionAuthorized('transmit_sachet', mode)
    buttons: nav.buttonPerms(role),   // same answer keyed by DOM button id
    channels: nav.channelsFor(role),
    defaultView: nav.defaultView(role),
    role,
  };
}

function auditStub(req, user, credAttempt) {
  return {
    socket: req.socket,
    user: user
      ? { id: user.id, cred: user.credential_id, role: user.role, region: user.region, site: user.site }
      : { cred: credAttempt || null },
  };
}

function register(router) {
  // ---- POST /api/login (public) ----
  router.post('/api/login', async (req, res) => {
    const { credential_id, password: pw, tfa_code } = req.body || {};
    const ip = clientIp(req);

    // Throttle FIRST — before any hashing — so a locked-out attacker also cannot
    // use this endpoint to burn CPU. Applies to password AND 2FA failures.
    const locked = gate.checkLogin(ip, credential_id);
    if (locked) {
      audit.log(auditStub(req, null, credential_id), { action: 'login', entity: 'auth', result: 'denied_throttled', detail: `locked ${locked.key} for ${locked.retryAfter}s` });
      res.setHeader('Retry-After', String(locked.retryAfter));
      return res.status(429).json({ error: 'too_many_attempts', retry_after: locked.retryAfter, message: 'Too many failed attempts. This credential is temporarily locked.' });
    }
    await gate.delayForFailures(ip, credential_id);

    const user = credential_id
      ? store.all('users').find((u) => u.credential_id === credential_id)
      : null;

    // Generic failure for bad credential OR bad password (don't reveal which) — and
    // hash against the decoy on the miss path so the timing doesn't reveal it either.
    const pwOk = password.verify(pw || '', user ? user.password_hash : DECOY_HASH);
    if (!user || !pwOk) {
      gate.recordFailure(ip, credential_id);
      audit.log(auditStub(req, null, credential_id), { action: 'login', entity: 'auth', result: 'denied_credentials' });
      return res.status(401).json({ error: 'invalid_credentials', message: 'Credential or password is incorrect.' });
    }

    // Second factor for Tier 1 / Tier 2 only.
    if (tfaRequired(user.role)) {
      if (!tfa_code) {
        // Tell the client to render the 2FA field, without leaking anything else.
        return res.status(401).json({ error: 'tfa_required', message: '2FA code required for this role.' });
      }
      const counter = totp.matchCounter(user.totp_secret, tfa_code);
      if (counter === null) {
        gate.recordFailure(ip, credential_id);
        audit.log(auditStub(req, user), { action: 'login', entity: 'auth', result: 'denied_tfa' });
        return res.status(401).json({ error: 'invalid_tfa', message: '2FA code is incorrect or expired.' });
      }
      // Single-use: a code stays mathematically valid for ~90s across the skew
      // window, so one glimpsed or replayed code must not mint a second session.
      if (!gate.consumeTotp(user.id, counter)) {
        gate.recordFailure(ip, credential_id);
        audit.log(auditStub(req, user), { action: 'login', entity: 'auth', result: 'denied_tfa_replay', detail: 'code already used' });
        return res.status(401).json({ error: 'invalid_tfa', message: 'That code has already been used. Wait for the next one.' });
      }
    }

    gate.recordSuccess(ip, credential_id);

    const token = sign({
      sub: user.id, id: user.id, role: user.role,
      region: user.region, site: user.site, team: user.team,
      name: user.name, cred: user.credential_id,
    });
    audit.log(auditStub(req, user), { action: 'login', entity: 'auth', result: 'ok' });
    res.json({ token, user: publicUser(user), permissions: navPerms(user.role) });
  });

  // ---- POST /api/logout ----
  router.post('/api/logout', authenticate, async (req, res) => {
    // Real server-side revocation: the jti goes on the denylist until the token's
    // own exp, so a copied token is dead the moment its owner signs out.
    gate.revoke(req.user.jti, req.user.exp);
    audit.log(req, { action: 'logout', entity: 'auth', result: 'ok', detail: 'token revoked' });
    res.json({ ok: true, revoked: true, message: 'Token revoked server-side and should be discarded client-side.' });
  });

  // ---- GET /api/directory (PUBLIC) ----
  // The login screen's five tier cards need names/avatars/jurisdictions BEFORE
  // anyone is authenticated. This serves presentation fields only: no password
  // hashes, no TOTP secrets, no ids. Knowing a credential exists is not a
  // capability — you still have to authenticate against it.
  router.get('/api/directory', async (req, res) => {
    res.json({ users: roster.directory() });
  });

  // ---- GET /api/demo/totp/:credential (DISABLED unless UNITY_DEMO_MODE=1) ----
  // Convenience for live demos so a presenter isn't retyping a rotating code on
  // stage. Returns 404 unless the env flag is explicitly set, and every reveal
  // is written to the audit log. NEVER enable this in a real deployment.
  router.get('/api/demo/totp/:credential', async (req, res) => {
    if (process.env.UNITY_DEMO_MODE !== '1') {
      return res.status(404).json({ error: 'not_found' });
    }
    const cred = String(req.params.credential || '').trim().toUpperCase();
    const u = store.all('users').find((x) => x.credential_id.toUpperCase() === cred);
    if (!u || !u.totp_secret) return res.status(404).json({ error: 'not_found' });
    audit.log(auditStub(req, u), {
      action: 'demo_totp_revealed', entity: 'auth', target: u.credential_id,
      result: 'ok', detail: 'UNITY_DEMO_MODE convenience endpoint',
    });
    res.json({ credential_id: u.credential_id, code: totp.generate(u.totp_secret), demo: true });
  });

  // ---- GET /api/me (source of truth for the client's gating) ----
  router.get('/api/me', authenticate, async (req, res) => {
    const u = store.findById('users', req.user.id);
    if (!u) return res.status(401).json({ error: 'unknown_user' });
    res.json({ user: publicUser(u), permissions: navPerms(u.role), tokenExp: req.user.exp });
  });
}

module.exports = { register, publicUser, navPerms };
