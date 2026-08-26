'use strict';
/**
 * Escalation routing + action authorization (spec calls this the trickiest part).
 *
 * Routing on CREATE (who receives a newly submitted request):
 *   T2 -> T1     (strategist escalates to authority)
 *   T3 -> T2     (coordinator to strategist)
 *   T4 -> T2     (frontline DIRECT line — deliberately bypasses T3)
 *   T5 -> T3     (volunteer to coordinator only)
 *
 * ACTION (approve/deny) — only T1 and T2 may action (enforced separately by the
 * permission matrix). Additionally:
 *   T2 may action only requests routed to T2 AND originating in their own region.
 *   T1 may action ANY request, including ones routed to a lower tier. That is a
 *     deliberate national-override power, not an oversight in the check — when it
 *     is exercised the audit row is tagged national_override so the bypass of the
 *     normal chain is visible in the after-action review.
 *
 * T5 -> T3 leaves T3 holding a request it may not approve (Boundary #3 reserves
 * approve/deny for T1/T2). T3 therefore gets a read-only inbox plus /forward,
 * which re-routes the request to T2 with T3's triage attached.
 */

const ROUTING = { T2: 'T1', T3: 'T2', T4: 'T2', T5: 'T3' };

function routeFor(role) {
  return ROUTING[role] || null;
}

// True when this request is routed to the caller through the normal chain.
function isRoutedTo(user, request) {
  if (request.routed_to_tier !== user.role) return false;
  if (user.role === 'T1') return true;                    // national inbox
  return request.region === user.region;
}

function canAction(user, request) {
  if (user.role === 'T1') return true;                    // national override (audited)
  if (user.role === 'T2') {
    return request.routed_to_tier === 'T2' && request.region === user.region;
  }
  return false; // T3/T4/T5 can never action — belt to the matrix's braces
}

module.exports = { ROUTING, routeFor, canAction, isRoutedTo };
