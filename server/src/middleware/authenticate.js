'use strict';
/**
 * authenticate — verifies the Bearer JWT and attaches the VERIFIED claims to
 * req.user. This is the only source of role/jurisdiction the server ever trusts.
 * A client-sent role, jurisdiction, or user id (in body/query/header) is ignored.
 */
const { verify } = require('../auth/jwt');
const store = require('../db/store');
const gate = require('../auth/gatekeeper');

async function authenticate(req, res) {
  const header = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  const token = m ? m[1] : (req.headers['x-access-token'] || null);
  const result = verify(token);
  if (!result.valid) {
    return res.status(401).json({ error: 'unauthorized', reason: result.error });
  }
  const claims = result.payload; // { sub, id, role, region, site, team, name, cred, iat, exp, jti }

  // Logout actually revokes. A stateless JWT would otherwise stay live for the
  // remainder of TOKEN_TTL after the user signed out.
  if (gate.isRevoked(claims.jti)) {
    return res.status(401).json({ error: 'unauthorized', reason: 'revoked' });
  }

  // Re-read the account on every request and refuse a token whose authority no
  // longer matches the database. Without this, demoting or deleting a user leaves
  // them holding real authority for up to TOKEN_TTL — during a live incident that
  // is exactly the window you cannot afford. The DB always wins.
  const live = store.findById('users', claims.id);
  if (!live) {
    return res.status(401).json({ error: 'unauthorized', reason: 'account_gone' });
  }
  if (live.role !== claims.role || live.region !== claims.region
      || live.site !== claims.site || live.team !== claims.team) {
    return res.status(401).json({ error: 'unauthorized', reason: 'stale_token',
      message: 'Your clearance changed. Sign in again.' });
  }

  req.user = claims;
}

module.exports = { authenticate };
