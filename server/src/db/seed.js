'use strict';
/**
 * Seed a deterministic demo dataset.
 *   node src/db/seed.js            # seed if empty
 *   node src/db/seed.js --reset    # wipe + reseed
 *
 * 10 users (2 per tier) across 2 regions (Odisha Coastal, Assam Brahmaputra),
 * plus sites/tasks/resources/incidents/declarations/escalations in BOTH regions
 * so cross-jurisdiction leakage can be exercised by the break-tests.
 */
const store = require('../db/store');
const password = require('../auth/password');
const totp = require('../auth/totp');
const { DEMO_PASSWORD, TOTP_SECRETS } = require('../config/env');

const roster = require('./roster');
const {
  REGION_OD, REGION_WB,
  SITE_BHADRAK, SITE_KENDRAPARA, SITE_SUNDERBANS,
  TEAM_NDRF, TEAM_ODRAF,
} = roster;

// Identities come from the canonical roster so the login screen (/api/directory)
// and the authenticating database can never disagree about who exists.
const USERS = roster.ROSTER;

function seed({ reset = false } = {}) {
  store.load();
  if (reset) store.reset();
  if (store.all('users').length > 0 && !reset) {
    console.log('[seed] users already present; use --reset to wipe. Skipping.');
    return summarize();
  }

  const idByCred = {};
  for (const u of USERS) {
    const row = store.insert('users', {
      credential_id: u.cred,
      name: u.name,
      role: u.role,
      region: u.region,
      site: u.site,
      team: u.team,
      // presentation-only (rendered by the UI, never used for authorization)
      avatar: u.avatar,
      designation: u.designation,
      jurisdiction_label: u.jurisdictionLabel,
      // Hashed PER USER so every account gets its own scrypt salt. Sharing one
      // hash would mean one cracked password compromises all ten, and identical
      // hashes would advertise that the passwords are identical.
      password_hash: password.hash(DEMO_PASSWORD),
      // Prefer an operator-supplied secret (env TOTP_SECRETS) so a redeploy doesn't
      // orphan an already-enrolled authenticator app. Falls back to a fresh random.
      totp_secret: (u.role === 'T1' || u.role === 'T2')
        ? ((TOTP_SECRETS && TOTP_SECRETS[u.cred]) || totp.generateSecret())
        : null,
      created_at: new Date().toISOString(),
    });
    idByCred[u.cred] = row.id;
  }
  const uid = (c) => idByCred[c];

  // ---- Sites (district EOC / shelter capacity) ----
  const sites = [
    { name: SITE_BHADRAK,    region: REGION_OD, site: SITE_BHADRAK,    status: 'active', population_at_risk: 128000, shelter_capacity: 4200, shelter_occupancy: 3180, lat: 20.7937, lng: 86.9634 },
    { name: SITE_KENDRAPARA, region: REGION_OD, site: SITE_KENDRAPARA, status: 'active', population_at_risk: 96000,  shelter_capacity: 3100, shelter_occupancy: 1875, lat: 20.5732, lng: 86.8522 },
    { name: SITE_SUNDERBANS, region: REGION_WB, site: SITE_SUNDERBANS, status: 'active', population_at_risk: 71000,  shelter_capacity: 2400, shelter_occupancy: 508,  lat: 21.8750, lng: 88.1880 },
  ];
  sites.forEach((s) => store.insert('sites', s));

  // ---- Tasks (some assigned to specific T4/T5, some site-level) ----
  const tasks = [
    { title: 'Reinforce Dhamra saline embankment breach', section: 'Operations', region: REGION_OD, site: SITE_BHADRAK,    team: TEAM_NDRF,  assigned_to: uid('TACT-NDRF-01'),  status: 'in_progress', progress: 60, lat: 20.7937, lng: 86.9634 },
    { title: 'Water pouch distribution — Shelter B Chandbali', section: 'Logistics', region: REGION_OD, site: SITE_BHADRAK, team: TEAM_NDRF,  assigned_to: uid('VOL-AM-01'),     status: 'assigned',    progress: 10, lat: 20.7761, lng: 86.7420 },
    { title: 'Shelter readiness sweep — Dhamra block',   section: 'Planning',   region: REGION_OD, site: SITE_BHADRAK,    team: null,       assigned_to: null,                 status: 'open',        progress: 0, lat: 20.7885, lng: 86.9580 },
    { title: 'Riverine SAR sweep — Rajnagar creek',      section: 'Operations', region: REGION_OD, site: SITE_KENDRAPARA, team: TEAM_ODRAF, assigned_to: uid('TACT-ODRAF-02'), status: 'in_progress', progress: 35, lat: 20.5732, lng: 86.8522 },
    { title: 'Register evacuees — Kendrapara High School',section: 'Logistics',  region: REGION_OD, site: SITE_KENDRAPARA, team: TEAM_ODRAF, assigned_to: uid('VOL-AM-02'),     status: 'assigned',    progress: 0, lat: 20.5028, lng: 86.4227 },
    { title: 'Gosaba embankment watch rotation',         section: 'Operations', region: REGION_WB, site: SITE_SUNDERBANS, team: null,       assigned_to: null,                 status: 'open',        progress: 0, lat: 22.1653, lng: 88.8021 },
  ];
  tasks.forEach((t) => store.insert('tasks', t));

  // ---- Resources (some with an owning frontline user) ----
  const resources = [
    { type: 'Rescue Boat',   label: 'NDRF-BOAT-04', region: REGION_OD, site: SITE_BHADRAK,    status: 'deployed',        owner_user_id: uid('TACT-NDRF-01'), lat: 20.7937, lng: 86.9634 },
    { type: 'Ambulance',     label: 'OD-AMB-112',   region: REGION_OD, site: SITE_BHADRAK,    status: 'available',       owner_user_id: null,               lat: 21.0543, lng: 86.5186 },
    { type: 'Drone',         label: 'OD-UAV-07',    region: REGION_OD, site: SITE_BHADRAK,    status: 'available',       owner_user_id: uid('TACT-NDRF-01'), lat: 20.7885, lng: 86.9580 },
    { type: 'Rescue Boat',   label: 'ODRAF-BOAT-11',region: REGION_OD, site: SITE_KENDRAPARA, status: 'deployed',        owner_user_id: uid('TACT-ODRAF-02'), lat: 20.5732, lng: 86.8522 },
    { type: 'Heavy Pump',    label: 'OD-PUMP-22',   region: REGION_OD, site: SITE_KENDRAPARA, status: 'out_of_service',  owner_user_id: null,               lat: 20.6680, lng: 86.6430 },
    { type: 'Rescue Boat',   label: 'WB-IRB-21',    region: REGION_WB, site: SITE_SUNDERBANS, status: 'available',       owner_user_id: null,               lat: 21.8750, lng: 88.1880 },
    { type: 'Heavy Vehicle', label: 'WB-HWV-07',    region: REGION_WB, site: SITE_SUNDERBANS, status: 'available',       owner_user_id: null,               lat: 22.1653, lng: 88.8021 },
  ];
  resources.forEach((r) => store.insert('resources', r));

  // ---- Incidents ----
  const now = () => new Date().toISOString();
  const incidents = [
    { title: 'Saline embankment breach — Dhamra',      region: REGION_OD, site: SITE_BHADRAK,    severity: 'high',   verified: true,  reported_by: uid('COORD-BHK-01'),  body: 'Tidal surge overtopped the embankment near Dhamra jetty.', lat: 20.7937, lng: 86.9634, created_at: now() },
    { title: 'Power line down — Sector 4 Chandbali',   region: REGION_OD, site: SITE_BHADRAK,    severity: 'medium', verified: false, reported_by: uid('TACT-NDRF-01'),  body: 'Live 11kV conductor reported down across approach road.',  lat: 20.7761, lng: 86.7420, created_at: now() },
    { title: 'Rajnagar creek above danger level',      region: REGION_OD, site: SITE_KENDRAPARA, severity: 'high',   verified: true,  reported_by: uid('COORD-KNP-02'),  body: 'Gauge reading 1.2m over danger mark, rising.',              lat: 20.5732, lng: 86.8522, created_at: now() },
    { title: 'Boat capsize — Pattamundai channel',     region: REGION_OD, site: SITE_KENDRAPARA, severity: 'high',   verified: false, reported_by: uid('VOL-AM-02'),     body: 'Fishing boat overturned, 4 persons unaccounted.',           lat: 20.5810, lng: 86.5740, created_at: now() },
    { title: 'Sunderbans embankment breach — Gosaba',  region: REGION_WB, site: SITE_SUNDERBANS, severity: 'high',   verified: true,  reported_by: null,                 body: 'Ring bund failure flooding 3 villages in Gosaba block.',    lat: 22.1653, lng: 88.8021, created_at: now() },
  ];
  incidents.forEach((i) => store.insert('incidents', i));

  // ---- Declarations (T1 only writes these) ----
  const declarations = [
    { title: 'Declaration of Emergency — Odisha Coastal Belt', region: REGION_OD, site: null, status: 'approved', created_by: uid('NDMA-AUTH-01'), created_at: now() },
    { title: 'Mutual Aid Authorization — West Bengal',         region: REGION_WB, site: null, status: 'draft',    created_by: uid('NDMA-AUTH-02'), created_at: now() },
  ];
  declarations.forEach((d) => store.insert('declarations', d));

  // ---- Escalation requests (pre-seed an inbox to demonstrate routing) ----
  const escalations = [
    { origin_user_id: uid('COORD-BHK-01'),  origin_role: 'T3', region: REGION_OD, site: SITE_BHADRAK,    routed_to_tier: 'T2', kind: 'general', reason: 'Need 2 additional high-capacity dewatering pumps', status: 'pending', actioned_by: null, actioned_at: null, created_at: now() },
    { origin_user_id: uid('VOL-AM-01'),     origin_role: 'T5', region: REGION_OD, site: SITE_BHADRAK,    routed_to_tier: 'T3', kind: 'general', reason: 'Out of water pouches at Shelter B Chandbali',      status: 'pending', actioned_by: null, actioned_at: null, created_at: now() },
    { origin_user_id: uid('TACT-ODRAF-02'), origin_role: 'T4', region: REGION_OD, site: SITE_KENDRAPARA, routed_to_tier: 'T2', kind: 'general', reason: 'Request additional IRB for stranded family (direct line)', status: 'pending', actioned_by: null, actioned_at: null, created_at: now() },
  ];
  escalations.forEach((e) => store.insert('escalation_requests', e));

  store.insert('audit_log', {
    user_id: null, credential: 'system', role: null, region: null, site: null,
    action: 'seed', entity: 'system', target: null, result: 'ok',
    detail: `Seeded ${USERS.length} users`, ip: null, ts: new Date().toISOString(),
  });

  console.log(`[seed] Seeded ${USERS.length} users, ${sites.length} sites, ${tasks.length} tasks, ${resources.length} resources, ${incidents.length} incidents, ${declarations.length} declarations, ${escalations.length} escalations.`);
  return summarize();
}

function summarize() {
  const rows = store.all('users').map((u) => ({
    credential_id: u.credential_id, role: u.role,
    jurisdiction: u.site ? `${u.region} · ${u.site}` : u.region,
    tfa: u.totp_secret ? 'YES' : 'no',
  }));
  return rows;
}

// CLI
if (require.main === module) {
  const reset = process.argv.includes('--reset');
  const rows = seed({ reset });
  console.log('\nSeeded accounts (demo password for all: "' + DEMO_PASSWORD + '"):');
  console.table(rows);
  const tfaUsers = store.all('users').filter((u) => u.totp_secret);
  if (tfaUsers.length) {
    console.log('\n2FA (TOTP) current codes — Tier 1/2 only:');
    for (const u of tfaUsers) {
      console.log(`  ${u.credential_id.padEnd(14)}  code now: ${totp.generate(u.totp_secret)}   secret: ${u.totp_secret}`);
    }
    console.log('  (codes rotate every 30s; run `npm run totp <credential>` to refresh)');
  }
}

module.exports = {
  seed, USERS,
  REGION_OD, REGION_WB,
  SITE_BHADRAK, SITE_KENDRAPARA, SITE_SUNDERBANS,
  TEAM_NDRF, TEAM_ODRAF,
};
