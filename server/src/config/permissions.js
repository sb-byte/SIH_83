'use strict';
/**
 * Unity EOC — PERMISSION MATRIX (single source of truth)
 * ===========================================================================
 * This file is the ONE place authorization is defined. Every server-side guard
 * (`authorize(entity, action)`) and the query-layer scoping helper read from
 * the MATRIX below. To change who can do what, edit only this file.
 *
 * This is a direct, literal encoding of the permission matrix in the spec.
 *
 * ---------------------------------------------------------------------------
 * SCOPE TOKENS  (the "how much" a tier can see/touch for a given entity)
 * ---------------------------------------------------------------------------
 *   ALL     — every row, all regions (national). Only ever granted to T1.
 *   REGION  — rows whose `region` matches the user's region.
 *   SITE    — rows whose `site`   matches the user's site.
 *   TEAM    — rows in the user's site AND the user's team (own-team roster).
 *   OWN     — rows owned/assigned to the user (see OWNER_KEYS below).
 *   SELF    — only the user's own record (users entity).
 *   STATUS  — read is allowed but response is projected to status fields only.
 *   (absent) — NO access. A missing action key means "denied" — fail closed.
 *
 * ACTIONS
 *   read   -> scope token (or absent = denied)
 *   write  -> scope token (or absent = denied)   [create/update/delete of data]
 *   create -> boolean (escalation only: may submit a request)
 *   action -> boolean (escalation only: may approve/deny a request)
 *
 * NB: `write` scope also constrains WHERE a tier may write. A T2 (REGION) can
 * only write rows in their own region; the handler stamps region/site from the
 * verified token, never from client input — so a client cannot forge scope.
 */

const SCOPES = Object.freeze({
  ALL: 'ALL', REGION: 'REGION', SITE: 'SITE', TEAM: 'TEAM',
  OWN: 'OWN', SELF: 'SELF', STATUS: 'STATUS',
});

/**
 * For OWN scope, which field(s) on a row denote "owned by this user".
 * A row is OWNed if ANY of these fields equals the requesting user's id.
 */
const OWNER_KEYS = Object.freeze({
  users: ['id'],
  tasks: ['assigned_to'],
  resources: ['owner_user_id'],
  incidents: ['reported_by'],
  declarations: ['created_by'],
  escalation: ['origin_user_id'],
  audit: ['user_id'], // "own actions" = audit rows whose actor is the user
});

const S = SCOPES;

/**
 * THE MATRIX. Read each row against the spec's permission table.
 * Rows are entities; columns are tiers.
 */
const MATRIX = Object.freeze({
  // Users: T1 read-all(region-wide) | T2 read-all-in-region | T3 own-site roster
  //        | T4 own-team | T5 read-self
  users: {
    T1: { read: S.ALL },
    T2: { read: S.REGION },
    T3: { read: S.SITE },
    T4: { read: S.TEAM },
    T5: { read: S.SELF },
  },

  // Sites: T1 read-all aggregate (soft drill to detail) | T2 region full detail
  //        | T3 own-site full detail | T4 own-site task-relevant | T5 own-site basic
  // (read is allowed for every tier; aggregate-vs-detail is response shaping,
  //  handled in the route via ?view=, NOT a hard block — see spec boundary #6.)
  sites: {
    T1: { read: S.ALL, detailDefault: 'aggregate' },
    T2: { read: S.REGION, detailDefault: 'full' },
    T3: { read: S.SITE, detailDefault: 'full' },
    T4: { read: S.SITE, detailDefault: 'task' },
    T5: { read: S.SITE, detailDefault: 'basic' },
  },

  // Tasks: T1 read via severity index (soft drill) | T2 read/write region
  //        | T3 read/write own site | T4 read own assigned only | T5 read own assigned only
  tasks: {
    T1: { read: S.ALL },
    T2: { read: S.REGION, write: S.REGION },
    T3: { read: S.SITE, write: S.SITE },
    T4: { read: S.OWN },
    T5: { read: S.OWN },
  },

  // Resources: T1 read aggregate(region totals) | T2 read/write region
  //            | T3 read + REQUEST own site | T4 read own equipment | T5 NONE
  // T3 "write" is intentionally the RESTRICTED request-only capability, enforced
  // by routing T3 writes through POST /resources/:id/request (not register).
  resources: {
    T1: { read: S.ALL },
    T2: { read: S.REGION, write: S.REGION },
    T3: { read: S.SITE, write: S.SITE, writeMode: 'request' },
    T4: { read: S.OWN },
    T5: { /* NONE — no read, no write. Hard-blocked at endpoint. */ },
  },

  // Incidents/Events: T1 read aggregate/verified summary (soft drill)
  //   | T2 read raw feed region-wide + verify/flag | T3 read raw own site + submit
  //   | T4 submit own reports | T5 submit own reports
  // Spec grants T4/T5 WRITE(submit) only, no read — implemented literally
  // (they may create; the collection read endpoint 403s for them).
  incidents: {
    T1: { read: S.ALL },
    T2: { read: S.REGION, write: S.REGION },
    T3: { read: S.SITE, write: S.SITE },
    T4: { write: S.OWN },
    T5: { write: S.OWN },
  },

  // Escalation requests: T1 approve/deny only (routed to them) | T2 submit+action(region)
  //   | T3 submit | T4 submit (direct line, may bypass T3) | T5 submit
  escalation: {
    T1: { action: true },
    T2: { create: true, action: true },
    T3: { create: true },
    T4: { create: true },
    T5: { create: true },
  },

  // Declarations/Authorizations: T1 create/approve full | T2 read status only
  //   | T3/T4/T5 none. Legally significant — only T1 may write.
  declarations: {
    T1: { read: S.ALL, write: S.ALL },
    T2: { read: S.REGION, project: 'status' }, // region-scoped, status fields only
    T3: {},
    T4: {},
    T5: {},
  },

  // Audit log: T1 read-all (oversight) | T2 read own region | T3 read own site
  //   | T4 read own actions | T5 read own actions
  audit: {
    T1: { read: S.ALL },
    T2: { read: S.REGION },
    T3: { read: S.SITE },
    T4: { read: S.OWN },
    T5: { read: S.OWN },
  },
});

/**
 * can(role, entity, action) -> scope token | boolean | false
 * Returns the granted scope/capability, or false if denied. Fails closed:
 * unknown entity/role/action all resolve to false.
 */
function can(role, entity, action) {
  const cell = MATRIX[entity] && MATRIX[entity][role];
  if (!cell) return false;
  const grant = cell[action];
  return grant === undefined ? false : grant;
}

/** Convenience: the read/write scope for a role+entity (or false). */
function scopeFor(role, entity, action) {
  const g = can(role, entity, action);
  return typeof g === 'string' ? g : false;
}

module.exports = { SCOPES, OWNER_KEYS, MATRIX, can, scopeFor };
