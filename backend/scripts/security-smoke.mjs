// Black-box security smoke test. Starts nothing itself: point it at a running API.
//
//   node scripts/security-smoke.mjs                         # http://localhost:3103
//   BASE_URL=http://localhost:3003 node scripts/security-smoke.mjs
//   CHECK_LIMITS=1 node scripts/security-smoke.mjs          # also burns the per-IP limiter (125 requests)
//
// Needs no credentials: it only checks what an unauthenticated caller can observe.
// Exits non-zero if any check fails.
import { randomBytes } from 'node:crypto';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3103').replace(/\/$/, '');
// Random per run so repeated runs don't share a per-IP rate-limit bucket.
const fakeIp = () => `198.51.100.${1 + (randomBytes(1)[0] % 250)}`;
const RUN_IP = fakeIp();

// Every route that must sit behind requireAuth (Part B). [method, path]
const PROTECTED = [
  ['POST', '/api/scan'],
  ['POST', '/api/scan-receipt'],
  ['POST', '/api/scan-barcode'],
  ['POST', '/api/recipes'],
  ['POST', '/api/drinks'],
  ['GET', '/api/drinks/mocktail/11007'],
  ['POST', '/api/substitutions'],
  ['POST', '/api/support/chat'],
  ['POST', '/api/scan-barcode/confirm'],
  ['GET', '/api/barcode-lookup?barcode=0048700000315'],
];

const GARBAGE_TOKENS = {
  'no token': undefined,
  'garbage token': 'Bearer garbage',
  'jwt-shaped garbage': 'Bearer aaaa.bbbb.cccc',
  'empty bearer': 'Bearer ',
  'wrong scheme': 'Basic Zm9vOmJhcg==',
};

let failures = 0;
function report(ok, name, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function call(method, path, { auth, body, ip = RUN_IP, headers = {} } = {}) {
  const h = { 'CF-Connecting-IP': ip, ...headers };
  if (auth !== undefined) h.Authorization = auth;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  return fetch(BASE_URL + path, {
    method, headers: h,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

console.log(`Smoke testing ${BASE_URL}\n`);

// 1. /health is public
{
  const r = await call('GET', '/health');
  report(r.status === 200, 'GET /health is public and returns 200', `got ${r.status}`);
  report(!r.headers.has('x-powered-by'), '/health has no x-powered-by header');
  report(r.headers.has('x-content-type-options'), '/health has helmet headers (x-content-type-options)');
  report(!r.headers.has('strict-transport-security'), '/health sets no HSTS (left to Cloudflare)');
}

// 2. Protected routes reject every kind of bad credential with 401 — never 500
for (const [method, path] of PROTECTED) {
  for (const [label, auth] of Object.entries(GARBAGE_TOKENS)) {
    const r = await call(method, path, { auth, body: method === 'POST' ? {} : undefined });
    let msg = '';
    try { msg = (await r.json()).error || ''; } catch { /* non-JSON */ }
    report(
      r.status === 401 && msg === 'Missing or invalid auth token' && !r.headers.has('x-powered-by'),
      `${method} ${path.split('?')[0]} -> 401 with ${label}`,
      r.status === 401 ? '' : `got ${r.status}`,
    );
  }
}

// 3. Removed route: must be gone (404), with and without credentials
for (const [label, auth] of [['no token', undefined], ['garbage token', 'Bearer garbage']]) {
  const r = await call('POST', '/api/store-abbreviations/add', { auth, body: { store: '__proto__', abbreviation: 'polluted', fullName: 'yes' } });
  report(r.status === 404, `POST /api/store-abbreviations/add -> 404 (route removed) with ${label}`, `got ${r.status}`);
}

// 4. Body limits: default 1mb rejects a 2mb body; scan routes still auth-check first (no 10mb buffering pre-auth)
{
  const big = JSON.stringify({ pad: 'x'.repeat(2 * 1024 * 1024) });
  const r1 = await call('POST', '/api/recipes', { body: big });
  report(r1.status === 413, 'POST /api/recipes with a 2mb body -> 413 (1mb default limit)', `got ${r1.status}`);
  const r2 = await call('POST', '/api/scan', { body: big });
  report(r2.status === 401, 'POST /api/scan with a 2mb body and no token -> 401 (rejected before body is parsed)', `got ${r2.status}`);
}

// 5. Optional: coarse per-IP limiter (opt-in, sends 125 requests from one fake IP)
if (process.env.CHECK_LIMITS === '1') {
  const ip = fakeIp();
  const codes = [];
  for (let i = 0; i < 125; i++) codes.push((await call('POST', '/api/recipes', { ip, body: {} })).status);
  const limited = codes.filter((c) => c === 429).length;
  const r = await call('POST', '/api/recipes', { ip, body: {}, headers: { Origin: 'https://mypantryclub.com' } });
  report(limited >= 1 && r.status === 429, 'per-IP limiter returns 429 after 120 requests/min', `${limited} of 125 were 429`);
  report(r.headers.get('access-control-allow-origin') === 'https://mypantryclub.com', '429 response carries CORS headers');
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
