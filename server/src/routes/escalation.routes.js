'use strict';
/**
 * Escalation routes.
 *   GET  /api/escalations            -> role-appropriate view (inbox for actioners,
 *                                       own submissions for originators)
 *   POST /api/escalations            -> submit (T2/T3/T4/T5); routed per role
 *   POST /api/escalations/:id/approve
 *   POST /api/escalations/:id/deny   -> action (T1/T2 only, scope-checked)
 *
 * Boundary #3: only T1/T2 may approve/deny — enforced by authorize('escalation',
 * 'action') AND by canAction() (which additionally scopes T2 to their region).
 */
const store = require('../db/store');
const audit = require('../middleware/audit');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/guards');
const { routeFor, canAction, isRoutedTo } = require('../services/escalation');

function register(router) {
  // Everyone authenticated can view escalations relevant to them.
  router.get('/api/escalations', authenticate, async (req, res) => {
    const u = req.user;
    const rows = store.all('escalation_requests').filter((r) => {
      if (u.role === 'T1') return true;                                  // oversight sees all
      if (u.role === 'T2') {
        return (r.routed_to_tier === 'T2' && r.region === u.region)      // their inbox
          || String(r.origin_user_id) === String(u.id);                 // + their own submissions
      }
      // T3 receives T5 escalations. It may not approve them (Boundary #3) but it
      // must be able to SEE them, otherwise T5 -> T3 is a dead letter. Read-only
      // inbox, scoped to their own site; they triage and forward to T2.
      if (u.role === 'T3') {
        return (r.routed_to_tier === 'T3' && r.region === u.region && r.site === u.site)
          || String(r.origin_user_id) === String(u.id);
      }
      return String(r.origin_user_id) === String(u.id);                 // originators see own
    });
    res.json({ role: u.role, count: rows.length, data: rows });
  });

  // Submit an escalation. T1 has no 'create' grant -> authorize() 403s.
  router.post('/api/escalations', authenticate, authorize('escalation', 'create'), async (req, res) => {
    const routed = routeFor(req.user.role);
    if (!routed) return res.status(403).json({ error: 'forbidden', message: 'Your role cannot originate an escalation.' });
    const b = req.body || {};
    const row = {
      origin_user_id: req.user.id, origin_role: req.user.role,
      region: req.user.region, site: req.user.site,
      routed_to_tier: routed, kind: b.kind || 'general', reason: b.reason || '',
      status: 'pending', actioned_by: null, actioned_at: null, created_at: new Date().toISOString(),
    };
    const saved = store.insert('escalation_requests', row);
    audit.log(req, { action: 'create', entity: 'escalation', target: saved.id, result: 'ok', detail: `routed_to ${routed}` });
    res.status(201).json({ data: saved });
  });

  function actionHandler(decision) {
    return async (req, res) => {
      const row = store.findById('escalation_requests', req.params.id);
      if (!row) return res.status(404).json({ error: 'not_found' });
      if (!canAction(req.user, row)) {
        audit.log(req, { action: decision, entity: 'escalation', target: row.id, result: 'denied_scope' });
        return res.status(403).json({ error: 'forbidden', message: 'This request is not routed to you or is outside your jurisdiction.' });
      }
      if (row.status !== 'pending') {
        return res.status(409).json({ error: 'already_actioned', status: row.status });
      }
      // T1 reaching past the routed tier is legal but must be conspicuous.
      const override = !isRoutedTo(req.user, row);
      const saved = store.update('escalation_requests', row.id, {
        status: decision === 'approve' ? 'approved' : 'denied',
        actioned_by: req.user.id, actioned_role: req.user.role, actioned_at: new Date().toISOString(),
      });
      // Audit-critical: who actioned, when, resulting status.
      audit.log(req, {
        action: decision, entity: 'escalation', target: row.id, result: 'ok',
        detail: `status=${saved.status}${override ? ` national_override (was routed to ${row.routed_to_tier})` : ''}`,
      });
      res.json({ data: saved });
    };
  }

  // T3 triage: forward a request routed to T3 up to T2. Uses the 'create' grant
  // (T3 has it) — deliberately NOT 'action', so this cannot become an approval.
  router.post('/api/escalations/:id/forward', authenticate, authorize('escalation', 'create'), async (req, res) => {
    const row = store.findById('escalation_requests', req.params.id);
    if (!row || !isRoutedTo(req.user, row) || row.site !== req.user.site) {
      return res.status(404).json({ error: 'not_found' });   // 404, not 403: don't confirm the id exists
    }
    if (row.status !== 'pending') return res.status(409).json({ error: 'already_actioned', status: row.status });
    const saved = store.update('escalation_requests', row.id, {
      routed_to_tier: 'T2',
      forwarded_by: req.user.id,
      forwarded_at: new Date().toISOString(),
      triage_note: String((req.body && req.body.note) || '').slice(0, 500),
    });
    audit.log(req, { action: 'forward', entity: 'escalation', target: row.id, result: 'ok', detail: 'routed_to T2' });
    res.json({ data: saved });
  });

  router.post('/api/escalations/:id/approve', authenticate, authorize('escalation', 'action'), actionHandler('approve'));
  router.post('/api/escalations/:id/deny', authenticate, authorize('escalation', 'action'), actionHandler('deny'));
}

module.exports = { register };
