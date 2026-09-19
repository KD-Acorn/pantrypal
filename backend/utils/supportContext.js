// Validation/whitelisting for POST /api/support/chat input. The client is untrusted:
// everything here is capped and unknown fields are dropped before anything reaches
// the model prompt or Firestore.
import { cleanString, stripControlChars } from './sanitize.js';

// Client builds `support_<uid>_<Date.now()>`; this also admits the 'anon' fallback.
export const SUPPORT_SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export const SUPPORT_LIMITS = {
  maxMessages: 30,
  maxContentChars: 4000,
  maxStringChars: 500,
  maxArrayEntries: 20,
};

const ENTRY_STRING_KEYS = ['level', 'message', 'source', 'stack', 'timestamp'];
const ENTRY_NUMBER_KEYS = ['lineno', 'colno'];

// messages: array of at most 30 { role: 'user'|'assistant', content: string (1-4000 chars) }.
// Returns { ok: true, messages } (normalized to role/content, plus the client's optional
// timestamp, which the admin transcript view displays) or { ok: false, error }.
export function validateSupportMessages(messages) {
  const { maxMessages, maxContentChars } = SUPPORT_LIMITS;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: 'messages must be a non-empty array' };
  }
  if (messages.length > maxMessages) {
    return { ok: false, error: `messages may contain at most ${maxMessages} items` };
  }
  const out = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object' || (m.role !== 'user' && m.role !== 'assistant')) {
      return { ok: false, error: 'each message needs role "user" or "assistant"' };
    }
    if (typeof m.content !== 'string' || m.content.length === 0 || m.content.length > maxContentChars) {
      return { ok: false, error: `each message content must be a string of 1-${maxContentChars} characters` };
    }
    const clean = { role: m.role, content: stripControlChars(m.content, { keepWhitespace: true }) };
    const ts = cleanString(m.timestamp, 40);
    if (ts) clean.timestamp = ts;
    out.push(clean);
  }
  return { ok: true, messages: out };
}

function cleanEntries(value) {
  if (!Array.isArray(value)) return [];
  const { maxArrayEntries, maxStringChars } = SUPPORT_LIMITS;
  const out = [];
  for (const e of value.slice(-maxArrayEntries)) {
    if (typeof e === 'string') {
      out.push(cleanString(e, maxStringChars));
    } else if (e && typeof e === 'object' && !Array.isArray(e)) {
      const entry = {};
      for (const k of ENTRY_STRING_KEYS) {
        if (typeof e[k] === 'string') entry[k] = cleanString(e[k], maxStringChars);
      }
      for (const k of ENTRY_NUMBER_KEYS) {
        if (Number.isFinite(e[k])) entry[k] = e[k];
      }
      if (Object.keys(entry).length) out.push(entry);
    }
  }
  return out;
}

// Only the fields the app actually sends survive; strings capped at 500 chars, arrays at 20.
// `context.uid` is deliberately NOT carried over — callers must use req.uid.
export function sanitizeSupportContext(context) {
  const c = context && typeof context === 'object' && !Array.isArray(context) ? context : {};
  const di = c.deviceInfo && typeof c.deviceInfo === 'object' && !Array.isArray(c.deviceInfo) ? c.deviceInfo : {};
  const { maxStringChars } = SUPPORT_LIMITS;
  return {
    currentTab: cleanString(c.currentTab, maxStringChars),
    pantryItemCount: Number.isFinite(c.pantryItemCount) ? Math.min(Math.max(Math.trunc(c.pantryItemCount), 0), 100000) : 0,
    displayName: cleanString(c.displayName, maxStringChars),
    domain: cleanString(c.domain, maxStringChars),
    appVersion: cleanString(c.appVersion, maxStringChars),
    recentLogs: cleanEntries(c.recentLogs),
    recentErrors: cleanEntries(c.recentErrors),
    deviceInfo: {
      browser: cleanString(di.browser, maxStringChars),
      os: cleanString(di.os, maxStringChars),
      deviceType: cleanString(di.deviceType, maxStringChars),
    },
  };
}
