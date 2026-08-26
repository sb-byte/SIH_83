'use strict';
/**
 * Unity EOC — CANONICAL USER ROSTER (single source of truth for identities)
 * ===========================================================================
 * Both the seeder (db/seed.js) and the public directory endpoint
 * (/api/directory, used by the login screen's tier cards) read from here, so
 * the UI roster and the authenticating database can never drift apart.
 *
 * ENFORCEMENT KEYS  — these are what the permission engine actually compares:
 *     region · site · team
 * Everything else (name, avatar, designation, jurisdictionLabel, tierName) is
 * presentation only and is safe to show before login.
 *
 * NOTE: passwords and TOTP secrets are NOT here. The seeder hashes a password
 * and generates a TOTP secret per user at seed time; they live only in the
 * server-side database (server/data/, git-ignored) and are never served.
 */

// Regions (T2 scope) ---------------------------------------------------------
const REGION_OD = 'Odisha';
const REGION_WB = 'West Bengal';
const NATIONAL   = 'NATIONAL';   // T1 only — matches every region

// Sites (T3/T4/T5 scope) ----------------------------------------------------
const SITE_BHADRAK    = 'Bhadrak / Dhamra';
const SITE_KENDRAPARA = 'Kendrapara / Rajnagar';
const SITE_SUNDERBANS = 'Kolkata / Sunderbans';

// Teams (T4 scope) ----------------------------------------------------------
const TEAM_NDRF  = 'NDRF-03-Bravo';
const TEAM_ODRAF = 'ODRAF-07';

const ROSTER = [
  // ---- TIER 1 — Authority (national oversight). 2FA mandatory. ------------
  {
    cred: 'NDMA-AUTH-01', role: 'T1', region: NATIONAL, site: null, team: null,
    name: 'Shri Rajesh Verma, IAS', avatar: '🏛️',
    designation: 'Member Secretary & National Incident Director',
    jurisdictionLabel: 'National Command (NDMA New Delhi)',
  },
  {
    cred: 'NDMA-AUTH-02', role: 'T1', region: NATIONAL, site: null, team: null,
    name: 'Smt. Ananya Sen, IAS', avatar: '🛡️',
    designation: 'Special Relief Commissioner & Executive Authority',
    jurisdictionLabel: 'Eastern Regional Command (Kolkata Hub)',
  },

  // ---- TIER 2 — Strategist (one region). 2FA mandatory. -------------------
  {
    cred: 'STRAT-OD-01', role: 'T2', region: REGION_OD, site: null, team: null,
    name: 'Dr. P. K. Mohapatra, OAS', avatar: '🌊',
    designation: 'Regional Operations Chief & Resource Allocator',
    jurisdictionLabel: 'Odisha State EOC (Bhubaneswar)',
  },
  {
    cred: 'STRAT-WB-02', role: 'T2', region: REGION_WB, site: null, team: null,
    name: 'Shri A. K. Banerjee, WBCS', avatar: '🌿',
    designation: 'State Disaster Logistics Strategist',
    jurisdictionLabel: 'West Bengal State EOC (Kolkata / Sunderbans)',
  },

  // ---- TIER 3 — Coordinator (one site). ----------------------------------
  {
    cred: 'COORD-BHK-01', role: 'T3', region: REGION_OD, site: SITE_BHADRAK, team: null,
    name: 'Capt. S. R. Nayak', avatar: '⚓',
    designation: 'District Incident Commander',
    jurisdictionLabel: 'Bhadrak District Incident Hub (Dhamra Sector)',
  },
  {
    cred: 'COORD-KNP-02', role: 'T3', region: REGION_OD, site: SITE_KENDRAPARA, team: null,
    name: 'Maj. R. C. Pradhan', avatar: '🛶',
    designation: 'District Incident Commander',
    jurisdictionLabel: 'Kendrapara Coastal Incident Command Post',
  },

  // ---- TIER 4 — Frontline (task/team scope). -----------------------------
  {
    cred: 'TACT-NDRF-01', role: 'T4', region: REGION_OD, site: SITE_BHADRAK, team: TEAM_NDRF,
    name: 'SI Manoj Kumar', avatar: '🚤',
    designation: 'NDRF Tactical Strike Team Lead',
    jurisdictionLabel: 'NDRF 03 Bn Bravo — Sector 4 Coastal Ingress',
  },
  {
    cred: 'TACT-ODRAF-02', role: 'T4', region: REGION_OD, site: SITE_KENDRAPARA, team: TEAM_ODRAF,
    name: 'Insp. Deepak Jena', avatar: '🛟',
    designation: 'ODRAF Waterborne Search & Rescue Strike Lead',
    jurisdictionLabel: 'ODRAF Unit 07 — Chandbali Riverine Sector',
  },

  // ---- TIER 5 — Volunteer (self scope). ----------------------------------
  {
    cred: 'VOL-AM-01', role: 'T5', region: REGION_OD, site: SITE_BHADRAK, team: TEAM_NDRF,
    name: 'Sunita Das', avatar: '🤝',
    designation: 'Community First Responder (Aapda Mitra)',
    jurisdictionLabel: 'Aapda Mitra Volunteer — Shelter B Chandbali',
  },
  {
    cred: 'VOL-AM-02', role: 'T5', region: REGION_OD, site: SITE_KENDRAPARA, team: TEAM_ODRAF,
    name: 'Bikram Samal', avatar: '🩹',
    designation: 'Community First Responder (Aapda Mitra)',
    jurisdictionLabel: 'Aapda Mitra Volunteer — Shelter Kendrapara High School',
  },
];

const TIER_NAME = {
  T1: 'Tier 1 • Main Authority',
  T2: 'Tier 2 • Strategist',
  T3: 'Tier 3 • Coordinator',
  T4: 'Tier 4 • Frontline',
  T5: 'Tier 5 • Volunteer',
};
const TIER_LEVEL = { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5 };

/** Presentation-safe fields only — this is what /api/directory serves. */
function publicEntry(u) {
  return {
    credentialId: u.cred,
    name: u.name,
    role: u.role,
    tierLevel: TIER_LEVEL[u.role],
    tierName: TIER_NAME[u.role],
    jurisdictionLabel: u.jurisdictionLabel,
    region: u.region,
    site: u.site,
    avatar: u.avatar,
    designation: u.designation,
    requires2FA: u.role === 'T1' || u.role === 'T2',
  };
}

function directory() { return ROSTER.map(publicEntry); }

module.exports = {
  ROSTER, TIER_NAME, TIER_LEVEL, directory, publicEntry,
  REGION_OD, REGION_WB, NATIONAL,
  SITE_BHADRAK, SITE_KENDRAPARA, SITE_SUNDERBANS,
  TEAM_NDRF, TEAM_ODRAF,
};
