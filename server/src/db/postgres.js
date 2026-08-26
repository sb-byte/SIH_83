'use strict';
/**
 * Unity EOC — PostgreSQL + PostGIS Client Pool
 * ===========================================================================
 * Connects to PostgreSQL (Supabase, Neon, or local Postgres).
 * Includes PostGIS spatial query helpers with a fallback to memory store
 * if a Postgres service is not running locally.
 */
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/unity_eoc';

let pool = null;
let isConnected = false;

function initPool() {
  if (pool) return pool;
  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('supabase') || DATABASE_URL.includes('neon') ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30000,
    });

    pool.on('error', (err) => {
      console.warn('[postgres] idle client error:', err.message);
    });

    return pool;
  } catch (err) {
    console.warn('[postgres] could not initialize pool:', err.message);
    return null;
  }
}

async function testConnection() {
  const p = initPool();
  if (!p) return false;
  try {
    const client = await p.connect();
    const res = await client.query('SELECT NOW() as now, PostGIS_Version() as postgis');
    client.release();
    isConnected = true;
    console.log(`[postgres] connected to database. PostGIS: ${res.rows[0].postgis || 'Available'}`);
    return true;
  } catch (err) {
    isConnected = false;
    console.warn(`[postgres] connection unavailable (${err.message}) — using file/memory store.`);
    return false;
  }
}

/**
 * Spatial Query: Find Responders/Fleet within radiusKm of lat, lng
 */
async function findRespondersWithin(lat, lng, radiusKm = 10) {
  if (!isConnected) return null;
  const query = `
    SELECT id, name, type, unit, region, site, loc, crew, battery_fuel, status, lat, lng,
           ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1000 AS distance_km
    FROM fleet_assets
    WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3 * 1000)
    ORDER BY distance_km ASC;
  `;
  try {
    const res = await pool.query(query, [lat, lng, radiusKm]);
    return res.rows;
  } catch (err) {
    console.warn('[postgres-spatial] findRespondersWithin failed:', err.message);
    return null;
  }
}

/**
 * Spatial Query: Find Closest Multipurpose Shelter with Capacity
 */
async function findNearestShelter(lat, lng) {
  if (!isConnected) return null;
  const query = `
    SELECT id, name, region, site, capacity, occupied, status, medical_support, food_rations, lat, lng,
           ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1000 AS distance_km
    FROM shelters
    WHERE occupied < capacity
    ORDER BY distance_km ASC
    LIMIT 1;
  `;
  try {
    const res = await pool.query(query, [lat, lng]);
    return res.rows[0] || null;
  } catch (err) {
    console.warn('[postgres-spatial] findNearestShelter failed:', err.message);
    return null;
  }
}

/**
 * Spatial Query: Check if coordinates fall inside any declared Danger Zone
 */
async function checkPointInDangerZone(lat, lng) {
  if (!isConnected) return null;
  const query = `
    SELECT id, name, severity, radius_km, declared_by,
           ST_Contains(polygon_geom, ST_SetSRID(ST_MakePoint($2, $1), 4326)) AS inside_zone
    FROM danger_zones
    WHERE ST_Contains(polygon_geom, ST_SetSRID(ST_MakePoint($2, $1), 4326));
  `;
  try {
    const res = await pool.query(query, [lat, lng]);
    return res.rows;
  } catch (err) {
    console.warn('[postgres-spatial] checkPointInDangerZone failed:', err.message);
    return null;
  }
}

module.exports = {
  pool,
  initPool,
  testConnection,
  findRespondersWithin,
  findNearestShelter,
  checkPointInDangerZone,
  get isConnected() { return isConnected; }
};
