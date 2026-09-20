import { useState, useCallback, useEffect, useRef } from 'react';
import { collection, doc, setDoc, getDocs, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { apiFetch } from '../utils/apiFetch';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3003';

// Every change to a household document goes through the backend: Firestore rules forbid client
// writes to `households` (and `household_invites`), and roles/codes/membership are enforced server-side.
// Reads (the live listener below) and the shared pantry/recipes/meal plan/activity stay on the client SDK.
async function householdApi(method, path, body) {
  const resp = await apiFetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await resp.json(); } catch { /* empty body */ }
  if (!resp.ok) {
    if (resp.status === 401) throw new Error('Please sign in again.');
    if (resp.status === 429) throw new Error('Too many attempts. Please wait a moment and try again.');
    throw new Error(data?.error || 'Something went wrong. Please try again.');
  }
  return data;
}

const seg = encodeURIComponent;

export default function useHousehold(uid) {
  const [household, setHousehold] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const householdRef = useRef(null);

  useEffect(() => {
    if (!uid) { setHousehold(null); setLoading(false); return; }
    setLoading(true);

    const q = query(collection(db, 'households'), where('memberUids', 'array-contains', uid));
    const unsub = onSnapshot(q, (snap) => {
      // A soft-disbanded household (owner deleted their account) is hidden, not shown as a zombie.
      const active = snap.docs.find(d => d.data().disbanded !== true);
      setHousehold(active ? { id: active.id, ...active.data() } : null);
      setLoading(false);
    }, (err) => {
      console.error('[Household] onSnapshot error:', err);
      setError(err.message);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  useEffect(() => { householdRef.current = household; }, [household]);

  // Used by the shared pantry / recipes / meal plan hooks. Create/join/leave/remove events are written
  // by the server now; rules require uid == the signed-in user on every event a client creates.
  const logActivity = useCallback(async (householdId, type, description, displayName) => {
    if (!householdId || !uid) return;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await setDoc(doc(db, 'household_activity', householdId, 'events', id), {
      type, uid, displayName: displayName || '', description,
      timestamp: serverTimestamp(),
    }).catch(err => console.error('[Household] logActivity error:', err));
  }, [uid]);

  // The server derives the owner's display name itself; the second argument is accepted for
  // compatibility with existing callers and ignored.
  const createHousehold = useCallback(async (name) => {
    if (!uid) return null;
    const hh = await householdApi('POST', '/api/households', { name });
    return { id: hh.id, code: hh.code };
  }, [uid]);

  // Joining a household you are already in is a no-op success (server-side idempotent).
  const joinByCode = useCallback(async (code) => {
    if (!uid) return null;
    const hh = await householdApi('POST', '/api/households/join', { code });
    return hh.id;
  }, [uid]);

  // Email invites are switched off: `household_invites` is server-only in firestore.rules and nothing
  // consumes it. Building real invites is post-launch item #33.
  const inviteByEmail = useCallback(async () => {
    throw new Error('Email invites are not available yet');
  }, []);

  const leaveHousehold = useCallback(async (householdId) => {
    if (!uid) return;
    await householdApi('POST', `/api/households/${seg(householdId)}/leave`, {});
  }, [uid]);

  const removeMember = useCallback(async (householdId, targetUid) => {
    await householdApi('POST', `/api/households/${seg(householdId)}/members/${seg(targetUid)}/remove`, {});
  }, []);

  const promoteToCoadmin = useCallback(async (householdId, targetUid) => {
    await householdApi('POST', `/api/households/${seg(householdId)}/members/${seg(targetUid)}/role`, { role: 'co-admin' });
  }, []);

  const demoteToMember = useCallback(async (householdId, targetUid) => {
    await householdApi('POST', `/api/households/${seg(householdId)}/members/${seg(targetUid)}/role`, { role: 'member' });
  }, []);

  // `settings` may be partial ({ sharesPantry: false }); the server merges it into the existing settings.
  const updateSettings = useCallback(async (householdId, settings) => {
    await householdApi('PATCH', `/api/households/${seg(householdId)}`, { settings });
  }, []);

  const renameHousehold = useCallback(async (householdId, name) => {
    await householdApi('PATCH', `/api/households/${seg(householdId)}`, { name });
  }, []);

  // Owner or co-admin. The old code stops working immediately. Returns the new code.
  const rotateCode = useCallback(async (householdId) => {
    const hh = await householdApi('POST', `/api/households/${seg(householdId)}/rotate-code`, {});
    return hh.code;
  }, []);

  // Owner only. Hard delete of the household and its shared pantry/recipes/meal plan/activity.
  const disbandHousehold = useCallback(async (householdId) => {
    await householdApi('DELETE', `/api/households/${seg(householdId)}`);
  }, []);

  const getActivityFeed = useCallback(async (householdId) => {
    const snap = await getDocs(collection(db, 'household_activity', householdId, 'events'));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data(), timestamp: d.data().timestamp?.toDate?.() || new Date(0) }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);
  }, []);

  return {
    household, loading, error,
    createHousehold, joinByCode, inviteByEmail,
    leaveHousehold, removeMember, promoteToCoadmin, demoteToMember,
    updateSettings, renameHousehold, rotateCode, disbandHousehold,
    getActivityFeed, logActivity,
  };
}
