// Unit checks for the pure security helpers, using hostile inputs. Needs no server,
// no Firebase and no network:   node scripts/security-unit.mjs
//
// Part F (store-abbreviations/add) has no function to test: the route was deleted, and
// security-smoke.mjs asserts it now returns 404.
import { isAllowedPushEndpoint, validatePushSubscription } from '../utils/pushEndpoint.js';
import { parseMeasureAmount, splitMeasure } from '../utils/measure.js';
import { validateConfirmPayload, buildConfirmationUpdate, BARCODE_RE } from '../utils/barcode.js';
import {
  HttpError, HOUSEHOLD_CODE_ALPHABET, HOUSEHOLD_ID_RE, randomCode, generateCode, generateHouseholdId, normalizeJoinCode, writeMembers,
  getMemberRole, requireRole, sortCoAdminsByJoinedAt, parseHouseholdName, parseHouseholdId, parseTargetUid, parseAssignableRole,
  parseHouseholdPatch, serializeHousehold, planAccountDeletion,
} from '../utils/households.js';
import { validateSupportMessages, sanitizeSupportContext, SUPPORT_SESSION_ID_RE } from '../utils/supportContext.js';

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ->  ${JSON.stringify(actual)}${ok ? '' : `   (expected ${JSON.stringify(expected)})`}`);
}
const section = (t) => console.log(`\n== ${t}`);

section('Part I: push endpoint allowlist');
for (const [url, expected] of [
  ['http://10.0.0.5/x', false],
  ['https://127.0.0.1/x', false],
  ['https://evil.example.com/x', false],
  ['https://[::1]/x', false],
  ['https://169.254.169.254/latest/meta-data', false],
  ['https://user:pass@fcm.googleapis.com/fcm/send/abc', false],
  ['https://fcm.googleapis.com@evil.example.com/x', false],
  ['https://fcm.googleapis.com.evil.example.com/x', false],
  ['https://evilfcm.googleapis.com/x', false],
  ['https://notfcm.googleapis.com.attacker.io/x', false],
  ['https://fcm.googleapis.com:8443/x', false],
  ['ftp://fcm.googleapis.com/x', false],
  ['javascript:alert(1)', false],
  ['', false],
  [undefined, false],
  [{ toString: () => 'https://fcm.googleapis.com/x' }, false],
  ['https://fcm.googleapis.com/fcm/send/abc123', true],
  ['https://updates.push.services.mozilla.com/wpush/v2/abc', true],
  ['https://foo.push.services.mozilla.com/x', true],
  ['https://wns2-par02p.notify.windows.com/w/?token=abc', true],
  ['https://web.push.apple.com/abc', true],
  ['https://x.push.apple.com/abc', true],
  ['https://notify.windows.com/x', false], // bare suffix domain is not a *.notify.windows.com host
]) check(`endpoint ${JSON.stringify(url)}`, isAllowedPushEndpoint(url), expected);

const goodKeys = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
const goodEp = 'https://fcm.googleapis.com/fcm/send/abc';
check('subscription: valid', validatePushSubscription({ endpoint: goodEp, keys: goodKeys }).ok, true);
check('subscription: missing keys', validatePushSubscription({ endpoint: goodEp }).ok, false);
check('subscription: non-string auth key', validatePushSubscription({ endpoint: goodEp, keys: { ...goodKeys, auth: 5 } }).ok, false);
check('subscription: huge p256dh', validatePushSubscription({ endpoint: goodEp, keys: { ...goodKeys, p256dh: 'B'.repeat(5000) } }).ok, false);
check('subscription: junk chars in key', validatePushSubscription({ endpoint: goodEp, keys: { ...goodKeys, auth: '<script>alert(1)</script>' } }).ok, false);
check('subscription: null', validatePushSubscription(null).ok, false);

section('Part J: measure parsing (no eval)');
for (const [raw, expected] of [
  ['1//', null], ['./2', null], ['1/2', 0.5], ['1 1/2', 1.5], ['abc', null],
  ['2', 2], ['2.5', 2.5], ['3/4', 0.75], ['1/0', null], ['1 1/0', null], ['', null],
  ['1+1', null], ['process.exit(1)', null], ['1/2/3', null], ['(1)', null], ['1e3', null], ['0x10', null],
]) check(`parseMeasureAmount(${JSON.stringify(raw)})`, parseMeasureAmount(raw), expected);
check('parseMeasureAmount(non-string)', parseMeasureAmount({ toString: () => '1' }), null);
check('splitMeasure("1 1/2 cups")', splitMeasure('1 1/2 cups'), { amount: 1.5, rawUnit: 'cups' });
check('splitMeasure("1/2 oz")', splitMeasure('1/2 oz'), { amount: 0.5, rawUnit: 'oz' });
check('splitMeasure("200g")', splitMeasure('200g'), { amount: 200, rawUnit: 'g' });
check('splitMeasure("1//") falls back to 1', splitMeasure('1//').amount, 1);
check('splitMeasure("abc")', splitMeasure('abc'), { amount: 1, rawUnit: 'abc' });

section('Part G: barcode confirm validation + one-confirm-per-uid');
const okBody = { barcode: '0048700000315', name: 'Corona (12 x 355ml)', quantity: 12, unit: 'can', itemSize: '355ml', uid: 'attacker-supplied' };
check('valid payload accepted, body uid dropped', (() => { const r = validateConfirmPayload(okBody); return [r.ok, 'uid' in r.value]; })(), [true, false]);
for (const [label, mut] of Object.entries({
  'barcode path traversal': { barcode: '../x' }, 'barcode too short': { barcode: '12345' }, 'barcode too long': { barcode: '1'.repeat(15) },
  'barcode as number': { barcode: 4870000031 }, 'name too long': { name: 'x'.repeat(101) }, 'quantity as string': { quantity: '12' },
  'quantity negative': { quantity: -1 }, 'quantity NaN': { quantity: NaN }, 'unit is object': { unit: {} },
})) check(`rejects ${label}`, validateConfirmPayload({ ...okBody, ...mut }).ok, false);
const val = validateConfirmPayload(okBody).value;
check('new doc: count 1, confirmedBy [A]', (() => { const d = buildConfirmationUpdate(null, 'A', val, 'TS'); return [d.confirmCount, d.confirmedBy]; })(), [1, ['A']]);
check('same uid again is a no-op (null)', buildConfirmationUpdate({ confirmCount: 1, confirmedBy: ['A'] }, 'A', val, 'TS'), null);
check('second distinct uid -> count 2', (() => { const d = buildConfirmationUpdate({ confirmCount: 1, confirmedBy: ['A'] }, 'B', val, 'TS'); return [d.confirmCount, d.confirmedBy]; })(), [2, ['A', 'B']]);
check('legacy string confirmedBy: same uid is a no-op', buildConfirmationUpdate({ confirmCount: 3, confirmedBy: 'A' }, 'A', val, 'TS'), null);
check('legacy string confirmedBy: new uid upgrades to array', (() => { const d = buildConfirmationUpdate({ confirmCount: 3, confirmedBy: 'A' }, 'B', val, 'TS'); return [d.confirmCount, d.confirmedBy]; })(), [4, ['A', 'B']]);
check('one uid confirming 20x writes once', (() => { let doc = null, writes = 0; for (let i = 0; i < 20; i++) { const u = buildConfirmationUpdate(doc, 'A', val, 'TS'); if (u) { doc = u; writes++; } } return [writes, doc.confirmCount]; })(), [1, 1]);
check('BARCODE_RE', ['012345678905', '0123 45', '12345678901234\n', '1234567890123456'].map((s) => BARCODE_RE.test(s)), [true, false, false, false]);

section('Part E: support chat input');
const NUL = String.fromCharCode(0);
check('valid messages, control chars stripped', validateSupportMessages([{ role: 'user', content: `hi${NUL} there\n` }]).messages[0].content, 'hi there\n');
check('rejects role "system"', validateSupportMessages([{ role: 'system', content: 'x' }]).ok, false);
check('rejects 4001-char content', validateSupportMessages([{ role: 'user', content: 'x'.repeat(4001) }]).ok, false);
check('rejects 31 messages', validateSupportMessages(Array(31).fill({ role: 'user', content: 'x' })).ok, false);
check('accepts 30 messages', validateSupportMessages(Array(30).fill({ role: 'user', content: 'x' })).ok, true);
check('rejects non-array', validateSupportMessages('nope').ok, false);
check('rejects non-string content', validateSupportMessages([{ role: 'user', content: { a: 1 } }]).ok, false);
check('sessionId accepts client format', SUPPORT_SESSION_ID_RE.test('support_abcDEF123456789012345678901_1789859202693'), true);
check('sessionId rejects short / spaces / path chars / 65 chars', ['short', 'has space here', '../../etc/passwd', 'x'.repeat(65)].map((s) => SUPPORT_SESSION_ID_RE.test(s)), [false, false, false, false]);
const ctx = sanitizeSupportContext({
  uid: 'victim', evil: 'x', currentTab: 'pantry', pantryItemCount: 4, deviceInfo: { browser: 'Chrome', extra: 1 },
  recentErrors: [{ message: 'm', stack: 's'.repeat(900), lineno: 3, junk: 1 }, 'str', 5],
  recentLogs: Array(30).fill({ level: 'log', message: 'hi' }),
});
check('context: only whitelisted keys, no uid', Object.keys(ctx), ['currentTab', 'pantryItemCount', 'displayName', 'domain', 'appVersion', 'recentLogs', 'recentErrors', 'deviceInfo']);
check('context: arrays capped at 20, strings at 500, unknown entry keys dropped', [ctx.recentLogs.length, ctx.recentErrors[0].stack.length, 'junk' in ctx.recentErrors[0], ctx.recentErrors.length], [20, 500, false, 2]);

section('Part A (6.3): household helpers');
const throwsStatus = (fn) => { try { fn(); return 'no throw'; } catch (e) { return e instanceof HttpError ? e.status : `other:${e.message}`; } };
check('alphabet has no 0 O 1 I L and 31 chars', [/[0O1IL]/.test(HOUSEHOLD_CODE_ALPHABET), HOUSEHOLD_CODE_ALPHABET.length], [false, 31]);
check('randomCode: 8 chars, all from alphabet (2000 samples)', Array.from({ length: 2000 }, () => randomCode()).every((c) => c.length === 8 && [...c].every((ch) => HOUSEHOLD_CODE_ALPHABET.includes(ch))), true);
check('generateHouseholdId matches ^hh_[A-Za-z0-9_]+$', HOUSEHOLD_ID_RE.test(generateHouseholdId()), true);
{ // generateCode retries until no household has the code
  let calls = 0;
  const fakeDb = { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: ++calls > 3 }) }) }) }) };
  check('generateCode retries on collision then succeeds', [(await generateCode(fakeDb)).length, calls], [8, 4]);
  const alwaysTaken = { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: false }) }) }) }) };
  check('generateCode gives up after 10 collisions', await generateCode(alwaysTaken).then(() => 'resolved', (e) => e.message), 'could not generate a unique household code');
}
check('normalizeJoinCode: case-insensitive 6 and 8 char', [normalizeJoinCode(' abc234 '), normalizeJoinCode('abcd2345')], ['ABC234', 'ABCD2345']);
check('normalizeJoinCode: wrong length / symbols -> 404 Invalid code', ['ABC', 'ABCDEFG', 'AB-CD2345', '', 'ABC234\n9'].map((c) => throwsStatus(() => normalizeJoinCode(c))), [404, 404, 404, 404, 404]);
check('normalizeJoinCode: non-string -> 400', [undefined, 5, {}].map((c) => throwsStatus(() => normalizeJoinCode(c))), [400, 400, 400]);
{ // writeMembers derives memberUids, dedupes, rejects bad members
  const w = writeMembers([{ uid: 'a', role: 'owner' }, { uid: 'b', role: 'member' }, { uid: 'a', role: 'member' }]);
  check('writeMembers derives memberUids and dedupes by uid', [w.memberUids, w.members.length, w.members[0].role], [['a', 'b'], 2, 'owner']);
  check('writeMembers([]) is valid (empty)', writeMembers([]), { members: [], memberUids: [] });
  check('writeMembers rejects a member without uid', [() => writeMembers([{ role: 'x' }]), () => writeMembers('no')].map((f) => { try { f(); return 'ok'; } catch { return 'threw'; } }), ['threw', 'threw']);
}
{
  const hh = { members: [{ uid: 'o', role: 'owner' }, { uid: 'c', role: 'co-admin' }, { uid: 'm', role: 'member' }] };
  check('getMemberRole', ['o', 'c', 'm', 'x'].map((u) => getMemberRole(hh, u)), ['owner', 'co-admin', 'member', null]);
  check('requireRole: non-member -> 404 (never 403)', throwsStatus(() => requireRole(hh, 'x', ['owner'])), 404);
  check('requireRole: wrong role -> 403', throwsStatus(() => requireRole(hh, 'm', ['owner', 'co-admin'])), 403);
  check('requireRole: allowed role returns it', requireRole(hh, 'c', ['owner', 'co-admin']), 'co-admin');
}
check('sortCoAdminsByJoinedAt uses parsed ISO dates, not array order', sortCoAdminsByJoinedAt([
  { uid: 'o', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' },
  { uid: 'late', role: 'co-admin', joinedAt: '2026-05-01T00:00:00.000Z' },
  { uid: 'early', role: 'co-admin', joinedAt: '2026-02-01T00:00:00.000Z' },
  { uid: 'junk', role: 'co-admin', joinedAt: 'not a date' },
  { uid: 'm', role: 'member', joinedAt: '2026-01-02T00:00:00.000Z' },
]).map((m) => m.uid), ['early', 'late', 'junk']);
check('parseHouseholdName trims / strips control chars', parseHouseholdName('  Smith ' + String.fromCharCode(7) + 'Family  '), 'Smith Family');
check('parseHouseholdName rejects empty / whitespace / 61 chars / non-string', ['', '   ', 'x'.repeat(61), 5, null].map((v) => throwsStatus(() => parseHouseholdName(v))), [400, 400, 400, 400, 400]);
check('parseHouseholdName accepts exactly 60', parseHouseholdName('x'.repeat(60)).length, 60);
check('parseHouseholdId', [throwsStatus(() => parseHouseholdId('hh_1758_abc')), throwsStatus(() => parseHouseholdId('../x')), throwsStatus(() => parseHouseholdId('hh_')), throwsStatus(() => parseHouseholdId('hh_a b')), throwsStatus(() => parseHouseholdId(7))], ['no throw', 400, 400, 400, 400]);
check('parseTargetUid', [throwsStatus(() => parseTargetUid('abc123')), throwsStatus(() => parseTargetUid('')), throwsStatus(() => parseTargetUid('a/b')), throwsStatus(() => parseTargetUid('a b')), throwsStatus(() => parseTargetUid('x'.repeat(129)))], ['no throw', 400, 400, 400, 400]);
check('parseAssignableRole: co-admin/member ok; owner/admin/undefined -> 400', [parseAssignableRole('co-admin'), parseAssignableRole('member'), throwsStatus(() => parseAssignableRole('owner')), throwsStatus(() => parseAssignableRole('admin')), throwsStatus(() => parseAssignableRole(undefined))], ['co-admin', 'member', 400, 400, 400]);
check('parseHouseholdPatch: name + settings ok', parseHouseholdPatch({ name: ' New ', settings: { sharesPantry: false } }), { name: 'New', settings: { sharesPantry: false } });
for (const k of ['members', 'memberUids', 'code', 'createdBy', 'disbanded', 'createdAt', 'id']) {
  check(`parseHouseholdPatch rejects ${k}`, throwsStatus(() => parseHouseholdPatch({ name: 'x', [k]: k === 'members' ? [] : 'x' })), 400);
}
check('parseHouseholdPatch rejects unknown/non-boolean settings, empty, non-object', [
  { settings: { evil: true } }, { settings: { sharesPantry: 'yes' } }, { settings: {} }, {}, null, [], { settings: [] },
].map((b) => throwsStatus(() => parseHouseholdPatch(b))), [400, 400, 400, 400, 400, 400, 400]);
check('parseHouseholdPatch: __proto__ key cannot smuggle fields', throwsStatus(() => parseHouseholdPatch(JSON.parse('{"__proto__":{"members":[]},"name":"x"}'))), 400);
check('serializeHousehold keeps only client-visible fields', Object.keys(serializeHousehold('hh_1', { name: 'n', code: 'C', createdBy: 'u', createdAt: { toDate: () => new Date(0) }, members: [{ uid: 'u', role: 'owner', joinedAt: 'x', extra: 1 }], memberUids: ['u'], settings: {}, disbanded: false, secret: 1 })), ['id', 'name', 'code', 'createdBy', 'createdAt', 'members', 'memberUids', 'settings']);

section('Part C (6.3): planAccountDeletion');
{
  const mk = (uid, role, joinedAt) => ({ uid, displayName: uid, email: '', role, joinedAt });
  const hh = {
    createdBy: 'own',
    members: [mk('own', 'owner', '2026-01-01T00:00:00.000Z'), mk('late', 'co-admin', '2026-05-01T00:00:00.000Z'), mk('early', 'co-admin', '2026-02-01T00:00:00.000Z'), mk('mem', 'member', '2026-03-01T00:00:00.000Z')],
    memberUids: ['own', 'late', 'early', 'mem'],
  };
  const h = planAccountDeletion(hh, 'own', 'NOW');
  check('owner + co-admins -> handoff to the EARLIEST joinedAt (not array order)', [h.action, h.update.createdBy], ['handoff', 'early']);
  check('handoff: new owner has role owner, deleted owner gone from members AND memberUids together', [h.update.members.find((m) => m.uid === 'early').role, h.update.members.map((m) => m.uid), h.update.memberUids], ['owner', ['late', 'early', 'mem'], ['late', 'early', 'mem']]);
  const d = planAccountDeletion({ createdBy: 'own', members: [mk('own', 'owner', 'x'), mk('mem', 'member', 'y')], memberUids: ['own', 'mem'] }, 'own', 'NOW');
  check('owner, no co-admin -> soft disband (members untouched)', [d.action, d.update.disbanded, d.update.disbandedReason, d.update.disbandedAt, 'members' in d.update], ['disband', true, 'owner_deleted_account', 'NOW', false]);
  check('already-disbanded owned household -> none', planAccountDeletion({ createdBy: 'own', disbanded: true, members: [mk('own', 'owner', 'x')], memberUids: ['own'] }, 'own', 'NOW').action, 'none');
  const r = planAccountDeletion(hh, 'mem', 'NOW');
  check('plain member -> remove from members AND memberUids together', [r.action, r.update.members.map((m) => m.uid), r.update.memberUids, r.empty], ['remove', ['own', 'late', 'early'], ['own', 'late', 'early'], false]);
  const r2 = planAccountDeletion({ createdBy: 'ghost', members: [mk('solo', 'member', 'x')], memberUids: ['solo'] }, 'solo', 'NOW');
  check('last non-owner member leaving -> remove with empty:true', [r2.action, r2.empty, r2.update.memberUids], ['remove', true, []]);
  check('user who is not in the household -> none', planAccountDeletion(hh, 'stranger', 'NOW').action, 'none');
  check('stale uid only in memberUids (not in members) is still cleaned', (() => { const p = planAccountDeletion({ createdBy: 'o', members: [mk('o', 'owner', 'x')], memberUids: ['o', 'stale'] }, 'stale', 'NOW'); return [p.action, p.update.memberUids]; })(), ['remove', ['o']]);
}

console.log(`\n${failures === 0 ? 'ALL UNIT CHECKS PASSED' : `${failures} UNIT CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
