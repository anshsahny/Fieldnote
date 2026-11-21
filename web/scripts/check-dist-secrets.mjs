#!/usr/bin/env node
// Post-build guard: fails the build if any App Check debug token (or other private value
// from the gitignored secret files) ended up inside web/dist. Prints file names only.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(webDir, '..');
const distDir = join(webDir, 'dist');

// Values that must never ship. The Firebase web config and reCAPTCHA site key are public by
// design, so they are not listed here.
const PRIVATE_KEYS = [
  'VITE_APPCHECK_DEBUG_TOKEN',
  'VITE_DEMO_DISPATCHER_PASSWORD',
  'VITE_DEMO_TECH_PASSWORD',
  'DEMO_DISPATCHER_PASSWORD',
  'DEMO_TECH_PASSWORD',
  'IOS_SIM_APPCHECK_DEBUG_TOKEN',
  'IOS_DEVICE_APPCHECK_DEBUG_TOKEN',
  'FN_APPCHECK_DEBUG_TOKEN_SIMULATOR',
  'FN_APPCHECK_DEBUG_TOKEN_DEVICE',
];
const SOURCES = [
  join(repoRoot, '.local-secrets'),
  join(webDir, '.env.development.local'),
  join(repoRoot, 'ios/Config/Secrets.xcconfig'),
];

const secrets = new Map();
for (const file of SOURCES) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*['"]?([^'"\s]+)['"]?\s*$/);
    if (m && PRIVATE_KEYS.includes(m[1]) && m[2].length >= 8) secrets.set(m[2], m[1]);
  }
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

if (!existsSync(distDir)) {
  console.error('check-dist-secrets: web/dist not found; run vite build first.');
  process.exit(1);
}

const leaks = [];
for (const file of walk(distDir)) {
  const content = readFileSync(file, 'utf8');
  for (const [value, key] of secrets) {
    if (content.includes(value)) leaks.push(`${relative(webDir, file)} contains ${key}`);
  }
}

if (leaks.length) {
  console.error('check-dist-secrets: PRIVATE VALUES FOUND IN BUILD OUTPUT:\n  ' + leaks.join('\n  '));
  process.exit(1);
}
console.log(`check-dist-secrets: ok (${secrets.size} private value(s) checked, none in dist/)`);
