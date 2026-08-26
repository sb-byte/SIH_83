'use strict';
/**
 * Minimal HTTP router built on node:http — zero external dependencies.
 * ---------------------------------------------------------------------------
 * Middleware model (deliberately simple): each handler is
 *     async (req, res) => { ... }
 * Handlers registered for a route run IN ORDER. A handler either:
 *   (a) sends a response (res.json / res.send / res.status().json) -> chain stops, or
 *   (b) returns without sending -> control passes to the next handler.
 * This lets us compose guards exactly like Express middleware
 * (e.g. [authenticate, authorize('tasks','read'), listTasks]) without a next().
 */

const http = require('http');

function splitPath(p) {
  return p.split('/').filter(Boolean);
}

function matchSegments(routeSegs, urlSegs) {
  if (routeSegs.length !== urlSegs.length) return null;
  const params = {};
  for (let i = 0; i < routeSegs.length; i++) {
    const rs = routeSegs[i];
    if (rs[0] === ':') params[rs.slice(1)] = decodeURIComponent(urlSegs[i]);
    else if (rs !== urlSegs[i]) return null;
  }
  return params;
}

function decorateRes(res) {
  res._sent = false;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (res._sent) return res;
    res._sent = true;
    const body = JSON.stringify(obj);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(body);
    return res;
  };
  res.send = (text, type = 'text/plain; charset=utf-8') => {
    if (res._sent) return res;
    res._sent = true;
    res.setHeader('Content-Type', type);
    res.end(text);
    return res;
  };
  return res;
}

function parseBody(req) {
  return new Promise((resolve) => {
    const ct = (req.headers['content-type'] || '');
    if (req.method === 'GET' || req.method === 'HEAD') { req.body = {}; return resolve(); }
    let raw = '';
    let tooBig = false;
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) { tooBig = true; req.destroy(); } // 1MB guard
    });
    req.on('end', () => {
      if (tooBig) { req.body = {}; return resolve(); }
      if (!raw) { req.body = {}; return resolve(); }
      if (ct.includes('application/json')) {
        try { req.body = JSON.parse(raw); } catch { req.body = {}; req._badJson = true; }
      } else {
        req.body = { _raw: raw };
      }
      resolve();
    });
    req.on('error', () => { req.body = {}; resolve(); });
  });
}

function createRouter() {
  const globalMw = [];
  const routes = [];
  const add = (method, path, handlers) =>
    routes.push({ method, segments: splitPath(path), handlers });

  const api = {
    use(mw) { globalMw.push(mw); return api; },
    get(p, ...h) { add('GET', p, h); return api; },
    post(p, ...h) { add('POST', p, h); return api; },
    patch(p, ...h) { add('PATCH', p, h); return api; },
    put(p, ...h) { add('PUT', p, h); return api; },
    delete(p, ...h) { add('DELETE', p, h); return api; },

    async dispatch(req, res) {
      const url = new URL(req.url, 'http://internal');
      req.pathname = url.pathname;
      req.query = Object.fromEntries(url.searchParams.entries());
      decorateRes(res);
      try {
        await parseBody(req);
        const urlSegs = splitPath(url.pathname);
        let matched = null;
        let pathExistsOtherMethod = false;
        for (const r of routes) {
          const p = matchSegments(r.segments, urlSegs);
          if (p) {
            if (r.method === req.method) { matched = { r, params: p }; break; }
            pathExistsOtherMethod = true;
          }
        }
        if (!matched) {
          return res.status(pathExistsOtherMethod ? 405 : 404)
            .json({ error: pathExistsOtherMethod ? 'method_not_allowed' : 'not_found',
                    message: `No route for ${req.method} ${url.pathname}` });
        }
        req.params = matched.params;
        const chain = [...globalMw, ...matched.r.handlers];
        for (const fn of chain) {
          await fn(req, res);
          if (res._sent) break;
        }
        if (!res._sent) {
          res.status(500).json({ error: 'no_response', message: 'Handler produced no response' });
        }
      } catch (err) {
        // Never leak stack traces to clients.
        // eslint-disable-next-line no-console
        console.error('[router] unhandled error:', err && err.stack ? err.stack : err);
        if (!res._sent) res.status(500).json({ error: 'server_error' });
      }
    },
  };
  return api;
}

module.exports = { createRouter, http, decorateRes };
