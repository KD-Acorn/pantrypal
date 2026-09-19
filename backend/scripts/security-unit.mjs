// Unit checks for the pure security helpers, using hostile inputs. Needs no server,
// no Firebase and no network:   node scripts/security-unit.mjs
//
// Part F (store-abbreviations/add) has no function to test: the route was deleted, and
// security-smoke.mjs asserts it now returns 404.
import { isAllowedPushEndpoint, validatePushSubscription } from '../utils/pushEndpoint.js';
import { parseMeasureAmount, splitMeasure } from '../utils/measure.js';
import { validateConfirmPayload, buildConfirmationUpdate, BARCODE_RE } from '../utils/barcode.js';
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

console.log(`\n${failures === 0 ? 'ALL UNIT CHECKS PASSED' : `${failures} UNIT CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
