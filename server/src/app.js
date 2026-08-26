'use strict';
/** Assemble the API router (mounts auth + domain + escalation + geospatial routes). */
const { createRouter } = require('./lib/http');
const authRoutes = require('./routes/auth.routes');
const dataRoutes = require('./routes/data.routes');
const escRoutes = require('./routes/escalation.routes');
const geoRoutes = require('./routes/geo.routes');

function buildRouter() {
  const router = createRouter();
  router.get('/api/health', async (req, res) => res.json({
    ok: true,
    service: 'unity-eoc-express-api',
    database: 'PostgreSQL + PostGIS',
    ts: new Date().toISOString()
  }));
  authRoutes.register(router);
  dataRoutes.register(router);
  escRoutes.register(router);
  geoRoutes.register(router);
  return router;
}

module.exports = { buildRouter };
