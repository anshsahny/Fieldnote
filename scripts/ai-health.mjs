#!/usr/bin/env node
// Health probe for Firebase AI Logic (cloud path): exchanges the local App Check debug token, then
// sends a tiny prompt through the same endpoint the web SDK uses. Prints status + latency only;
// secrets are read from the gitignored env files and never printed.
//   node scripts/ai-health.mjs [model]      exit 0 = healthy (HTTP 200 within the time limit)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const f of ['web/.env.local', 'web/.env.development.local']) {
  for (const line of readFileSync(join(root, f), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}
const model = process.argv[2] ?? 'gemini-3.8-flash';
const project = env.VITE_FIREBASE_PROJECT_ID;
const timeoutMs = 60_000;

async function main() {
  const ac = await fetch(
    `https://content-firebaseappcheck.googleapis.com/v1/projects/${project}/apps/${env.VITE_FIREBASE_APP_ID}:exchangeDebugToken?key=${env.VITE_FIREBASE_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ debug_token: env.VITE_APPCHECK_DEBUG_TOKEN, limited_use: true }) },
  );
  if (!ac.ok) throw new Error(`App Check exchange failed: HTTP ${ac.status}`);
  const { token } = await ac.json();

  const started = Date.now();
  const res = await fetch(`https://firebasevertexai.googleapis.com/v1beta/projects/${project}/models/${model}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.VITE_FIREBASE_API_KEY, 'X-Firebase-AppCheck': token },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }] }),
  });
  const ms = Date.now() - started;
  const body = await res.json().catch(() => ({}));
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  const message = body?.error?.message;
  console.log(`${new Date().toISOString()} ${model}: HTTP ${res.status} in ${ms} ms${text ? ` → "${text.slice(0, 40)}"` : ''}${message ? ` · ${message.slice(0, 120)}` : ''}`);
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.log(`${new Date().toISOString()} ${model}: ${e.name === 'TimeoutError' ? `no response within ${timeoutMs / 1000} s` : e.message}`);
  process.exit(1);
});
