'use strict';
/**
 * Domain data routes. Every route composes:
 *   authenticate -> [requireRole] -> authorize(entity, action) -> [requireJurisdiction] -> handler
 * The matrix (config/permissions.js) decides read/write; the query layer
 * (services/scope.js via scopedList / loadScopedOr404 / stampWriteScope) decides
 * WHICH rows. Hard boundaries from the spec are annotated inline.
 */
const store = require('../db/store');
const audit = require('../middleware/audit');
const { authenticate } = require('../middleware/authenticate');
const {
  authorize, requireRole, requireJurisdiction,
  loadScopedOr404, scopedList, stampWriteScope,
} = require('../middleware/guards');
const { routeFor } = require('../services/escalation');

function pubUser(u) {
  return {
    id: u.id, credential_id: u.credential_id, name: u.name, role: u.role,
    region: u.region, site: u.site, team: u.team,
  }; // never expose password_hash / totp_secret
}

// A requested ?view= may NARROW what a tier sees but never WIDEN it. Without the
// clamp, T5 (whose matrix cell pins them to 'basic') could simply ask for
// ?view=detail and read population_at_risk. Unknown values fail closed to the
// tier's default. T1's 'aggregate' and 'full' share a rank because T1's drill-down
// is a deliberate grant, not an escalation.
const VIEW_RANK = { basic: 0, task: 1, aggregate: 2, detail: 2, full: 2 };

function clampView(requested, dflt) {
  const d = dflt || 'full';
  if (!requested) return d;
  const r = String(requested);
  if (!(r in VIEW_RANK)) return d;
  return VIEW_RANK[r] > VIEW_RANK[d] ? d : r;
}

// T2 may attribute a row to a site inside its own region. Anything else — a site in
// another region, or a free-text string that is not a site at all — is rejected. An
// unvalidated site is worse than it looks: services/scope.js matches T3/T4/T5 on the
// site name, so a forged value plants a row inside a jurisdiction that its own
// region-scoped T2 cannot see, and free text reaches the DB as stored XSS.
function resolveTargetSite(req, res, requested) {
  if (!requested) return { ok: true, site: undefined };
  const known = store.all('sites').some((s) => s.site === requested && s.region === req.user.region);
  if (!known) {
    audit.log(req, { action: 'write', entity: 'sites', target: String(requested).slice(0, 60), result: 'denied_scope', detail: 'site not in caller region' });
    res.status(400).json({ error: 'bad_request', message: 'site must name a site inside your own region.' });
    return { ok: false };
  }
  return { ok: true, site: requested };
}

function projectSite(r, view) {
  if (view === 'basic') return { id: r.id, name: r.name, region: r.region, site: r.site, status: r.status };
  if (view === 'task') return { id: r.id, name: r.name, region: r.region, site: r.site, status: r.status, shelter_capacity: r.shelter_capacity, shelter_occupancy: r.shelter_occupancy };
  return r; // full
}

function rollupSites(rows) {
  const m = {};
  for (const r of rows) {
    const k = r.region;
    m[k] = m[k] || { region: k, site_count: 0, shelter_capacity: 0, shelter_occupancy: 0, population_at_risk: 0 };
    m[k].site_count++;
    m[k].shelter_capacity += r.shelter_capacity || 0;
    m[k].shelter_occupancy += r.shelter_occupancy || 0;
    m[k].population_at_risk += r.population_at_risk || 0;
  }
  return Object.values(m);
}

