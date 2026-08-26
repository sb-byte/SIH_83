'use strict';
/**
 * Query-layer jurisdiction/scope enforcement.
 * ---------------------------------------------------------------------------
 * This is where "a Tier-2 user in Region A can never receive Region B's rows"
 * is actually enforced — at the data layer, not just the route layer. Every
 * list read runs through filterInScope(); every by-id read is checked with
 * rowInScope() so that even a *guessed* valid ID from another jurisdiction
 * returns 404 rather than leaking the row.
 */
const { SCOPES, OWNER_KEYS } = require('../config/permissions');

function rowInScope(scope, row, user, entity) {
  switch (scope) {
    case SCOPES.ALL:    return true;
    case SCOPES.REGION: return user.region != null && row.region === user.region;
    // SITE and TEAM are deliberately ALSO region-checked. A site name is only
    // unique within its region, and a null-vs-null match would otherwise make a
    // user provisioned without a site match every site-less row. Fail closed.
    case SCOPES.SITE:   return user.site != null && row.site === user.site
                            && user.region != null && row.region === user.region;
    case SCOPES.TEAM:   return user.site != null && row.site === user.site
                            && user.region != null && row.region === user.region
                            && user.team != null && row.team === user.team;
    case SCOPES.OWN: {
      const keys = OWNER_KEYS[entity] || [];
      return keys.some((k) => row[k] != null && String(row[k]) === String(user.id));
    }
    case SCOPES.SELF:   return String(row.id) === String(user.id);
    case SCOPES.STATUS: return true; // read allowed; projection handled by route
    default:            return false; // fail closed
  }
}

function filterInScope(scope, rows, user, entity) {
  if (scope === SCOPES.ALL || scope === true) return rows;
  return rows.filter((r) => rowInScope(scope, r, user, entity));
}

module.exports = { rowInScope, filterInScope };
