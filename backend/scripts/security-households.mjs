// Endpoint tests for /api/households/* (and the household handling in /api/delete-account*).
//
// SAFE BY CONSTRUCTION: this only runs against the Firebase EMULATORS. It refuses to start unless
// FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are set, so it can never create users or
// documents in production. Run it via the kit runner, which starts the emulators, boots a SECOND API
// instance on :3103 (PM2 untouched; it inherits the emulator env) and then runs this file:
//
//   ~/phase4-kit/rules-test/run-endpoints.sh
//
// or by hand inside `firebase emulators:exec --only firestore,auth`:
//   PORT=3103 node index.js &  BASE_URL=http://localhost:3103 node scripts/security-households.mjs
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3103').replace(/\/$/, '');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) {
  console.error('Refusing to run: FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must be set (emulators only).');
  process.exit(2);
}
const PROJECT = 'pantrypal-ab665';
initializeApp({ projectId: PROJECT });
const db = getFirestore();

let failures = 0, passes = 0;
function ok(name, cond, detail = '') {
  if (cond) passes++; else failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  (${detail})`}`);
}
const eq = (name, actual, expected) => ok(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
const section = (t) => console.log(`\n== ${t}`);

// ── helpers ──────────────────────────────────────────────────────────────────
const RUN = randomBytes(3).toString('hex');
let userCount = 0;
async function newUser(label, displayName) {
  const email = `${label}-${RUN}-${++userCount}@example.test`;
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Passw0rd!test', returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error(`could not mint user ${label}: ${JSON.stringify(j)}`);
  if (displayName) await db.doc(`users/${j.localId}`).set({ displayName });
  return { uid: j.localId, token: j.idToken, label };
}
const randIp = () => `203.0.113.${1 + Math.floor(Math.random() * 250)}`;
async function api(method, path, user, body, { rawToken } = {}) {
  const headers = { 'CF-Connecting-IP': randIp() };
  const token = rawToken !== undefined ? rawToken : user?.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, body: json };
}
const hhDoc = async (hid) => { const s = await db.doc(`households/${hid}`).get(); return s.exists ? s.data() : null; };
const uidsOf = (d) => [...(d?.memberUids || [])].sort();
const memberUidsFromMembers = (d) => (d?.members || []).map((m) => m.uid).sort();
const consistent = (d) => JSON.stringify(uidsOf(d)) === JSON.stringify(memberUidsFromMembers(d));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const expiredToken = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, auth_time: 1, user_id: 'x', sub: 'x', iat: 1, exp: 2, firebase: { identities: {}, sign_in_provider: 'password' } })}.`;
const CODE_ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

async function seedHousehold(hid, { code, ownerUid = `seed-owner-${hid}`, extraMembers = [], disbanded = false, name = 'Seeded' }) {
  const members = [{ uid: ownerUid, displayName: 'Seed Owner', email: '', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' }, ...extraMembers];
  await db.doc(`households/${hid}`).set({
    id: hid, name, code, createdBy: ownerUid, members, memberUids: members.map((m) => m.uid),
    settings: { sharesPantry: true, sharesRecipes: true, sharesMealPlan: true }, ...(disbanded ? { disbanded: true } : {}),
  });
}
const fakeMember = (uid, role = 'member', joinedAt = '2026-01-02T00:00:00.000Z') => ({ uid, displayName: uid, email: '', role, joinedAt });

// ── 0. safety canary ─────────────────────────────────────────────────────────
section('0. running against emulators only');
ok('FIRESTORE_EMULATOR_HOST set', !!FS_HOST);
ok('FIREBASE_AUTH_EMULATOR_HOST set', !!AUTH_HOST);
{
  const canary = await api('GET', '/health');
  ok('API instance is up', canary.status === 200, `status ${canary.status}`);
}

// ── 1. every route: 401 for no / garbage / expired token ─────────────────────
section('1. auth: 401 for no token, garbage token, expired token');
{
  const routes = [
    ['POST', '/api/households', {}],
    ['POST', '/api/households/join', { code: 'ABCD2345' }],
    ['POST', '/api/households/hh_x/leave', {}],
    ['POST', '/api/households/hh_x/members/someone/role', { role: 'member' }],
    ['POST', '/api/households/hh_x/members/someone/remove', {}],
    ['PATCH', '/api/households/hh_x', { name: 'x' }],
    ['POST', '/api/households/hh_x/rotate-code', {}],
    ['DELETE', '/api/households/hh_x', undefined],
  ];
  for (const [m, p, body] of routes) {
    const res = [];
    for (const rawToken of [undefined, 'garbage', expiredToken, 'aaaa.bbbb.cccc']) res.push((await api(m, p, null, body, { rawToken })).status);
    eq(`${m} ${p.replace('someone', ':uid')} -> 401 x4`, res, [401, 401, 401, 401]);
  }
}

// ── 2. create ────────────────────────────────────────────────────────────────
section('2. create household');
const A = await newUser('owner', 'Alice Owner');
let hidA, codeA;
{
  const r = await api('POST', '/api/households', A, { name: '  The Smiths  ', displayName: 'EVIL', role: 'owner', members: [{ uid: 'x', role: 'owner' }], code: 'AAAAAAAA', createdBy: 'x' });
  eq('create -> 201', r.status, 201);
  hidA = r.body?.id; codeA = r.body?.code;
  ok('id matches hh_ pattern', /^hh_[A-Za-z0-9_]+$/.test(hidA || ''), hidA);
  ok('code is 8 chars from the unambiguous alphabet, not the client-supplied one', CODE_ALPHABET.test(codeA || ''), codeA);
  eq('name trimmed', r.body?.name, 'The Smiths');
  eq('caller is the only member, as owner, displayName from users doc (body displayName ignored)', [r.body?.members?.length, r.body?.members?.[0]?.uid === A.uid, r.body?.members?.[0]?.role, r.body?.members?.[0]?.displayName], [1, true, 'owner', 'Alice Owner']);
  eq('createdBy is the caller (body createdBy ignored)', r.body?.createdBy === A.uid, true);
  eq('settings default all true', r.body?.settings, { sharesPantry: true, sharesRecipes: true, sharesMealPlan: true });
  const d = await hhDoc(hidA);
  ok('household doc exists with members/memberUids consistent', !!d && consistent(d) && uidsOf(d).length === 1 && d.memberUids[0] === A.uid);
  const ev = await db.collection(`household_activity/${hidA}/events`).get();
  eq('one activity event written server-side with uid = actor', [ev.size, ev.docs[0]?.data().uid === A.uid, ev.docs[0]?.data().type], [1, true, 'member_join']);
  const again = await api('POST', '/api/households', A, { name: 'Second' });
  eq('creating a second household while in one -> 409', again.status, 409);
}
{
  const U = await newUser('val');
  const bad = [];
  for (const body of [{}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(61) }, { name: 5 }, { name: ['a'] }]) bad.push((await api('POST', '/api/households', U, body)).status);
  eq('create validation: empty/whitespace/61 chars/non-string name -> 400', bad, [400, 400, 400, 400, 400, 400]);
  eq('name of exactly 60 chars accepted', (await api('POST', '/api/households', U, { name: 'y'.repeat(60) })).status, 201);
}

// ── 3. join ──────────────────────────────────────────────────────────────────
section('3. join');
const B = await newUser('member', 'Bob Member');
const C = await newUser('outsider', 'Carol Outsider');
{
  const wrong = await api('POST', '/api/households/join', C, { code: 'ZZZZZZZZ' });
  eq('wrong code -> 404 "Invalid code"', [wrong.status, wrong.body?.error], [404, 'Invalid code']);
  const malformed = await api('POST', '/api/households/join', C, { code: 'nope' });
  eq('malformed code -> same generic 404', [malformed.status, malformed.body?.error], [404, 'Invalid code']);
  eq('missing code -> 400', (await api('POST', '/api/households/join', C, {})).status, 400);

  const okJoin = await api('POST', '/api/households/join', B, { code: codeA.toLowerCase() });
  eq('join with the right code (lowercase) -> 200', okJoin.status, 200);
  eq('B is a plain member and in memberUids', [okJoin.body?.members?.find((m) => m.uid === B.uid)?.role, okJoin.body?.memberUids?.includes(B.uid)], ['member', true]);
  eq('displayName came from the users doc', okJoin.body?.members?.find((m) => m.uid === B.uid)?.displayName, 'Bob Member');
  const again = await api('POST', '/api/households/join', B, { code: codeA });
  eq('join again is idempotent 200 with no duplicate', [again.status, again.body?.members?.filter((m) => m.uid === B.uid).length], [200, 1]);
  const d = await hhDoc(hidA);
  ok('members and memberUids stay consistent', consistent(d) && d.members.length === 2);
  const ev = await db.collection(`household_activity/${hidA}/events`).where('uid', '==', B.uid).get();
  eq('join activity event written once (idempotent join adds none), uid = actor', ev.size, 1);
}
{
  // legacy 6-char code still works, case-insensitively
  await seedHousehold('hh_legacy1', { code: 'ABCL23', name: 'Legacy' });
  const L = await newUser('legacyjoiner', 'Lee');
  const r = await api('POST', '/api/households/join', L, { code: 'abcl23' });
  eq('existing 6-char code (contains L) still joins', [r.status, r.body?.id], [200, 'hh_legacy1']);
}
{
  // one household per user
  const D0 = await newUser('one');
  const r1 = await api('POST', '/api/households/join', D0, { code: codeA });
  eq('user joins A\'s household', r1.status, 200);
  await seedHousehold('hh_other1', { code: 'OTHER234', name: 'Other' });
  eq('joining a DIFFERENT household while in one -> 409', (await api('POST', '/api/households/join', D0, { code: 'OTHER234' })).status, 409);
  eq('creating a household while in one -> 409', (await api('POST', '/api/households', D0, { name: 'Nope' })).status, 409);
  eq('re-joining the household they are in stays 200', (await api('POST', '/api/households/join', D0, { code: codeA })).status, 200);
  // a disbanded household does not count against the one-household rule
  const Z = await newUser('zombie');
  await seedHousehold('hh_zombie1', { code: 'ZOMB2345', disbanded: true, extraMembers: [fakeMember(Z.uid)] });
  eq('member of a DISBANDED household can still create a new one', (await api('POST', '/api/households', Z, { name: 'Fresh start' })).status, 201);
}
{
  await seedHousehold('hh_disb1', { code: 'DISB2345', disbanded: true });
  const X = await newUser('disbjoin');
  eq('joining a disbanded household -> generic 404', (await api('POST', '/api/households/join', X, { code: 'DISB2345' })).body?.error, 'Invalid code');
}
{
  // member cap = 20
  const nineteen = Array.from({ length: 18 }, (_, i) => fakeMember(`cap-user-${i}`)); // + owner = 19 members
  await seedHousehold('hh_cap1', { code: 'CAPFULL2', extraMembers: nineteen });
  const G1 = await newUser('cap1'), G2 = await newUser('cap2');
  const r19 = await api('POST', '/api/households/join', G1, { code: 'CAPFULL2' });
  eq('20th member can join (19 -> 20)', [r19.status, r19.body?.members?.length], [200, 20]);
  const r20 = await api('POST', '/api/households/join', G2, { code: 'CAPFULL2' });
  eq('21st member -> 409 "Household is full"', [r20.status, r20.body?.error], [409, 'Household is full']);
  const idem = await api('POST', '/api/households/join', G1, { code: 'CAPFULL2' });
  eq('existing member re-joining a full household is still 200', idem.status, 200);
}
{
  // rate limit: 10 join attempts per hour per uid, then 429
  const R = await newUser('ratelimit');
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await api('POST', '/api/households/join', R, { code: 'RATELMT2' })).status);
  eq('10 attempts answered (404), the 11th -> 429', [codes.slice(0, 10).every((c) => c === 404), codes[10]], [true, 429]);
}

// ── 4. roles and permissions ─────────────────────────────────────────────────
section('4. roles: promote/demote/remove/leave');
const D = await newUser('coadmin', 'Dana CoAdmin');
const E = await newUser('coadmin2', 'Eve CoAdmin');
{
  await api('POST', '/api/households/join', D, { code: codeA });
  await api('POST', '/api/households/join', E, { code: codeA });
  const H = await newUser('plain', 'Hal Plain');
  await api('POST', '/api/households/join', H, { code: codeA });
  const p = (u) => `/api/households/${hidA}/members/${u.uid}/role`;

  eq('B (member) cannot change roles -> 403', (await api('POST', p(D), B, { role: 'co-admin' })).status, 403);
  eq('B cannot rename -> 403', (await api('PATCH', `/api/households/${hidA}`, B, { name: 'Hacked' })).status, 403);
  eq('B cannot rotate the code -> 403', (await api('POST', `/api/households/${hidA}/rotate-code`, B, {})).status, 403);
  eq('B cannot disband -> 403', (await api('DELETE', `/api/households/${hidA}`, B)).status, 403);
  eq('B cannot remove others -> 403', (await api('POST', `/api/households/${hidA}/members/${D.uid}/remove`, B, {})).status, 403);

  const promo = await api('POST', p(D), A, { role: 'co-admin' });
  eq('owner promotes D -> 200, D is co-admin', [promo.status, promo.body?.members?.find((m) => m.uid === D.uid)?.role], [200, 'co-admin']);
  eq('owner promotes E', (await api('POST', p(E), A, { role: 'co-admin' })).status, 200);
  ok('memberUids untouched by role change', consistent(await hhDoc(hidA)));
  eq('same-role change is a 200 no-op', (await api('POST', p(E), A, { role: 'co-admin' })).status, 200);

  eq('co-admin cannot change roles -> 403', (await api('POST', p(H), D, { role: 'co-admin' })).status, 403);
  eq('co-admin cannot demote another co-admin -> 403', (await api('POST', p(E), D, { role: 'member' })).status, 403);
  eq('co-admin cannot remove another co-admin -> 403', (await api('POST', `/api/households/${hidA}/members/${E.uid}/remove`, D, {})).status, 403);
  eq('co-admin cannot remove the owner -> 403', (await api('POST', `/api/households/${hidA}/members/${A.uid}/remove`, D, {})).status, 403);
  eq('co-admin cannot disband -> 403', (await api('DELETE', `/api/households/${hidA}`, D)).status, 403);

  eq('owner cannot demote self -> 409', (await api('POST', p(A), A, { role: 'member' })).status, 409);
  eq('nobody can set role "owner" -> 400 (owner)', (await api('POST', p(B), A, { role: 'owner' })).status, 400);
  eq('role "admin"/missing -> 400', [(await api('POST', p(B), A, { role: 'admin' })).status, (await api('POST', p(B), A, {})).status], [400, 400]);
  eq('role change for a non-member target -> 404', (await api('POST', p(C), A, { role: 'member' })).status, 404);
  eq('owner cannot leave -> 409', (await api('POST', `/api/households/${hidA}/leave`, A, {})).status, 409);
  eq('owner cannot be removed (self) -> 409', (await api('POST', `/api/households/${hidA}/members/${A.uid}/remove`, A, {})).status, 409);

  const rm = await api('POST', `/api/households/${hidA}/members/${H.uid}/remove`, D, {});
  eq('co-admin removes a plain member -> 200', [rm.status, rm.body?.memberUids?.includes(H.uid)], [200, false]);
  const dd = await hhDoc(hidA);
  ok('removed member gone from members AND memberUids', consistent(dd) && !uidsOf(dd).includes(H.uid));
  const rmEv = await db.collection(`household_activity/${hidA}/events`).where('type', '==', 'member_leave').get();
  eq('removal event: uid = the remover (actor), about the removed member', [rmEv.docs.some((e) => e.data().uid === D.uid && e.data().displayName === 'Hal Plain')], [true]);
  eq('removed member: household route now 404 for them', (await api('POST', `/api/households/${hidA}/leave`, H, {})).status, 404);
  eq('removing yourself via remove -> 409 (use leave)', (await api('POST', `/api/households/${hidA}/members/${D.uid}/remove`, D, {})).status, 409);
  eq('removing a non-member -> 404', (await api('POST', `/api/households/${hidA}/members/${C.uid}/remove`, D, {})).status, 404);

  eq('owner removes a co-admin (E) -> 200', (await api('POST', `/api/households/${hidA}/members/${E.uid}/remove`, A, {})).status, 200);
  const lv = await api('POST', `/api/households/${hidA}/leave`, B, { uid: 'someone-else' });
  eq('member leaves -> 200 (body uid ignored)', lv.status, 200);
  const dl = await hhDoc(hidA);
  ok('B gone from both arrays, others intact', consistent(dl) && !uidsOf(dl).includes(B.uid) && uidsOf(dl).includes(A.uid) && uidsOf(dl).includes(D.uid));
  const lvEv = await db.collection(`household_activity/${hidA}/events`).where('uid', '==', B.uid).where('type', '==', 'member_leave').get();
  eq('leave activity event written with uid = actor', lvEv.size, 1);
}

// ── 5. PATCH whitelist ───────────────────────────────────────────────────────
section('5. PATCH');
{
  const before = JSON.stringify(await hhDoc(hidA));
  const rejects = [];
  for (const k of ['members', 'memberUids', 'code', 'createdBy', 'disbanded']) {
    rejects.push((await api('PATCH', `/api/households/${hidA}`, A, { name: 'Sneaky', [k]: k === 'members' || k === 'memberUids' ? [] : 'x' })).status);
  }
  eq('PATCH rejects members/memberUids/code/createdBy/disbanded -> 400 each', rejects, [400, 400, 400, 400, 400]);
  eq('rejected PATCHes changed nothing (name not applied either)', JSON.stringify(await hhDoc(hidA)), before);
  eq('unknown settings key / non-boolean -> 400', [(await api('PATCH', `/api/households/${hidA}`, A, { settings: { evil: true } })).status, (await api('PATCH', `/api/households/${hidA}`, A, { settings: { sharesPantry: 'no' } })).status], [400, 400]);
  eq('empty body -> 400', (await api('PATCH', `/api/households/${hidA}`, A, {})).status, 400);
  const good = await api('PATCH', `/api/households/${hidA}`, A, { name: 'The Smith Family', settings: { sharesPantry: false } });
  eq('owner renames + toggles a setting -> 200 (other settings preserved)', [good.status, good.body?.name, good.body?.settings], [200, 'The Smith Family', { sharesPantry: false, sharesRecipes: true, sharesMealPlan: true }]);
  eq('co-admin can PATCH too', (await api('PATCH', `/api/households/${hidA}`, D, { settings: { sharesPantry: true } })).body?.settings?.sharesPantry, true);
  eq('name > 60 chars -> 400', (await api('PATCH', `/api/households/${hidA}`, A, { name: 'x'.repeat(61) })).status, 400);
}

// ── 6. non-member gets 404 on an existing id ─────────────────────────────────
section('6. non-member on an existing household id -> 404 (no probing)');
{
  const cases = [
    ['POST', `/api/households/${hidA}/leave`, {}], ['POST', `/api/households/${hidA}/members/${D.uid}/role`, { role: 'member' }],
    ['POST', `/api/households/${hidA}/members/${D.uid}/remove`, {}], ['PATCH', `/api/households/${hidA}`, { name: 'x' }],
    ['POST', `/api/households/${hidA}/rotate-code`, {}], ['DELETE', `/api/households/${hidA}`, undefined],
  ];
  const real = [], ghost = [];
  for (const [m, p, body] of cases) {
    real.push((await api(m, p, C, body)).status);
    ghost.push((await api(m, p.replace(hidA, 'hh_doesnotexist_1'), C, body)).status);
  }
  eq('existing id, non-member -> 404 on every route', real, [404, 404, 404, 404, 404, 404]);
  eq('same answer as an id that does not exist', real, ghost);
  eq('malformed household id -> 400', (await api('POST', '/api/households/not-an-id/leave', C, {})).status, 400);
}

// ── 7. concurrent joins ──────────────────────────────────────────────────────
section('7. concurrent joins (transaction)');
{
  const owner = await newUser('cc-owner', 'Conc Owner');
  const hh = await api('POST', '/api/households', owner, { name: 'Concurrent' });
  const racers = await Promise.all(Array.from({ length: 5 }, (_, i) => newUser(`racer${i}`)));
  const results = await Promise.all(racers.map((u) => api('POST', '/api/households/join', u, { code: hh.body.code })));
  eq('all 5 concurrent joins -> 200', results.map((r) => r.status), [200, 200, 200, 200, 200]);
  const d = await hhDoc(hh.body.id);
  ok('all 5 + owner are in members AND memberUids (no lost update)', d.members.length === 6 && consistent(d) && racers.every((u) => d.memberUids.includes(u.uid)), `members=${d.members.length}`);
}

// ── 8. rotate code ───────────────────────────────────────────────────────────
section('8. rotate code');
{
  const late = await newUser('late');
  const rot = await api('POST', `/api/households/${hidA}/rotate-code`, D, {});
  eq('co-admin rotates -> 200 with a new 8-char code', [rot.status, CODE_ALPHABET.test(rot.body?.code || ''), rot.body?.code !== codeA], [200, true, true]);
  eq('old code -> 404', (await api('POST', '/api/households/join', late, { code: codeA })).status, 404);
  const nj = await api('POST', '/api/households/join', late, { code: rot.body.code });
  eq('new code works', nj.status, 200);
  codeA = rot.body.code;
}

// ── 9. disband ───────────────────────────────────────────────────────────────
section('9. disband');
{
  const owner = await newUser('dis-owner', 'Dis Owner');
  const mem = await newUser('dis-member');
  const hh = await api('POST', '/api/households', owner, { name: 'To disband' });
  const hid = hh.body.id;
  await api('POST', '/api/households/join', mem, { code: hh.body.code });
  await db.doc(`household_pantry/${hid}/items/i1`).set({ name: 'milk' });
  await db.doc(`household_pantry/${hid}/items/i2`).set({ name: 'eggs' });
  await db.doc(`household_recipes/${hid}/recipes/r1`).set({ title: 'soup' });
  await db.doc(`household_meal_plan/${hid}/days/2026-09-20`).set({ dinner: null });
  await db.doc(`household_pantry/hh_bystander/items/keep`).set({ name: 'must survive' });
  eq('member cannot disband -> 403', (await api('DELETE', `/api/households/${hid}`, mem)).status, 403);
  const del = await api('DELETE', `/api/households/${hid}`, owner);
  eq('owner disbands -> 200', del.status, 200);
  ok('household doc is gone', (await hhDoc(hid)) === null);
  const counts = await Promise.all([
    db.collection(`household_pantry/${hid}/items`).get(), db.collection(`household_recipes/${hid}/recipes`).get(),
    db.collection(`household_meal_plan/${hid}/days`).get(), db.collection(`household_activity/${hid}/events`).get(),
  ]);
  eq('all four household_* trees are empty (pantry, recipes, meal plan, activity)', counts.map((s) => s.size), [0, 0, 0, 0]);
  eq('another household\'s data untouched', (await db.doc('household_pantry/hh_bystander/items/keep').get()).exists, true);
  eq('disbanded id is now 404 for the former member', (await api('POST', `/api/households/${hid}/leave`, mem, {})).status, 404);
  eq('former owner can create a new household', (await api('POST', '/api/households', owner, { name: 'Round two' })).status, 201);
}

// ── 10. account deletion ─────────────────────────────────────────────────────
section('10. account deletion: /api/delete-account (grace) and /api/delete-account/now');
{
  const routes = ['/api/delete-account', '/api/delete-account/now'];
  for (const r of routes) {
    const res = [];
    for (const rawToken of [undefined, 'garbage', expiredToken, 'aaaa.bbbb.cccc']) res.push((await api('POST', r, null, {}, { rawToken })).status);
    eq(`POST ${r} -> 401 (never 500) for no/garbage/expired token`, res, [401, 401, 401, 401]);
  }

  const mem = (u, role, joinedAt) => ({ uid: u.uid, displayName: u.label, email: '', role, joinedAt });
  // S1: owner deletes (grace) — co-admins listed in the WRONG order to prove handoff sorts by parsed joinedAt
  {
    const O = await newUser('del-owner'), X = await newUser('del-late'), Y = await newUser('del-early'), M = await newUser('del-mem');
    await seedHousehold('hh_del1', { ownerUid: O.uid, extraMembers: [mem(X, 'co-admin', '2026-05-01T00:00:00.000Z'), mem(Y, 'co-admin', '2026-02-01T00:00:00.000Z'), mem(M, 'member', '2026-03-01T00:00:00.000Z')], code: 'DEL1AAAA' });
    const r = await api('POST', '/api/delete-account', O, {});
    eq('owner deletes account (grace) -> 200', r.status, 200);
    const d = await hhDoc('hh_del1');
    eq('handoff to the earliest-joined co-admin', [d.createdBy === Y.uid, d.members.find((m) => m.uid === Y.uid)?.role], [true, 'owner']);
    ok('deleted owner is out of members AND memberUids (they change together)', consistent(d) && !uidsOf(d).includes(O.uid) && d.members.length === 3, JSON.stringify(uidsOf(d)));
  }
  // S2: owner, no co-admin -> soft disband (existing semantics)
  {
    const O = await newUser('sd-owner'), M = await newUser('sd-mem');
    await seedHousehold('hh_del2', { ownerUid: O.uid, extraMembers: [mem(M, 'member', '2026-03-01T00:00:00.000Z')], code: 'DEL2AAAA' });
    await api('POST', '/api/delete-account', O, {});
    const d = await hhDoc('hh_del2');
    eq('no co-admin -> soft-disbanded, members untouched', [d.disbanded, d.disbandedReason, d.members.length, consistent(d)], [true, 'owner_deleted_account', 2, true]);
    // the deleted user cancels: ownership is NOT restored (out of scope, unchanged behavior)
    await api('POST', '/api/delete-account/cancel', O, {});
    eq('cancel does not restore ownership (unchanged, out of scope)', (await hhDoc('hh_del2')).disbanded, true);
  }
  // S3: plain member deletes (grace) -> leaves both arrays
  {
    const O = await newUser('m-owner'), P = await newUser('m-member');
    await seedHousehold('hh_del3', { ownerUid: O.uid, extraMembers: [mem(P, 'member', '2026-03-01T00:00:00.000Z')], code: 'DEL3AAAA' });
    await api('POST', '/api/delete-account', P, {});
    const d = await hhDoc('hh_del3');
    ok('member removed from members AND memberUids, owner kept', consistent(d) && !uidsOf(d).includes(P.uid) && uidsOf(d).includes(O.uid), JSON.stringify(uidsOf(d)));
  }
  // S4: /now for a plain member
  {
    const O = await newUser('n-owner'), Q = await newUser('n-member');
    await seedHousehold('hh_del4', { ownerUid: O.uid, extraMembers: [mem(Q, 'member', '2026-03-01T00:00:00.000Z')], code: 'DEL4AAAA' });
    const r = await api('POST', '/api/delete-account/now', Q, {});
    eq('/now for a member -> 200', r.status, 200);
    const d = await hhDoc('hh_del4');
    ok('/now removes the deleted user from members AND memberUids of a household they only belonged to', consistent(d) && !uidsOf(d).includes(Q.uid) && uidsOf(d).includes(O.uid), JSON.stringify(uidsOf(d)));
  }
  // S5: /now empties a household -> household + all four trees deleted
  {
    const R = await newUser('e-member');
    await seedHousehold('hh_del5', { ownerUid: 'ghost-owner-not-a-member', code: 'DEL5AAAA' });
    await db.doc('households/hh_del5').update({ members: [mem(R, 'member', '2026-03-01T00:00:00.000Z')], memberUids: [R.uid] });
    await db.doc('household_pantry/hh_del5/items/i1').set({ name: 'x' });
    await db.doc('household_recipes/hh_del5/recipes/r1').set({ title: 'x' });
    await db.doc('household_meal_plan/hh_del5/days/2026-09-20').set({ dinner: null });
    await db.doc('household_activity/hh_del5/events/e1').set({ type: 'x', uid: R.uid });
    await api('POST', '/api/delete-account/now', R, {});
    ok('household left with no members is deleted', (await hhDoc('hh_del5')) === null);
    const counts = await Promise.all(['household_pantry/hh_del5/items', 'household_recipes/hh_del5/recipes', 'household_meal_plan/hh_del5/days', 'household_activity/hh_del5/events'].map((c) => db.collection(c).get()));
    eq('...and its four household_* trees are gone', counts.map((c) => c.size), [0, 0, 0, 0]);
  }
  // S6: /now for an owner with co-admins -> handoff, consistent arrays
  {
    const O = await newUser('now-owner'), X = await newUser('now-late'), Y = await newUser('now-early');
    await seedHousehold('hh_del6', { ownerUid: O.uid, extraMembers: [mem(X, 'co-admin', '2026-05-01T00:00:00.000Z'), mem(Y, 'co-admin', '2026-02-01T00:00:00.000Z')], code: 'DEL6AAAA' });
    const r = await api('POST', '/api/delete-account/now', O, {});
    eq('/now for an owner -> 200', r.status, 200);
    const d = await hhDoc('hh_del6');
    ok('handoff to earliest co-admin, arrays consistent, old owner gone', d.createdBy === Y.uid && consistent(d) && !uidsOf(d).includes(O.uid), JSON.stringify(uidsOf(d)));
    eq('deleted user\'s token no longer works (Auth user deleted)', (await api('POST', '/api/households', O, { name: 'x' })).status, 401);
  }
}

// ── 11. backfill script (Part E) ─────────────────────────────────────────────
section('11. backfillHouseholds.js: dry run changes nothing, --apply fixes, second run is a no-op');
{
  const script = fileURLToPath(new URL('./backfillHouseholds.js', import.meta.url));
  const run = (...a) => {
    const r = spawnSync('node', [script, ...a], { env: process.env, encoding: 'utf8' }); // inherits the emulator env
    const line = (r.stdout || '').split('\n').find((l) => l.startsWith('SUMMARY '));
    return { status: r.status, summary: line ? JSON.parse(line.slice(8)) : null, out: r.stdout };
  };
  const mk = (uid, role) => ({ uid, displayName: uid, email: '', role, joinedAt: '2026-01-01T00:00:00.000Z' });
  await db.doc('households/hh_bf1').set({ id: 'hh_bf1', name: 'stale', code: 'BFSTALE2', createdBy: 'o1', members: [mk('o1', 'owner'), mk('x1', 'member')], memberUids: ['o1'] });
  await db.doc('households/hh_bf2').set({ id: 'hh_bf2', name: 'missing', code: 'BFMISS22', createdBy: 'o2', members: [mk('o2', 'owner')] });
  await db.doc('households/hh_bf3').set({ id: 'hh_bf3', name: 'nocode', createdBy: 'o3', members: [mk('o3', 'owner')], memberUids: ['o3'] });
  await db.doc('household_activity/hh_bf_orphan/events/e1').set({ type: 'x', uid: 'nobody' });

  const dry = run();
  eq('dry run exits 0 and prints a summary', dry.status, 0);
  ok('dry run detects stale + missing memberUids, missing code, an orphan doc', dry.summary.memberUidsStale >= 1 && dry.summary.memberUidsMissing >= 1 && dry.summary.codeMissing >= 1 && dry.summary.orphanDocs >= 1, JSON.stringify(dry.summary));
  ok('dry run wrote nothing', JSON.stringify((await hhDoc('hh_bf1')).memberUids) === '["o1"]' && (await hhDoc('hh_bf2')).memberUids === undefined && (await hhDoc('hh_bf3')).code === undefined && (await db.doc('household_activity/hh_bf_orphan/events/e1').get()).exists);
  ok('output is counts only (no uids/codes/names)', !/o1|x1|BFSTALE2|BFMISS22|stale|nocode/.test(dry.out.replace(/memberUids stale\/mismatched|memberUids missing|code missing/g, '')), dry.out);

  const apply = run('--apply');
  eq('--apply exits 0', apply.status, 0);
  eq('memberUids recomputed from members (stale + missing)', [uidsOf(await hhDoc('hh_bf1')), uidsOf(await hhDoc('hh_bf2'))], [['o1', 'x1'], ['o2']]);
  ok('missing code generated (8 chars, unambiguous alphabet)', CODE_ALPHABET.test((await hhDoc('hh_bf3')).code || ''));
  ok('the orphaned subcollection doc was deleted', !(await db.doc('household_activity/hh_bf_orphan/events/e1').get()).exists);
  eq('existing codes were not touched', [(await hhDoc('hh_bf1')).code, (await hhDoc('hh_bf2')).code], ['BFSTALE2', 'BFMISS22']);

  const again = run('--apply');
  ok('second --apply is a no-op (idempotent)', again.summary.memberUidsStale === 0 && again.summary.memberUidsMissing === 0 && again.summary.codeMissing === 0 && again.summary.orphanDocs === 0 && again.summary.fixedMemberUids === 0 && again.summary.generatedCodes === 0, JSON.stringify(again.summary));

  // safety cap: more orphans than the cap are reported, not deleted
  for (let i = 0; i < 3; i++) await db.doc(`household_pantry/hh_bf_orph${i}/items/i`).set({ n: i });
  const capped = run('--apply', '--max-orphan-deletes=2');
  ok('orphans over --max-orphan-deletes are skipped, not deleted', capped.summary.orphansSkippedOverCap === true && (await db.doc('household_pantry/hh_bf_orph0/items/i').get()).exists, JSON.stringify(capped.summary));
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