function register(router) {
  // ============================ USERS ============================
  router.get('/api/users', authenticate, requireJurisdiction(), authorize('users', 'read'), async (req, res) => {
    const rows = scopedList(req, 'users', 'users').map(pubUser);
    res.json({ scope: req.authScope, count: rows.length, data: rows });
  });
  router.get('/api/users/:id', authenticate, authorize('users', 'read'), async (req, res) => {
    const row = loadScopedOr404(req, res, 'users', 'users'); if (!row) return;
    res.json({ data: pubUser(row) });
  });

  // ============================ SITES ============================
  // Boundary #6: T1 defaults to aggregate but may drill down (?view=detail).
  router.get('/api/sites', authenticate, requireJurisdiction(), authorize('sites', 'read'), async (req, res) => {
    const rows = scopedList(req, 'sites', 'sites');
    const view = clampView(req.query.view, req.authCell.detailDefault);
    if (view === 'aggregate') {
      return res.json({ scope: req.authScope, view, data: rollupSites(rows), note: 'drill down with ?view=detail' });
    }
    const v = view === 'detail' ? 'full' : view;
    res.json({ scope: req.authScope, view: v, count: rows.length, data: rows.map((r) => projectSite(r, v)) });
  });
  router.get('/api/sites/:id', authenticate, authorize('sites', 'read'), async (req, res) => {
    const row = loadScopedOr404(req, res, 'sites', 'sites'); if (!row) return;
    let view = clampView(req.query.view, req.authCell.detailDefault);
    if (view === 'aggregate' || view === 'detail') view = 'full';
    res.json({ view, data: projectSite(row, view) });
  });

  // ============================ TASKS ============================
  router.get('/api/tasks', authenticate, requireJurisdiction(), authorize('tasks', 'read'), async (req, res) => {
    const rows = scopedList(req, 'tasks', 'tasks');
    res.json({ scope: req.authScope, count: rows.length, data: rows });
  });
  router.get('/api/tasks/:id', authenticate, authorize('tasks', 'read'), async (req, res) => {
    const row = loadScopedOr404(req, res, 'tasks', 'tasks'); if (!row) return;
    res.json({ data: row });
  });
  router.post('/api/tasks', authenticate, authorize('tasks', 'write'), async (req, res) => {
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: 'bad_request', message: 'title is required' });
    const row = { title: b.title, section: b.section || 'Operations', status: b.status || 'open', progress: Number(b.progress) || 0, assigned_to: b.assigned_to || null };
    stampWriteScope(req, row);                                // region pinned; T3 site pinned
    if (req.user.role === 'T2' && b.site) {                   // T2 may target a site within region
      const t = resolveTargetSite(req, res, b.site); if (!t.ok) return;
      row.site = t.site;
    }
    const saved = store.insert('tasks', row);
    audit.log(req, { action: 'write', entity: 'tasks', target: saved.id, result: 'ok', detail: 'create' });
    res.status(201).json({ data: saved });
  });
  router.patch('/api/tasks/:id', authenticate, authorize('tasks', 'write'), async (req, res) => {
    const row = loadScopedOr404(req, res, 'tasks', 'tasks'); if (!row) return;
    const patch = {};
    for (const k of ['title', 'section', 'status', 'progress', 'assigned_to']) if (k in (req.body || {})) patch[k] = req.body[k];
    const saved = store.update('tasks', row.id, patch);
    audit.log(req, { action: 'write', entity: 'tasks', target: row.id, result: 'ok', detail: 'update' });
    res.json({ data: saved });
  });

  // ========================== RESOURCES ==========================
  // Boundary #1: T5 has NO resources capability -> authorize() 403s at the endpoint.
  router.get('/api/resources', authenticate, requireJurisdiction(), authorize('resources', 'read'), async (req, res) => {
    const rows = scopedList(req, 'resources', 'resources');
    res.json({ scope: req.authScope, count: rows.length, data: rows });
  });
  router.get('/api/resources/:id', authenticate, authorize('resources', 'read'), async (req, res) => {
    const row = loadScopedOr404(req, res, 'resources', 'resources'); if (!row) return;
    res.json({ data: row });
  });
  // Register a NEW asset — T2 only in practice (T3's write is request-only).
  router.post('/api/resources', authenticate, authorize('resources', 'write'), async (req, res) => {
    if (req.authCell.writeMode === 'request') {
      return res.status(403).json({ error: 'forbidden', message: 'Your tier may request resources but not register new assets. Use POST /api/resource-requests.' });
    }
    const b = req.body || {};
    if (!b.type || !b.label) return res.status(400).json({ error: 'bad_request', message: 'type and label are required' });
    const row = { type: b.type, label: b.label, status: b.status || 'available', owner_user_id: null };
    stampWriteScope(req, row);
    if (req.user.role === 'T2' && b.site) {
      const t = resolveTargetSite(req, res, b.site); if (!t.ok) return;
      row.site = t.site;
    }
    const saved = store.insert('resources', row);
    audit.log(req, { action: 'write', entity: 'resources', target: saved.id, result: 'ok', detail: 'register' });
    res.status(201).json({ data: saved });
  });
  // Resource REQUEST — T2 and T3 may request (both hold write); routed like an escalation.
  router.post('/api/resource-requests', authenticate, authorize('resources', 'write'), async (req, res) => {
    const b = req.body || {};
    const routed = req.user.role === 'T3' ? 'T2' : (routeFor(req.user.role) || 'T2');
    const row = {
      origin_user_id: req.user.id, origin_role: req.user.role, region: req.user.region, site: req.user.site,
      routed_to_tier: routed, kind: 'resource', reason: b.reason || `Resource request: ${b.label || b.type || 'unspecified'}`,
      status: 'pending', actioned_by: null, actioned_at: null, created_at: new Date().toISOString(),
    };
    const saved = store.insert('escalation_requests', row);
    audit.log(req, { action: 'create', entity: 'resources', target: saved.id, result: 'ok', detail: 'resource_request' });
    res.status(201).json({ data: saved });
  });

  // ========================== INCIDENTS ==========================
  // Spec: T4/T5 may submit but have no read -> authorize('incidents','read') 403s them.
  router.get('/api/incidents', authenticate, requireJurisdiction(), authorize('incidents', 'read'), async (req, res) => {
    const rows = scopedList(req, 'incidents', 'incidents');
    res.json({ scope: req.authScope, count: rows.length, data: rows });
  });
  router.get('/api/incidents/:id', authenticate, authorize('incidents', 'read'), async (req, res) => {
    const row = loadScopedOr404(req, res, 'incidents', 'incidents'); if (!row) return;
    res.json({ data: row });
  });
  router.post('/api/incidents', authenticate, authorize('incidents', 'write'), async (req, res) => {
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: 'bad_request', message: 'title is required' });
    const row = { title: b.title, severity: b.severity || 'medium', body: b.body || '', verified: false, reported_by: req.user.id, created_at: new Date().toISOString() };
    stampWriteScope(req, row, { ownerKey: 'reported_by' });   // pins region/site + reporter
    if (req.user.role === 'T2' && b.site) {                    // T2 may attribute to a site in region
      const t = resolveTargetSite(req, res, b.site); if (!t.ok) return;
      row.site = t.site;
    }
    const saved = store.insert('incidents', row);
    audit.log(req, { action: 'write', entity: 'incidents', target: saved.id, result: 'ok', detail: 'submit' });
    res.status(201).json({ data: saved });
  });
  // Verify/flag — T2 only, region-scoped (loadScopedOr404 enforces the region).
  router.patch('/api/incidents/:id/verify', authenticate, requireRole(['T2']), authorize('incidents', 'write'), async (req, res) => {
    const row = loadScopedOr404(req, res, 'incidents', 'incidents'); if (!row) return;
    const verified = !(req.body && req.body.verified === false);
    const saved = store.update('incidents', row.id, { verified, verified_by: req.user.id, verified_at: new Date().toISOString() });
    audit.log(req, { action: 'verify', entity: 'incidents', target: row.id, result: 'ok', detail: `verified=${verified}` });
    res.json({ data: saved });
  });

  // ======================== DECLARATIONS =========================
  // Boundary #4: only T1 may create/modify. Double-locked (requireRole + matrix).
  router.get('/api/declarations', authenticate, requireJurisdiction(), authorize('declarations', 'read'), async (req, res) => {
    const rows = scopedList(req, 'declarations', 'declarations');
    const project = req.authCell.project;
    const data = rows.map((d) => (project === 'status'
      ? { id: d.id, title: d.title, status: d.status, region: d.region }
      : d));
    res.json({ scope: req.authScope, project: project || 'full', count: data.length, data });
  });
  router.post('/api/declarations', authenticate, requireRole(['T1']), authorize('declarations', 'write'), async (req, res) => {
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: 'bad_request', message: 'title is required' });
    // A declaration may be national (region null) or scoped to a real region.
    if (b.region && !store.all('sites').some((x) => x.region === b.region)) {
      return res.status(400).json({ error: 'bad_request', message: 'region is not a known region.' });
    }
    const row = { title: b.title, region: b.region || null, site: null, status: b.status || 'draft', created_by: req.user.id, created_at: new Date().toISOString() };
    const saved = store.insert('declarations', row);
    audit.log(req, { action: 'write', entity: 'declarations', target: saved.id, result: 'ok', detail: 'create' });
    res.status(201).json({ data: saved });
  });
  router.patch('/api/declarations/:id', authenticate, requireRole(['T1']), authorize('declarations', 'write'), async (req, res) => {
    const row = store.findById('declarations', req.params.id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const patch = {};
    for (const k of ['title', 'status', 'region']) if (k in (req.body || {})) patch[k] = req.body[k];
    patch.updated_by = req.user.id; patch.updated_at = new Date().toISOString();
    const saved = store.update('declarations', row.id, patch);
    audit.log(req, { action: 'write', entity: 'declarations', target: row.id, result: 'ok', detail: 'modify/approve' });
    res.json({ data: saved });
  });

  // =========================== AUDIT =============================
  router.get('/api/audit', authenticate, requireJurisdiction(), authorize('audit', 'read'), async (req, res) => {
    const rows = scopedList(req, 'audit', 'audit_log').sort((a, b) => (a.ts < b.ts ? 1 : -1));
    res.json({ scope: req.authScope, count: rows.length, data: rows.slice(0, 200) });
  });
}

module.exports = { register };
