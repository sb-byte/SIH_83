'use strict';
/**
 * Persistent store — a tiny JSON-file-backed data layer (zero dependencies).
 * ---------------------------------------------------------------------------
 * This is a stand-in for a real database so the module runs anywhere with just
 * Node. The IMPORTANT part for security is that all reads/writes go through this
 * layer, and jurisdiction filtering is applied here in services/scope.js — NOT
 * only in the route layer. Swapping this for Postgres/SQLite later is a localized
 * change: keep the same function signatures.
 *
 * Data file: data/unity-eoc.json (inspectable; audit_log is a real, growing table).
 */
const fs = require('fs');
const { DB_PATH, ensureDataDir } = require('../config/env');

const COLLECTIONS = [
  'users', 'sites', 'tasks', 'resources', 'incidents',
  'escalation_requests', 'declarations', 'audit_log',
];

let data = null;

function blank() {
  const o = { meta: { seq: {} } };
  for (const c of COLLECTIONS) o[c] = [];
  return o;
}

function load() {
  ensureDataDir();
  if (fs.existsSync(DB_PATH)) {
    try { data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
    catch { data = blank(); }
  } else {
    data = blank();
  }
  if (!data.meta) data.meta = { seq: {} };
  for (const c of COLLECTIONS) if (!Array.isArray(data[c])) data[c] = [];
  return data;
}

function ensure() { if (!data) load(); return data; }

function persist() {
  ensure();
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  try {
    fs.renameSync(tmp, DB_PATH); // atomic write
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      try { fs.unlinkSync(DB_PATH); } catch (_) {}
      try {
        fs.renameSync(tmp, DB_PATH);
      } catch (_) {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
      }
    } else {
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    }
  }
}

function nextId(coll) {
  ensure();
  data.meta.seq[coll] = (data.meta.seq[coll] || 0) + 1;
  return data.meta.seq[coll];
}

function all(coll) { ensure(); return data[coll].slice(); }
function find(coll, pred) { ensure(); return data[coll].filter(pred); }
function findOne(coll, pred) { ensure(); return data[coll].find(pred) || null; }
function findById(coll, id) { ensure(); return data[coll].find((r) => String(r.id) === String(id)) || null; }

function insert(coll, row) {
  ensure();
  if (row.id == null) row.id = nextId(coll);
  data[coll].push(row);
  persist();
  return row;
}

function update(coll, id, patch) {
  ensure();
  const r = findById(coll, id);
  if (!r) return null;
  Object.assign(r, patch);
  persist();
  return r;
}

function reset() { data = blank(); persist(); return data; }

module.exports = {
  COLLECTIONS, DB_PATH, load, ensure, persist, nextId,
  all, find, findOne, findById, insert, update, reset,
};
