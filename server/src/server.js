'use strict';
/**
 * Unity EOC — auth/RBAC API server.
 * ---------------------------------------------------------------------------
 * API-ONLY. The front end is the Vite app in the parent directory, which proxies
 * /api/* here in dev (see ../vite.config.js). Zero dependencies: `npm start`.
 */
const { http } = require('./lib/http');
const { buildRouter } = require('./app');
const { PORT } = require('./config/env');
const { applyCors, handlePreflight } = require('./middleware/cors');
const store = require('./db/store');
const { seed } = require('./db/seed');

function start(port = PORT) {
  store.load();
  if (store.all('users').length === 0) {
    console.log('[server] empty database — seeding demo data...');
    seed({ reset: false });
  }
  const router = buildRouter();
  const server = http.createServer((req, res) => {
    // CORS first: a preflight is answered here and never reaches the router, so it
    // can't be mistaken for a real call. Only matters cross-origin.
    if (handlePreflight(req, res)) return;
    applyCors(req, res);

    let u;
    try { u = new URL(req.url, 'http://internal'); } catch { res.statusCode = 400; return res.end('Bad request'); }
    if (u.pathname.startsWith('/api/')) return router.dispatch(req, res);
    // Anything else: this process serves no static assets by design.
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'not_found',
      message: 'This is the Unity EOC auth API (/api/*). The UI is served by Vite — run `npm run dev` in the project root and open http://localhost:5173.',
    }));
  });
  return new Promise((resolve) => {
    // 0.0.0.0, not localhost: container hosts (Render, Fly, Docker) route external
    // traffic to the container's public interface, and a localhost-only bind is
    // invisible to them — the classic "deploy succeeds, health check fails" bug.
    server.listen(port, '0.0.0.0', () => {
      console.log(`  [auth-api] Unity EOC access control listening on port ${port} (/api)`);
      resolve(server);
    });
  });
}

if (require.main === module) start();

module.exports = { start };
