'use strict';
/**
 * Unity EOC — Geospatial & PostGIS Query Routes
 * ===========================================================================
 * Provides proximity search, zone containment, and routing assistance
 * backed by PostGIS (with Turf / Haversine fallback if offline).
 */
const postgres = require('../db/postgres');
const store = require('../db/store');

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function register(router) {
  router.get('/api/geo/proximity', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radiusKm = parseFloat(req.query.radius_km || '15');
    const targetType = (req.query.type || 'fleet').toLowerCase();

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'invalid_coordinates', message: 'lat and lng query parameters are required.' });
    }

    if (postgres.isConnected && targetType === 'fleet') {
      const postgisResults = await postgres.findRespondersWithin(lat, lng, radiusKm);
      if (postgisResults) {
        return res.json({
          engine: 'PostGIS / PostgreSQL',
          center: { lat, lng },
          radius_km: radiusKm,
          count: postgisResults.length,
          results: postgisResults
        });
      }
    }

    let items = [];
    if (targetType === 'shelters') {
      items = store.all('shelters') || [];
    } else if (targetType === 'incidents') {
      items = store.all('incidents') || [];
    } else {
      items = store.all('fleet') || [];
    }

    const results = items
      .filter(item => item.lat && item.lng)
      .map(item => {
        const dist = haversineKm(lat, lng, item.lat, item.lng);
        return { ...item, distance_km: Math.round(dist * 100) / 100 };
      })
      .filter(item => item.distance_km <= radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km);

    res.json({
      engine: 'Haversine Spatial Fallback',
      center: { lat, lng },
      radius_km: radiusKm,
      count: results.length,
      results
    });
  });

  router.get('/api/geo/nearest-shelter', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'invalid_coordinates', message: 'lat and lng query parameters are required.' });
    }

    if (postgres.isConnected) {
      const shelter = await postgres.findNearestShelter(lat, lng);
      if (shelter) return res.json({ engine: 'PostGIS', shelter });
    }

    const allShelters = store.all('shelters') || [];
    const valid = allShelters
      .filter(s => s.lat && s.lng && (s.occupied < s.capacity || !s.capacity))
      .map(s => ({
        ...s,
        distance_km: Math.round(haversineKm(lat, lng, s.lat, s.lng) * 100) / 100
      }))
      .sort((a, b) => a.distance_km - b.distance_km);

    if (valid.length === 0) {
      return res.status(404).json({ error: 'no_shelters_found', message: 'No shelters available with remaining capacity.' });
    }

    res.json({
      engine: 'Haversine Spatial Fallback',
      shelter: valid[0]
    });
  });

  router.get('/api/geo/containment', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'invalid_coordinates', message: 'lat and lng query parameters are required.' });
    }

    if (postgres.isConnected) {
      const zones = await postgres.checkPointInDangerZone(lat, lng);
      if (zones) {
        return res.json({
          engine: 'PostGIS',
          point: { lat, lng },
          in_danger_zone: zones.length > 0,
          zones
        });
      }
    }

    const declarations = store.all('declarations') || [];
    res.json({
      engine: 'Declarations Scope',
      point: { lat, lng },
      in_danger_zone: false,
      active_declarations_count: declarations.length
    });
  });
}

module.exports = { register };
