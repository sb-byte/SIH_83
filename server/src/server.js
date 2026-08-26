'use strict';
/**
 * Unity EOC — Express + WebSockets + PostgreSQL / PostGIS API Server
 * ===========================================================================
 * API-ONLY. The front end is the Vite app in the parent directory.
 */
const { http } = require('./lib/http');
const { buildRouter } = require('./app');
const { PORT } = require('./config/env');
const { applyCors, handlePreflight } = require('./middleware/cors');
const store = require('./db/store');
const { seed } = require('./db/seed');
const postgres = require('./db/postgres');
const { WebSocketServer } = require('ws');

function start(port = PORT) {
  store.load();
  if (store.all('users').length === 0) {
    console.log('[server] empty database — seeding demo data...');
    seed({ reset: false });
  }

  // Attempt Postgres / PostGIS connection
  postgres.testConnection();

  const router = buildRouter();
  const server = http.createServer((req, res) => {
    if (handlePreflight(req, res)) return;
    applyCors(req, res);

    let u;
    try { u = new URL(req.url, 'http://internal'); } catch { res.statusCode = 400; return res.end('Bad request'); }
    if (u.pathname.startsWith('/api/')) return router.dispatch(req, res);

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'not_found',
      message: 'This is the Unity EOC Express API (/api/*). The UI is served by Vite — run `npm run dev:web` and open http://localhost:5173.',
    }));
  });

  // Attach WebSocket Server on /ws
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Connected to Unity EOC Real-Time Stream' }));
    ws.on('message', (msg) => {
      // Broadcast incoming message to all connected clients
      wss.clients.forEach((client) => {
        if (client.readyState === 1) client.send(msg.toString());
      });
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`  [express-api] Unity EOC Express + PostGIS API listening on port ${port} (/api)`);
      console.log(`  [websocket] Real-time WebSocket stream active at ws://localhost:${port}/ws`);
      resolve(server);
    });
  });
}

if (require.main === module) start();

module.exports = { start };
