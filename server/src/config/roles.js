'use strict';
/**
 * Unity EOC — Role definitions
 * ---------------------------------------------------------------------------
 * Five strictly-ordered tiers. There are NO lateral moves and NO self-selection:
 * a user's tier is derived from their agency-issued credential at account
 * creation and is embedded (server-signed) in their session token. The client
 * can never assert or change its own tier.
 *
 * Ordering (0 = highest authority):
 *   T1 Authority  > T2 Strategist > T3 Coordinator > T4 Frontline > T5 Volunteer
 */

const TIERS = ['T1', 'T2', 'T3', 'T4', 'T5'];

const ROLE_META = {
  T1: { key: 'T1', name: 'Authority',   scopeLabel: 'National / Region', tfa: true  },
  T2: { key: 'T2', name: 'Strategist',  scopeLabel: 'Region',            tfa: true  },
  T3: { key: 'T3', name: 'Coordinator', scopeLabel: 'Single site',       tfa: false },
  T4: { key: 'T4', name: 'Frontline',   scopeLabel: 'Task only',         tfa: false },
  T5: { key: 'T5', name: 'Volunteer',   scopeLabel: 'Self only',         tfa: false },
};

/** Lower number = higher authority. Used only for ordering/routing, never for grant logic. */
function rank(role) {
  return TIERS.indexOf(role);
}

function isValidRole(role) {
  return TIERS.includes(role);
}

/** Two-factor is mandatory for Tier 1 and Tier 2 only. */
function tfaRequired(role) {
  return !!(ROLE_META[role] && ROLE_META[role].tfa);
}

module.exports = { TIERS, ROLE_META, rank, isValidRole, tfaRequired };
