'use strict';
/**
 * Composable authorization guards + scope helpers.
 * Compose per-route like: [authenticate, authorize('tasks','write'), handler].
 */
const { can, MATRIX } = require('../config/permissions');
const { rowInScope, filterInScope } = require('../services/scope');
const store = require('../db/store');
const audit = require('./audit');

/** requireRole([tiers]) — hard tier gate, independent of the entity matrix. */
function requireRole(tiers) {
  const set = new Set(tiers);
  return async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (!set.has(req.user.role)) {
      audit.log(req, { action: 'access', entity: 'route', target: req.pathname, result: 'denied_role' });
      return res.status(403).json({ error: 'forbidden', message: `Role ${req.user.role} is not permitted here` });
    }
  };
}

/**
 * authorize(entity, action) — checks the permission MATRIX. On grant, stashes
 * the resolved scope on req for the query layer. On deny, 403 + audit.
 */
function authorize(entity, action) {
  return async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    const grant = can(req.user.role, entity, action);
    if (!grant) {
      audit.log(req, { action, entity, target: req.pathname, result: 'denied_permission' });
      return res.status(403).json({ error: 'forbidden', message: `${req.user.role} may not ${action} ${entity}` });
    }
    req.authScope = typeof grant === 'string' ? grant : true;
    req.authEntity = entity;
    req.authAction = action;
    req.authCell = (MATRIX[entity] || {})[req.user.role] || {};
  };
}

/**
 * requireJurisdiction() — belt-and-braces read guard: a non-T1 caller cannot
 * widen their scope by passing region/site query params; the query-layer scope
 * filter is authoritative. (Write-side pinning is done by stampWriteScope.)
 */
function requireJurisdiction() {
  return async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (req.user.role !== 'T1') {
      delete req.query.region;
      delete req.query.site;
    }
  };
}

/**
 * loadScopedOr404 — fetch a row by :id, but return 404 if it falls outside the
 * caller's scope. Guessing a valid cross-jurisdiction ID reveals nothing.
 */
function loadScopedOr404(req, res, entity, collection, idParam = 'id') {
  const row = store.findById(collection, req.params[idParam]);
  if (!row || !rowInScope(req.authScope, row, req.user, entity)) {
    audit.log(req, { action: req.authAction || 'read', entity, target: req.params[idParam], result: 'denied_or_missing' });
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  return row;
}

/** scopedList — all rows in a collection the caller is entitled to see. */
function scopedList(req, entity, collection) {
  return filterInScope(req.authScope, store.all(collection), req.user, entity);
}

/**
 * stampWriteScope — pin region/site (and owner) from the VERIFIED token so a
 * client can never write a row outside its jurisdiction. T2 writes across their
 * region (site from body allowed); T3/T4/T5 are pinned to their exact site.
 */
function stampWriteScope(req, row, { ownerKey } = {}) {
  const u = req.user;
  if (u.role === 'T2') {
    row.region = u.region;              // region pinned; site may be set per body
  } else {
    row.region = u.region;
    row.site = u.site;                  // site pinned
  }
  if (ownerKey) row[ownerKey] = u.id;
  return row;
}

module.exports = {
  requireRole, authorize, requireJurisdiction,
  loadScopedOr404, scopedList, stampWriteScope,
};
