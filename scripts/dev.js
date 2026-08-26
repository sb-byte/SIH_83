#!/usr/bin/env node
'use strict';
/**
 * Runs the auth API and the Vite dev server together, with prefixed output.
 * Written with Node built-ins only — the npm registry is not assumed reachable,
 * so there is no `concurrently` dependency to install.
 *
 *   node scripts/dev.js        (or: npm run dev)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const children = [];
let shuttingDown = false;

const COLOR = { api: '\x1b[36m', vite: '\x1b[35m', reset: '\x1b[0m', dim: '\x1b[2m' };

function run(label, command, args, opts = {}) {
  const child = spawn(command, args, {
    cwd: opts.cwd || ROOT,
    env: { ...process.env, ...(opts.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  const tint = COLOR[label] || '';
  const prefix = `${tint}[${label}]${COLOR.reset} `;
  const pipe = (stream) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) if (line.trim()) process.stdout.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    process.stdout.write(`${prefix}exited (${signal || code}) — shutting down the other process too.\n`);
    stopAll(code === null ? 1 : code);
  });
  children.push(child);
  return child;
}

function stopAll(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) { try { c.kill('SIGTERM'); } catch { /* already gone */ } }
  setTimeout(() => process.exit(code), 250);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

console.log(`${COLOR.dim}Unity EOC — starting FastAPI backend (:8000) and Vite frontend (:5173).${COLOR.reset}`);
console.log(`${COLOR.dim}Swagger Docs: http://localhost:8000/docs | Live App: http://localhost:5173${COLOR.reset}\n`);

// Start FastAPI Backend first
const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
run('fastapi', pyCmd, ['-m', 'uvicorn', 'backend.app.main:app', '--port', '8000', '--reload'], {
  env: { UNITY_DEMO_MODE: '1' },
});

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
run('vite', npmCmd, ['run', 'dev:web']);
