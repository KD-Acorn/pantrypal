// Household write endpoints. Every mutation of a `households` document happens here (Admin SDK),
// inside a Firestore transaction: read the household, check the caller's role, write. The uid
// always comes from the verified token (req.uid), never from the request body.
//
// Firestore rules forbid client writes to `households` and `household_invites`; clients only read
// households they are a member of, and keep using the client SDK for household_pantry/_recipes/
// _meal_plan/_activity (subject to isMember(hid)).
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  HttpError, HOUSEHOLD_MAX_MEMBERS, generateCode, generateHouseholdId, normalizeJoinCode, writeMembers, getMemberRole,
  requireRole, parseHouseholdName, parseHouseholdId, parseTargetUid, parseAssignableRole, parseHouseholdPatch,
  cleanDisplayName, activityEvent, serializeHousehold, deleteHouseholdSubcollections,
} from '../utils/households.js';

const ALREADY_IN_HOUSEHOLD = 'You already belong to a household';

export function registerHouseholdRoutes(app, { adminDb, adminAuth, requireAuth, joinLimiter, writeLimiter }) {
  const households = () => adminDb.collection('households');
  const newActivityRef = (hid) => adminDb.collection('household_activity').doc(hid).collection('events').doc();

  // Turns HttpError into its status; anything else is logged and returned as a generic 500.
  const handle = (fn) => async (req, res) => {
    try {
      if (!adminDb || !adminAuth) throw new HttpError(503, 'Households temporarily unavailable');
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      console.error(`[Households] ${req.method} ${req.route?.path} failed:`, err);
      res.status(500).json({ error: 'Internal error' });
    }
  };

  // A user's display name is read server-side (users doc, then Auth record), never from the body.
  async function resolveDisplayName(uid) {
    try {
      const snap = await adminDb.collection('users').doc(uid).get();
      const fromDoc = cleanDisplayName(snap.exists ? snap.data().displayName : '');
      if (fromDoc) return fromDoc;
    } catch { /* fall through to the Auth record */ }
    try {
      return cleanDisplayName((await adminAuth.getUser(uid)).displayName);
    } catch {
      return '';
    }
  }

  async function loadActive(tx, ref) {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().disbanded === true) throw new HttpError(404, 'Household not found');
    return snap.data();
  }

  // Households (not disbanded) the user is a member of. Used for the one-household-per-user rule.
  async function activeHouseholdsOf(tx, uid) {
    const snap = await tx.get(households().where('memberUids', 'array-contains', uid));
    return snap.docs.filter((d) => d.data().disbanded !== true);
  }

  // POST /api/households  { name }
  app.post('/api/households', requireAuth, writeLimiter, handle(async (req, res) => {
    const uid = req.uid;
    const name = parseHouseholdName(req.body?.name);
    const displayName = await resolveDisplayName(uid);
    const code = await generateCode(adminDb);
    const id = generateHouseholdId();
    const member = { uid, displayName, email: '', role: 'owner', joinedAt: new Date().toISOString() };
    const data = {
      id, name, code, createdBy: uid, createdAt: Timestamp.now(),
      ...writeMembers([member]),
      settings: { sharesPantry: true, sharesRecipes: true, sharesMealPlan: true },
    };
    const ref = households().doc(id);
    await adminDb.runTransaction(async (tx) => {
      if ((await activeHouseholdsOf(tx, uid)).length) throw new HttpError(409, ALREADY_IN_HOUSEHOLD);
      tx.set(ref, data);
      tx.set(newActivityRef(id), activityEvent('member_join', uid, displayName, `${displayName || 'Owner'} created the household`, FieldValue.serverTimestamp()));
    });
    res.status(201).json(serializeHousehold(id, data));
  }));

  // POST /api/households/join  { code }
  app.post('/api/households/join', requireAuth, joinLimiter, handle(async (req, res) => {
    const uid = req.uid;
    const code = normalizeJoinCode(req.body?.code);
    const found = (await households().where('code', '==', code).get()).docs.filter((d) => d.data().disbanded !== true);
    if (!found.length) throw new HttpError(404, 'Invalid code');
    const hid = found[0].id;
    const displayName = await resolveDisplayName(uid);
    const ref = households().doc(hid);

    const updated = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const hh = snap.exists ? snap.data() : null;
      // Re-checked inside the transaction: the code may have been rotated or the household disbanded since the lookup.
      if (!hh || hh.disbanded === true || hh.code !== code) throw new HttpError(404, 'Invalid code');
      if (getMemberRole(hh, uid)) return hh; // already a member: idempotent 200
      if ((await activeHouseholdsOf(tx, uid)).some((d) => d.id !== hid)) throw new HttpError(409, ALREADY_IN_HOUSEHOLD);
      if ((hh.members || []).length >= HOUSEHOLD_MAX_MEMBERS) throw new HttpError(409, 'Household is full');
      const member = { uid, displayName, email: '', role: 'member', joinedAt: new Date().toISOString() };
      const w = writeMembers([...(hh.members || []), member]);
      tx.update(ref, w);
      tx.set(newActivityRef(hid), activityEvent('member_join', uid, displayName, `${displayName || 'A member'} joined the household`, FieldValue.serverTimestamp()));
      return { ...hh, ...w };
    });
    res.json(serializeHousehold(hid, updated));
  }));

  // POST /api/households/:hid/leave
  app.post('/api/households/:hid/leave', requireAuth, writeLimiter, handle(async (req, res) => {
    const uid = req.uid;
    const hid = parseHouseholdId(req.params.hid);
    const ref = households().doc(hid);
    await adminDb.runTransaction(async (tx) => {
      const hh = await loadActive(tx, ref);
      const role = requireRole(hh, uid, ['owner', 'co-admin', 'member']);
      if (role === 'owner') throw new HttpError(409, 'The owner must disband the household (ownership cannot be handed off)');
      const me = hh.members.find((m) => m.uid === uid);
      tx.update(ref, writeMembers(hh.members.filter((m) => m.uid !== uid)));
      tx.set(newActivityRef(hid), activityEvent('member_leave', uid, me.displayName, `${me.displayName || 'A member'} left`, FieldValue.serverTimestamp()));
    });
    res.json({ ok: true });
  }));

  // POST /api/households/:hid/members/:targetUid/role  { role: 'co-admin' | 'member' }   (owner only)
  app.post('/api/households/:hid/members/:targetUid/role', requireAuth, writeLimiter, handle(async (req, res) => {
    const uid = req.uid;
    const hid = parseHouseholdId(req.params.hid);
    const targetUid = parseTargetUid(req.params.targetUid);
    const role = parseAssignableRole(req.body?.role); // 'owner' can never be assigned
    const ref = households().doc(hid);
    const updated = await adminDb.runTransaction(async (tx) => {
      const hh = await loadActive(tx, ref);
      requireRole(hh, uid, ['owner']);
      if (targetUid === uid) throw new HttpError(409, 'You cannot change your own role');
      const targetRole = getMemberRole(hh, targetUid);
      if (!targetRole) throw new HttpError(404, 'Member not found');
      if (targetRole === 'owner') throw new HttpError(409, 'The owner\'s role cannot be changed');
      if (targetRole === role) return hh;
      const w = writeMembers(hh.members.map((m) => (m.uid === targetUid ? { ...m, role } : m)));
      tx.update(ref, w);
      return { ...hh, ...w };
    });
    res.json(serializeHousehold(hid, updated));
  }));

  // POST /api/households/:hid/members/:targetUid/remove   (owner: anyone but self; co-admin: plain members only)
  app.post('/api/households/:hid/members/:targetUid/remove', requireAuth, writeLimiter, handle(async (req, res) => {
    const uid = req.uid;
    const hid = parseHouseholdId(req.params.hid);
    const targetUid = parseTargetUid(req.params.targetUid);
    const ref = households().doc(hid);
    const updated = await adminDb.runTransaction(async (tx) => {
      const hh = await loadActive(tx, ref);
      const role = requireRole(hh, uid, ['owner', 'co-admin']);
      if (targetUid === uid) throw new HttpError(409, 'Use leave to remove yourself');
      const target = hh.members.find((m) => m.uid === targetUid);
      if (!target) throw new HttpError(404, 'Member not found');
      if (role === 'co-admin' && target.role !== 'member') throw new HttpError(403, 'Not allowed');
      if (target.role === 'owner') throw new HttpError(409, 'The owner cannot be removed');
      const w = writeMembers(hh.members.filter((m) => m.uid !== targetUid));
      tx.update(ref, w);
      // Event is about the removed member but its uid is the ACTOR (the remover), as before.
      tx.set(newActivityRef(hid), activityEvent('member_leave', uid, target.displayName, `${target.displayName || 'A member'} was removed`, FieldValue.serverTimestamp()));
      return { ...hh, ...w };
    });
    res.json(serializeHousehold(hid, updated));
  }));

  // PATCH /api/households/:hid  { name?, settings? }   (owner or co-admin)
  app.patch('/api/households/:hid', requireAuth, writeLimiter, handle(async (req, res) => {
    const uid = req.uid;
    const hid = parseHouseholdId(req.params.hid);
    const patch = parseHouseholdPatch(req.body);
    const ref = households().doc(hid);
    const updated = await adminDb.runTransaction(async (tx) => {
      const hh = await loadActive(tx, ref);
      requireRole(hh, uid, ['owner', 'co-admin']);
      const changes = {};
      if (patch.name !== undefined) changes.name = patch.name;
      if (patch.settings) changes.settings = { ...(hh.settings || {}), ...patch.settings };
      tx.update(ref, changes);
      return { ...hh, ...changes };
    });
    res.json(serializeHousehold(hid, updated));
  }));

  // POST /api/households/:hid/rotate-code   (owner or co-admin). The old code stops working immediately.
  app.post('/api/households/:hid/rotate-code', requireAuth, writeLimiter, handle(async (req, res) => {
    const uid = req.uid;
    const hid = parseHouseholdId(req.params.hid);
    const ref = households().doc(hid);
    const code = await generateCode(adminDb);
    const updated = await adminDb.runTransaction(async (tx) => {
      const hh = await loadActive(tx, ref);
      requireRole(hh, uid, ['owner', 'co-admin']);
      tx.update(ref, { code });
      return { ...hh, code };
    });
    res.json(serializeHousehold(hid, updated));
  }));

  // DELETE /api/households/:hid   (owner only). Hard delete: the household doc, then the four household_* trees.
  app.delete('/api/households/:hid', requireAuth, writeLimiter, handle(async (req, res) => {
    const uid = req.uid;
    const hid = parseHouseholdId(req.params.hid);
    const ref = households().doc(hid);
    await adminDb.runTransaction(async (tx) => {
      const hh = await loadActive(tx, ref);
      requireRole(hh, uid, ['owner']);
      tx.delete(ref); // members lose access the moment this commits
    });
    await deleteHouseholdSubcollections(adminDb, hid);
    res.json({ ok: true });
  }));
}
