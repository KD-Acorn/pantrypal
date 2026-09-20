// Household helpers shared by the /api/households routes and the account-deletion routes.
// Everything that mutates a household document must go through these so that `members`
// and `memberUids` can never drift apart (the Firestore read rule depends on memberUids).
import { randomInt, randomBytes } from 'node:crypto';
import { stripControlChars } from './sanitize.js';

export const HOUSEHOLD_MAX_MEMBERS = 20;
// No 0 O 1 I L. Existing 6-char codes (generated before this change, alphabet still had L) keep working.
export const HOUSEHOLD_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const HOUSEHOLD_CODE_LENGTH = 8;
export const HOUSEHOLD_ID_RE = /^hh_[A-Za-z0-9_]+$/;
export const ASSIGNABLE_ROLES = ['co-admin', 'member'];
export const SETTINGS_KEYS = ['sharesPantry', 'sharesRecipes', 'sharesMealPlan'];
const NAME_MAX = 60;

// Thrown anywhere in a route (including inside a Firestore transaction callback) to end the
// request with a specific status and a client-safe message.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ── ids and codes ────────────────────────────────────────────────────────────

export function generateHouseholdId() {
  return `hh_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

export function randomCode(rng = randomInt) {
  let code = '';
  for (let i = 0; i < HOUSEHOLD_CODE_LENGTH; i++) code += HOUSEHOLD_CODE_ALPHABET[rng(HOUSEHOLD_CODE_ALPHABET.length)];
  return code;
}

// 8 chars from the unambiguous alphabet, retried until no existing household has the code.
export async function generateCode(db, { attempts = 10, rng = randomInt } = {}) {
  for (let i = 0; i < attempts; i++) {
    const code = randomCode(rng);
    const clash = await db.collection('households').where('code', '==', code).limit(1).get();
    if (clash.empty) return code;
  }
  throw new Error('could not generate a unique household code');
}

// Join codes are 6 chars (legacy) or 8 (current), case-insensitive. Anything else can never
// match a household, so it gets the same generic 404 as a wrong code.
export function normalizeJoinCode(input) {
  if (typeof input !== 'string') throw new HttpError(400, 'code is required');
  const code = input.trim().toUpperCase();
  if (!/^(?:[A-Z0-9]{6}|[A-Z0-9]{8})$/.test(code)) throw new HttpError(404, 'Invalid code');
  return code;
}

// ── members ──────────────────────────────────────────────────────────────────

// The ONLY place that produces the { members, memberUids } pair. memberUids is always
// derived from members (first entry wins if a uid is duplicated) and never set separately.
export function writeMembers(members) {
  if (!Array.isArray(members)) throw new TypeError('members must be an array');
  const seen = new Set();
  const clean = [];
  for (const m of members) {
    if (!m || typeof m.uid !== 'string' || !m.uid) throw new TypeError('every member needs a uid');
    if (seen.has(m.uid)) continue;
    seen.add(m.uid);
    clean.push(m);
  }
  return { members: clean, memberUids: clean.map((m) => m.uid) };
}

export function getMemberRole(hh, uid) {
  const m = Array.isArray(hh?.members) ? hh.members.find((x) => x && x.uid === uid) : null;
  return m ? m.role : null;
}

// Returns the caller's role, or throws: 404 if they are not a member (so a non-member cannot
// tell whether a household id exists), 403 if they are a member without one of `roles`.
export function requireRole(hh, uid, roles) {
  const role = getMemberRole(hh, uid);
  if (!role) throw new HttpError(404, 'Household not found');
  if (!roles.includes(role)) throw new HttpError(403, 'Not allowed');
  return role;
}

function joinedAtMs(joinedAt) {
  if (typeof joinedAt === 'string') { const t = Date.parse(joinedAt); return Number.isNaN(t) ? Infinity : t; }
  if (joinedAt && typeof joinedAt.toDate === 'function') return joinedAt.toDate().getTime();
  if (typeof joinedAt === 'number') return joinedAt;
  return Infinity;
}

// Co-admins ordered by earliest joinedAt (ISO strings are what the app writes; Firestore
// Timestamps are tolerated). Unparseable dates sort last; ties keep array order.
export function sortCoAdminsByJoinedAt(members) {
  return members
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m && m.role === 'co-admin')
    .sort((a, b) => (joinedAtMs(a.m.joinedAt) - joinedAtMs(b.m.joinedAt)) || (a.i - b.i))
    .map(({ m }) => m);
}

// ── input validation (each throws HttpError(400) on bad input) ───────────────

export function parseHouseholdName(value) {
  const name = typeof value === 'string' ? stripControlChars(value).trim() : '';
  if (name.length < 1 || name.length > NAME_MAX) throw new HttpError(400, `name must be 1-${NAME_MAX} characters`);
  return name;
}

export function parseHouseholdId(value) {
  if (typeof value !== 'string' || value.length > 100 || !HOUSEHOLD_ID_RE.test(value)) {
    throw new HttpError(400, 'invalid household id');
  }
  return value;
}

export function parseTargetUid(value) {
  if (typeof value !== 'string' || !/^[^\s/]{1,128}$/.test(value)) throw new HttpError(400, 'invalid member id');
  return value;
}

export function parseAssignableRole(value) {
  if (!ASSIGNABLE_ROLES.includes(value)) throw new HttpError(400, `role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`);
  return value;
}

// Display names come from the Auth record / users doc, never the request; this just makes
// whatever we read safe to store.
export function cleanDisplayName(value) {
  return typeof value === 'string' ? stripControlChars(value).trim().slice(0, NAME_MAX) : '';
}

// PATCH /api/households/:hid body. Only `name` and `settings.{sharesPantry,sharesRecipes,sharesMealPlan}`
// (booleans) are accepted; ANY other key (members, memberUids, code, createdBy, disbanded, ...) is a 400.
export function parseHouseholdPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'body must be an object');
  const extra = Object.keys(body).filter((k) => k !== 'name' && k !== 'settings');
  if (extra.length) throw new HttpError(400, 'only name and settings can be changed');
  const patch = {};
  if ('name' in body) patch.name = parseHouseholdName(body.name);
  if ('settings' in body) {
    const s = body.settings;
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new HttpError(400, 'settings must be an object');
    const settings = {};
    for (const [k, v] of Object.entries(s)) {
      if (!SETTINGS_KEYS.includes(k) || typeof v !== 'boolean') throw new HttpError(400, 'invalid settings');
      settings[k] = v;
    }
    if (!Object.keys(settings).length) throw new HttpError(400, 'settings must not be empty');
    patch.settings = settings;
  }
  if (!Object.keys(patch).length) throw new HttpError(400, 'nothing to update');
  return patch;
}

// ── documents ────────────────────────────────────────────────────────────────

// household_activity event, same shape the client wrote. `uid` is the ACTOR (the remover for
// a removal); `displayName` is whoever the event is about. `now` is the timestamp value to stamp.
export function activityEvent(type, uid, displayName, description, now) {
  return { type, uid, displayName: displayName || '', description, timestamp: now };
}

function isoOrNull(ts) {
  if (ts && typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return typeof ts === 'string' ? ts : null;
}

// Client-facing household. No fields that aren't already visible to members.
export function serializeHousehold(id, data) {
  return {
    id,
    name: data.name,
    code: data.code,
    createdBy: data.createdBy,
    createdAt: isoOrNull(data.createdAt),
    members: (data.members || []).map((m) => ({
      uid: m.uid, displayName: m.displayName || '', email: m.email || '', role: m.role, joinedAt: isoOrNull(m.joinedAt),
    })),
    memberUids: data.memberUids || [],
    settings: data.settings || { sharesPantry: true, sharesRecipes: true, sharesMealPlan: true },
  };
}

// ── cleanup ──────────────────────────────────────────────────────────────────

export const HOUSEHOLD_SUBCOLLECTION_ROOTS = ['household_pantry', 'household_recipes', 'household_meal_plan', 'household_activity'];

// Recursively deletes the four household_* trees for one household id (Admin SDK recursiveDelete).
// Does NOT delete the households/{hid} doc itself; callers do that (usually first, in a transaction,
// so access ends immediately) and then call this.
export async function deleteHouseholdSubcollections(db, hid) {
  await Promise.all(HOUSEHOLD_SUBCOLLECTION_ROOTS.map((root) => db.recursiveDelete(db.collection(root).doc(hid))));
}

// ── account deletion ─────────────────────────────────────────────────────────

// What deleting `uid`'s account does to one household document (pure; no I/O).
//  owner + a co-admin exists  -> 'handoff': earliest-joined co-admin (parsed joinedAt) becomes owner/createdBy,
//                                the deleted user leaves members AND memberUids together
//  owner, no co-admin         -> 'disband': soft-disband flags, as before (members left as they were)
//  anyone else in members     -> 'remove': leave members AND memberUids together; `empty` if nobody is left
//  already disbanded owner / not a member at all -> 'none'
export function planAccountDeletion(hh, uid, now) {
  const members = Array.isArray(hh.members) ? hh.members : [];
  const isOwner = hh.createdBy === uid || getMemberRole(hh, uid) === 'owner';
  if (isOwner) {
    if (hh.disbanded === true) return { action: 'none' };
    const others = members.filter((m) => m.uid !== uid);
    const next = sortCoAdminsByJoinedAt(others)[0];
    if (next) {
      const remaining = others.map((m) => (m.uid === next.uid ? { ...m, role: 'owner' } : m));
      return { action: 'handoff', update: { createdBy: next.uid, ...writeMembers(remaining) }, empty: false };
    }
    return { action: 'disband', update: { disbanded: true, disbandedAt: now, disbandedReason: 'owner_deleted_account' }, empty: false };
  }
  const isMember = members.some((m) => m.uid === uid) || (Array.isArray(hh.memberUids) && hh.memberUids.includes(uid));
  if (!isMember) return { action: 'none' };
  const remaining = members.filter((m) => m.uid !== uid);
  return { action: 'remove', update: writeMembers(remaining), empty: remaining.length === 0 };
}

// Applies planAccountDeletion to every household the user owns or belongs to. Membership is found with
// where('memberUids','array-contains',uid) (plus createdBy == uid), not a full-collection scan.
// deleteEmpty: a household left with no members is deleted together with its four household_* trees.
export async function applyAccountDeletion(db, uid, { deleteEmpty = false, now } = {}) {
  const col = db.collection('households');
  const [owned, member] = await Promise.all([col.where('createdBy', '==', uid).get(), col.where('memberUids', 'array-contains', uid).get()]);
  const ids = [...new Set([...owned.docs, ...member.docs].map((d) => d.id))];
  const counts = { handoff: 0, disband: 0, remove: 0, deleted: 0 };
  for (const hid of ids) {
    const ref = col.doc(hid);
    const plan = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { action: 'none' };
      const p = planAccountDeletion(snap.data(), uid, now);
      if (p.action === 'none') return p;
      if (deleteEmpty && p.empty) { tx.delete(ref); return { ...p, deleted: true }; }
      tx.update(ref, p.update);
      return p;
    });
    if (plan.action !== 'none') counts[plan.action]++;
    if (plan.deleted) { await deleteHouseholdSubcollections(db, hid); counts.deleted++; }
  }
  return counts;
}
