'use strict';
/**
 * Audit logging. Every login and every subsequent mutating/denied action is
 * written to the audit_log table, tied to the acting user_id. Reads of the
 * audit log are themselves scope-filtered (see the audit route).
 */
const store = require('../db/store');

function log(req, entry) {
  const u = (req && req.user) || {};
  return store.insert('audit_log', {
    user_id: u.id != null ? u.id : null,
    credential: u.cred || null,
    role: u.role || null,
    region: u.region || null,
    site: u.site || null,
    action: entry.action,
    entity: entry.entity || null,
    target: entry.target != null ? String(entry.target) : null,
    result: entry.result || 'ok',
    detail: entry.detail || null,
    ip: (req && req.socket && req.socket.remoteAddress) || null,
    ts: new Date().toISOString(),
  });
}

module.exports = { log };
