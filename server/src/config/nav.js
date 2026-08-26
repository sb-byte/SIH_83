'use strict';
/**
 * Unity EOC — NAV & ACTION PERMISSIONS (server-authoritative)
 * ===========================================================================
 * GET /api/me returns the resolved permissions for the logged-in role, so the
 * browser never decides access — it only mirrors what the server already says.
 * The API enforces the equivalent data rules for real in config/permissions.js.
 *
 * ONE TABLE, TWO PROJECTIONS:
 *   ACTIONS  — semantic capability names (`transmit_sachet`, `sign_iap`, ...).
 *              This is the source of truth and what src/auth.js consumes via
 *              isActionAuthorized(actionId, mode).
 *   BUTTON_ACTION — maps a DOM button id in index.html to a semantic action, so
 *              the client can gate buttons generically without a second table.
 *
 * Any action NOT listed for a role is DENIED (fail closed).
 */

const VIEWS = ['login', 'landing', 'command', 'ics', 'logistics', 'simulation', 'reports', 'field', 'escalation'];

/** Nav tabs (data-view) each tier may see. 'login' is always reachable. */
const NAV = {
  T1: ['landing', 'command', 'ics', 'logistics', 'simulation', 'reports', 'escalation'],
  T2: ['landing', 'command', 'ics', 'logistics', 'simulation', 'reports', 'escalation'],
  T3: ['landing', 'command', 'ics', 'logistics', 'simulation', 'reports', 'escalation'],
  T4: ['landing', 'command', 'logistics', 'simulation', 'field', 'escalation'],
  T5: ['landing'],                                        // volunteer portal home only
};

/**
 * Semantic actions.
 *   Array            = allowed tiers, same in both modes.
 *   {live, exercise} = mode-dependent, because the real-world consequence differs.
 */
const ACTIONS = {
  // ---- Public alerting (the sharpest edge in the system) ----
  // LIVE pushes a real CAP-SACHET cell broadcast, so Authority/Strategist only.
  // EXERCISE is sandboxed, so site + field tiers may rehearse the same console.
  transmit_sachet:      { live: ['T1', 'T2'], exercise: ['T1', 'T2', 'T3', 'T4'] },
  preview_alert:        ['T1', 'T2', 'T3', 'T4'],           // phone preview, transmits nothing
  add_rumor:            ['T1', 'T2'],                        // public-information function

  // ---- Legally significant ----
  sign_iap:             ['T1'],                              // digital sign-off on the IAP
  issue_declaration:    ['T1'],                              // disaster declarations / gazettes
  approve_funds:        ['T1'],

  // ---- Command / situational ----
  add_incident:         ['T1', 'T2', 'T3', 'T4'],            // T5 sends simple status pings
  verify_incident:      ['T2'],                              // verify/flag the raw feed
  drop_pin:             ['T1', 'T2', 'T3'],
  add_damage:           ['T1', 'T2', 'T3', 'T4'],
  export_iap:           ['T1', 'T2', 'T3'],

  // ---- Logistics ----
  add_asset:            ['T2'],                              // register fleet — T2 only
  request_asset:        ['T3'],                              // T3 may REQUEST, never register
  add_shelter:          ['T2', 'T3'],
  add_mutual_aid:       ['T2'],
  assign_squad:         ['T2', 'T3'],
  add_volunteer:        ['T2', 'T3'],
  ptt_broadcast:        ['T1', 'T2', 'T3', 'T4', 'T5'],      // channels filtered separately

  // ---- Escalation ----
  approve_escalation:   ['T1', 'T2'],                        // action/deny requests
  approve_mutual_aid:   ['T1', 'T2'],                        // approve/deny mutual-aid requests
  submit_escalation:    ['T2', 'T3', 'T4', 'T5'],

  // ---- Exercise control (who may drive a drill) ----
  run_simulation:       ['T1', 'T2'],
  manual_inject:        ['T1', 'T2'],
  reset_baseline:       ['T1', 'T2'],

  // ---- Reports / AAR ----
  add_cap:              ['T1', 'T2'],                        // corrective action plan
  print_aar:            ['T1', 'T2', 'T3'],
  view_audit:           ['T1', 'T2', 'T3', 'T4', 'T5'],      // scope differs — see permissions.js
};

/** DOM button id in index.html -> semantic action above. */
const BUTTON_ACTION = {
  'transmit-sachet-btn':    'transmit_sachet',
  'quick-alert-btn':        'transmit_sachet',
  'preview-alert-btn':      'preview_alert',
  'add-rumor-btn':          'add_rumor',
  'sign-iap-btn':           'sign_iap',
  'export-iap-btn':         'export_iap',
  'add-incident-btn':       'add_incident',
  'drop-pin-tool-btn':      'drop_pin',
  'add-damage-btn':         'add_damage',
  'add-asset-btn':          'add_asset',
  'request-asset-btn':      'request_asset',
  'add-shelter-btn':        'add_shelter',
  'add-mutual-aid-btn':     'add_mutual_aid',
  'add-volunteer-btn':      'add_volunteer',
  'ptt-broadcast-btn':      'ptt_broadcast',
  'fire-manual-inject-btn': 'manual_inject',
  'dep-reset-btn':          'reset_baseline',
  'sim-btn-play':           'run_simulation',
  'sim-btn-pause':          'run_simulation',
  'sim-btn-ff':             'run_simulation',
  'sim-btn-rewind':         'run_simulation',
  'add-cap-btn':            'add_cap',
  'print-aar-btn':          'print_aar',
};

/** Radio channels each tier is cleared for (matches data.js radioChannels ids). */
const CHANNELS = {
  T1: ['CH-01', 'CH-02', 'CH-03', 'CH-04', 'CH-05'],
  T2: ['CH-01', 'CH-02', 'CH-03', 'CH-04', 'CH-05'],
  T3: ['CH-02', 'CH-03', 'CH-04'],
  T4: ['CH-02', 'CH-04'],
  T5: ['CH-05'],
};

/** Where each tier lands after login. */
const DEFAULT_VIEW = { T1: 'landing', T2: 'command', T3: 'command', T4: 'field', T5: 'landing' };

function allowedViews(role) { return NAV[role] || []; }
function channelsFor(role) { return CHANNELS[role] || []; }
function defaultView(role) { return DEFAULT_VIEW[role] || 'landing'; }

/** Resolve every semantic action to {live, exercise} booleans for a role. */
function actionPerms(role) {
  const out = {};
  for (const [name, rule] of Object.entries(ACTIONS)) {
    out[name] = Array.isArray(rule)
      ? { live: rule.includes(role), exercise: rule.includes(role) }
      : { live: rule.live.includes(role), exercise: rule.exercise.includes(role) };
  }
  return out;
}

/** Same answer, keyed by DOM button id, so the client can gate generically. */
function buttonPerms(role) {
  const actions = actionPerms(role);
  const out = {};
  for (const [btnId, action] of Object.entries(BUTTON_ACTION)) {
    out[btnId] = actions[action] || { live: false, exercise: false };
  }
  return out;
}

/** True if `role` may perform `action` in `mode` ('LIVE'|'EXERCISE', any case). */
function canAct(role, action, mode = 'LIVE') {
  const cell = actionPerms(role)[action];
  if (!cell) return false;                       // unknown action -> denied
  return String(mode).toUpperCase() === 'EXERCISE' ? cell.exercise : cell.live;
}

module.exports = {
  VIEWS, NAV, ACTIONS, BUTTON_ACTION, CHANNELS, DEFAULT_VIEW,
  allowedViews, channelsFor, defaultView, actionPerms, buttonPerms, canAct,
};
