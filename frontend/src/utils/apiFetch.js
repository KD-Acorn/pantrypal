import { auth } from '../firebase';

// fetch() for the authenticated API routes: attaches `Authorization: Bearer <Firebase ID token>`.
// Returns the Response like fetch() does, so call sites keep their existing `resp.ok` handling.
// On 401 the token is force-refreshed and the request retried once; if it still fails (or there
// is no signed-in user) the caller gets a 401 Response and the user sees a sign-in-again notice.
// A 429 (rate limit) gets a short notice too. Notices are shown by AppContent as a toast.

const SIGN_IN_AGAIN = 'Your session has expired. Please sign in again.';
const SLOW_DOWN = "You're going a little fast — please wait a moment and try again.";

// Deferred a tick because the toast has a single slot: call sites show their own generic
// failure toast right after a non-ok response, and this one should be the one left on screen.
function notify(message) {
  setTimeout(() => window.dispatchEvent(new CustomEvent('mpc:api-notice', { detail: { message } })), 100);
}

function unauthenticatedResponse() {
  return new Response(JSON.stringify({ error: 'Missing or invalid auth token' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function attempt(url, options, forceRefresh) {
  const user = auth.currentUser;
  if (!user) return unauthenticatedResponse();
  let token;
  try {
    token = await user.getIdToken(forceRefresh);
  } catch (err) {
    if (err?.code === 'auth/network-request-failed') throw err; // offline: behaves like a failed fetch
    return unauthenticatedResponse();
  }
  return fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
}

export async function apiFetch(url, options = {}) {
  let resp = await attempt(url, options, false);
  if (resp.status === 401) resp = await attempt(url, options, true);
  if (resp.status === 401) notify(SIGN_IN_AGAIN);
  else if (resp.status === 429) notify(SLOW_DOWN);
  return resp;
}
