import { useState, useCallback, useEffect, useRef } from 'react';
import { collection, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, onSnapshot, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

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
      if (snap.empty) { setHousehold(null); }
      else { setHousehold({ id: snap.docs[0].id, ...snap.docs[0].data() }); }
      setLoading(false);
    }, (err) => {
      console.error('[Household] onSnapshot error:', err);
      setError(err.message);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  useEffect(() => { householdRef.current = household; }, [household]);

  const logActivity = useCallback(async (householdId, type, description, displayName) => {
    if (!householdId || !uid) return;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await setDoc(doc(db, 'household_activity', householdId, 'events', id), {
      type, uid, displayName: displayName || '', description,
      timestamp: serverTimestamp(),
    }).catch(err => console.error('[Household] logActivity error:', err));
  }, [uid]);

  const createHousehold = useCallback(async (name, displayName) => {
    if (!uid) return null;
    const id = `hh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const code = genCode();
    const member = { uid, displayName: displayName || '', email: '', role: 'owner', joinedAt: new Date().toISOString() };
    const data = {
      id, name, code, createdBy: uid, createdAt: serverTimestamp(),
      members: [member],
      memberUids: [uid],
      settings: { sharesPantry: true, sharesRecipes: true, sharesMealPlan: true },
    };
    await setDoc(doc(db, 'households', id), data);
    await logActivity(id, 'member_join', `${displayName || 'Owner'} created the household`, displayName);
    return { id, code };
  }, [uid, logActivity]);

  const joinByCode = useCallback(async (code, displayName) => {
    if (!uid) return null;
    const q = query(collection(db, 'households'), where('code', '==', code.toUpperCase().trim()));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error('No household found with that code');
    const hhDoc = snap.docs[0];
    const hh = hhDoc.data();
    if (hh.memberUids?.includes(uid)) throw new Error('You are already in this household');
    const member = { uid, displayName: displayName || '', email: '', role: 'member', joinedAt: new Date().toISOString() };
    await updateDoc(doc(db, 'households', hhDoc.id), {
      members: arrayUnion(member),
      memberUids: arrayUnion(uid),
    });
    await logActivity(hhDoc.id, 'member_join', `${displayName || 'A member'} joined the household`, displayName);
    return hhDoc.id;
  }, [uid, logActivity]);

  const inviteByEmail = useCallback(async (email, displayName) => {
    const hh = householdRef.current;
    if (!hh) return;
    await setDoc(doc(db, 'household_invites', email.toLowerCase().trim()), {
      householdId: hh.id, householdName: hh.name,
      invitedBy: displayName || uid, invitedAt: serverTimestamp(),
    });
  }, [uid]);

  const leaveHousehold = useCallback(async (householdId) => {
    if (!uid) return;
    const ref = doc(db, 'households', householdId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const hh = snap.data();
    const member = hh.members?.find(m => m.uid === uid);
    if (!member) return;
    await updateDoc(ref, {
      members: arrayRemove(member),
      memberUids: arrayRemove(uid),
    });
    await logActivity(householdId, 'member_leave', `${member.displayName || 'A member'} left`, member.displayName);
  }, [uid, logActivity]);

  const removeMember = useCallback(async (householdId, targetUid) => {
    const ref = doc(db, 'households', householdId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const hh = snap.data();
    const member = hh.members?.find(m => m.uid === targetUid);
    if (!member) return;
    await updateDoc(ref, {
      members: arrayRemove(member),
      memberUids: arrayRemove(targetUid),
    });
    await logActivity(householdId, 'member_leave', `${member.displayName || 'A member'} was removed`, member.displayName);
  }, [logActivity]);

  const promoteToCoadmin = useCallback(async (householdId, targetUid) => {
    const ref = doc(db, 'households', householdId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const hh = snap.data();
    const members = hh.members.map(m => m.uid === targetUid ? { ...m, role: 'co-admin' } : m);
    await updateDoc(ref, { members });
  }, []);

  const demoteToMember = useCallback(async (householdId, targetUid) => {
    const ref = doc(db, 'households', householdId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const hh = snap.data();
    const members = hh.members.map(m => m.uid === targetUid ? { ...m, role: 'member' } : m);
    await updateDoc(ref, { members });
  }, []);

  const updateSettings = useCallback(async (householdId, settings) => {
    await updateDoc(doc(db, 'households', householdId), { settings });
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
    updateSettings, getActivityFeed, logActivity,
  };
}
