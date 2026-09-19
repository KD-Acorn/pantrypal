// Web Push endpoint allowlist. The server POSTs to whatever endpoint a client
// registers, so an unchecked endpoint is an SSRF primitive. Only the real browser
// push services are accepted: https, no credentials, no IP literals, allowlisted host.
import { isIP } from 'node:net';

const ALLOWED_HOSTS = new Set([
  'fcm.googleapis.com',               // Chrome / Edge / Android (FCM)
  'updates.push.services.mozilla.com', // Firefox
  'web.push.apple.com',               // Safari
]);
// Wildcard hosts: `*.push.services.mozilla.com`, `*.notify.windows.com`, `*.push.apple.com`
const ALLOWED_HOST_SUFFIXES = ['.push.services.mozilla.com', '.notify.windows.com', '.push.apple.com'];

const MAX_ENDPOINT_LENGTH = 2048;
const KEY_CHARS = /^[A-Za-z0-9_\-+/]+={0,2}$/;

export function isAllowedPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) return false;
  let url;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  const host = url.hostname.toLowerCase();
  if (host.startsWith('[') || isIP(host) !== 0) return false; // IPv6 / IPv4 literal
  if (ALLOWED_HOSTS.has(host)) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.length > suffix.length && host.endsWith(suffix));
}

// p256dh is a 65-byte P-256 point (~87 base64url chars); auth is 16 bytes (~22 chars).
// The bounds are deliberately loose — this only rejects junk, not unusual-but-valid keys.
function isSaneKey(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max && KEY_CHARS.test(value);
}

// Returns { ok: true } or { ok: false, error } for a PushSubscription-shaped object
// ({ endpoint, keys: { p256dh, auth } }), as sent by the client or read back from Firestore.
export function validatePushSubscription(sub) {
  if (!sub || typeof sub !== 'object') return { ok: false, error: 'Valid subscription object is required' };
  if (!isAllowedPushEndpoint(sub.endpoint)) return { ok: false, error: 'Unsupported push endpoint' };
  const keys = sub.keys;
  if (!keys || typeof keys !== 'object' || !isSaneKey(keys.p256dh, 40, 200) || !isSaneKey(keys.auth, 10, 100)) {
    return { ok: false, error: 'Invalid subscription keys' };
  }
  return { ok: true };
}
