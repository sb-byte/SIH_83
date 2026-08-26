'use strict';
/**
 * CORS for the split deployment (UI on Vercel, API on Render).
 * ---------------------------------------------------------------------------
 * Only needed when the browser origin differs from the API origin. If you proxy
 * /api through Vercel's rewrites instead (see vercel.json), the request is
 * same-origin and none of this runs.
 *
 * FAILS CLOSED: the allowlist comes from ALLOWED_ORIGINS and is empty by default,
 * so an unlisted origin gets no CORS headers and the browser refuses the response.
 *
 * There is deliberately NO Access-Control-Allow-Credentials. Sessions are Bearer
 * tokens in sessionStorage, never cookies, so the browser has no ambient
 * credential to attach — which is also why this API needs no CSRF defence.
 */
const { ALLOWED_ORIGINS } = require('../config/env');

// Supports exact origins and a leading-wildcard host (e.g. https://*.vercel.app)
// so Vercel preview deployments, whose subdomain changes every push, still work.
function matches(pattern, origin) {
  if (pattern === origin) return true;
  if (!pattern.includes('*')) return false;
  try {
    const p = new URL(pattern.replace('*.', 'wildcard-placeholder.'));
    const o = new URL(origin);
    if (p.protocol !== o.protocol) return false;
    const suffix = pattern.slice(pattern.indexOf('*.') + 1); // ".vercel.app"
    return o.hostname.endsWith(suffix) && o.hostname !== suffix.slice(1);
  } catch {
    return false;
  }
}

function isAllowed(origin) {
  return ALLOWED_ORIGINS.some((p) => matches(p, origin));
}

/** Sets the response headers. Returns true if the origin was allowlisted. */
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;               // same-origin or a non-browser client
  if (!isAllowed(origin)) return false;   // silence is the refusal
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Access-Token');
  res.setHeader('Access-Control-Max-Age', '600');
  return true;
}

/**
 * Answers a preflight directly. Returns true if it handled the request.
 * Preflights never reach the router, so they cannot be confused for real calls.
 */
function handlePreflight(req, res) {
  if (req.method !== 'OPTIONS') return false;
  const ok = applyCors(req, res);
  res.statusCode = ok ? 204 : 403;
  res.end();
  return true;
}

module.exports = { applyCors, handlePreflight, isAllowed };
