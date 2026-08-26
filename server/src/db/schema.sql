-- =============================================================================
-- UNITY EOC INDIA — POSTGRESQL + POSTGIS DATABASE SCHEMA
-- National Disaster Management Authority (NDMA) • Ministry of Home Affairs
-- Compatible with Supabase, Neon, AWS RDS, and Local PostgreSQL with PostGIS
-- =============================================================================

-- Enable PostGIS Spatial Extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. USERS & 5-TIER RBAC IDENTITIES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    credential_id VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    avatar VARCHAR(16) DEFAULT '🏛️',
    role VARCHAR(16) NOT NULL, -- T1, T2, T3, T4, T5
    tier_name VARCHAR(64) NOT NULL,
    tier_level INT NOT NULL,
    designation VARCHAR(128),
    jurisdiction_label VARCHAR(128),
    region VARCHAR(64),        -- Odisha, West Bengal, Assam, etc.
    site VARCHAR(128),         -- Bhadrak / Dhamra, Kendrapara / Rajnagar, etc.
    team VARCHAR(64),          -- NDRF-03-Bravo, ODRAF-07, etc.
    requires_2fa BOOLEAN DEFAULT FALSE,
    tfa_secret VARCHAR(64),
    failed_login_attempts INT DEFAULT 0,
    lockout_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. OPERATIONAL SITES & DISTRICT COMMAND HUBS (With PostGIS Point Geometry)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sites (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    region VARCHAR(64) NOT NULL,
    lat NUMERIC(10, 6) NOT NULL,
    lng NUMERIC(10, 6) NOT NULL,
    geom GEOMETRY(Point, 4326),
    status VARCHAR(32) DEFAULT 'ACTIVE',
    hazard_type VARCHAR(64) DEFAULT 'Cyclone / Flood Surge',
    inundation_level NUMERIC(4, 2) DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sites_geom ON sites USING GIST (geom);

-- -----------------------------------------------------------------------------
-- 3. MULTIPURPOSE CYCLONE SHELTERS (MCS) (With PostGIS Point Geometry)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shelters (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    region VARCHAR(64) NOT NULL,
    site VARCHAR(128) NOT NULL,
    capacity INT NOT NULL,
    occupied INT DEFAULT 0,
    status VARCHAR(32) DEFAULT 'AVAILABLE', -- AVAILABLE, NEAR FULL, CRITICAL, OVERFLOW
    medical_support VARCHAR(128) DEFAULT 'Paramedic Unit',
    food_rations VARCHAR(64) DEFAULT '48h Stored',
    lat NUMERIC(10, 6) NOT NULL,
    lng NUMERIC(10, 6) NOT NULL,
    geom GEOMETRY(Point, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shelters_geom ON shelters USING GIST (geom);

-- -----------------------------------------------------------------------------
-- 4. EMERGENCY FLEET & RESCUE ASSETS (With PostGIS Point Geometry)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet_assets (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    type VARCHAR(64) NOT NULL, -- Water Rescue, Heavy Vehicle, UAV Drone, Aviation
    unit VARCHAR(128) NOT NULL,
    region VARCHAR(64) NOT NULL,
    site VARCHAR(128) NOT NULL,
    loc VARCHAR(128),
    crew INT DEFAULT 4,
    battery_fuel VARCHAR(32) DEFAULT '90%',
    status VARCHAR(32) DEFAULT 'AVAILABLE', -- AVAILABLE, DEPLOYED, AIRBORNE, OUT_OF_SERVICE
    lat NUMERIC(10, 6) NOT NULL,
    lng NUMERIC(10, 6) NOT NULL,
    geom GEOMETRY(Point, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fleet_geom ON fleet_assets USING GIST (geom);

-- -----------------------------------------------------------------------------
-- 5. OPERATIONAL INCIDENTS & CHRONO STREAM (With PostGIS Point Geometry)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidents (
    id VARCHAR(32) PRIMARY KEY,
    title VARCHAR(256) NOT NULL,
    severity VARCHAR(32) NOT NULL, -- CRITICAL, HIGH, MEDIUM, INFO
    section VARCHAR(64) DEFAULT 'OPS',
    status VARCHAR(64) DEFAULT 'LOGGED',
    details TEXT,
    location_label VARCHAR(256),
    region VARCHAR(64) NOT NULL,
    site VARCHAR(128) NOT NULL,
    lat NUMERIC(10, 6),
    lng NUMERIC(10, 6),
    geom GEOMETRY(Point, 4326),
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incidents_geom ON incidents USING GIST (geom);

-- -----------------------------------------------------------------------------
-- 6. CITIZEN SOS RESCUE ALERTS (With PostGIS Point Geometry)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS citizen_sos (
    id VARCHAR(32) PRIMARY KEY,
    caller_name VARCHAR(128) NOT NULL,
    phone VARCHAR(32),
    people_count INT DEFAULT 1,
    urgency VARCHAR(32) DEFAULT 'HIGH', -- CRITICAL, HIGH, MEDIUM
    msg TEXT NOT NULL,
    region VARCHAR(64) NOT NULL,
    site VARCHAR(128) NOT NULL,
    lat NUMERIC(10, 6) NOT NULL,
    lng NUMERIC(10, 6) NOT NULL,
    geom GEOMETRY(Point, 4326),
    status VARCHAR(32) DEFAULT 'PENDING', -- PENDING, DISPATCHED, EVACUATED
    assigned_unit VARCHAR(64) DEFAULT 'UNASSIGNED',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sos_geom ON citizen_sos USING GIST (geom);

-- -----------------------------------------------------------------------------
-- 7. DECLARED DANGER & INUNDATION ZONES (With PostGIS Polygon Geometry)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS danger_zones (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    severity VARCHAR(32) DEFAULT 'EXTREME',
    radius_km NUMERIC(5, 2) NOT NULL,
    center_lat NUMERIC(10, 6) NOT NULL,
    center_lng NUMERIC(10, 6) NOT NULL,
    center_geom GEOMETRY(Point, 4326),
    polygon_geom GEOMETRY(Polygon, 4326),
    declared_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_danger_zones_poly ON danger_zones USING GIST (polygon_geom);

-- -----------------------------------------------------------------------------
-- 8. ICS TASKS & KANBAN DIRECTIVES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(32) PRIMARY KEY,
    title VARCHAR(256) NOT NULL,
    section VARCHAR(64) DEFAULT 'Operations',
    assignee VARCHAR(128) DEFAULT 'Unassigned',
    due_time VARCHAR(64) DEFAULT 'Operational Period 2',
    status VARCHAR(32) DEFAULT 'open', -- open, in_progress, completed
    progress INT DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    region VARCHAR(64) NOT NULL,
    site VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 9. STRUCTURED TWO-WAY ESCALATIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escalations (
    id VARCHAR(32) PRIMARY KEY,
    origin_user_id INT,
    origin_credential_id VARCHAR(64) NOT NULL,
    origin_role VARCHAR(16) NOT NULL,
    routed_to_tier VARCHAR(16) NOT NULL,
    region VARCHAR(64),
    site VARCHAR(128),
    kind VARCHAR(32) DEFAULT 'general',
    reason TEXT NOT NULL,
    status VARCHAR(32) DEFAULT 'pending', -- pending, approved, denied, forwarded
    triage_note TEXT,
    actioned_by_credential VARCHAR(64),
    actioned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 10. NATIONAL DECLARATIONS (Tier 1 Authority Only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS declarations (
    id VARCHAR(32) PRIMARY KEY,
    title VARCHAR(256) NOT NULL,
    kind VARCHAR(64) NOT NULL, -- National Emergency, Disaster Zone, SDRF Release
    region VARCHAR(64) NOT NULL,
    summary TEXT NOT NULL,
    signed_by VARCHAR(128) NOT NULL,
    effective_from TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 11. AUDIT TRAIL LOGS (Tamper-evident system trail)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    credential_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64),
    role VARCHAR(16) NOT NULL,
    region VARCHAR(64),
    site VARCHAR(128),
    action VARCHAR(128) NOT NULL,
    target_entity VARCHAR(128),
    status VARCHAR(64) NOT NULL,
    details JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);
