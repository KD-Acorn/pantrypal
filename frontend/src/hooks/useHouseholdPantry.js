import { useState, useCallback, useEffect, useRef } from 'react';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

let _idCounter = Date.now();
function genId() { return 'hp' + (++_idCounter).toString(36); }

export default function useHouseholdPantry(householdId, logActivity) {
  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!householdId) { setItems([]); return; }
    const unsub = onSnapshot(
      collection(db, 'household_pantry', householdId, 'items'),
      (snap) => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.error('[HouseholdPantry] onSnapshot error:', err)
    );
    return unsub;
  }, [householdId]);

  const addItem = useCallback((item, uid, displayName) => {
    if (!householdId) return;
    const id = item.id || genId();
    const entry = {
      id, name: item.name, quantity: item.quantity || 1, unit: item.unit || 'item',
      addedBy: uid || '', addedByName: displayName || '',
      lastUpdatedBy: uid || '', addedAt: new Date().toISOString(),
      expiryDate: item.expiryDate || null,
    };
    setItems(prev => [...prev, entry]);
    setDoc(doc(db, 'household_pantry', householdId, 'items', id), entry)
      .catch(err => console.error('[HouseholdPantry] addItem error:', err));
    if (logActivity) logActivity(householdId, 'pantry_add', `${displayName || 'Someone'} added ${item.name}`, displayName);
  }, [householdId, logActivity]);

  const updateItem = useCallback((id, changes, uid, displayName) => {
    if (!householdId) return;
    const updated = { ...changes, lastUpdatedBy: uid || '' };
    const current = itemsRef.current.find(i => i.id === id);
    if (current && (changes.quantity ?? current.quantity) <= 0) {
      setItems(prev => prev.filter(i => i.id !== id));
      deleteDoc(doc(db, 'household_pantry', householdId, 'items', id))
        .catch(err => console.error('[HouseholdPantry] delete error:', err));
      if (logActivity) logActivity(householdId, 'pantry_depleted', `${current.name} ran out`, displayName);
      return;
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updated } : i));
    updateDoc(doc(db, 'household_pantry', householdId, 'items', id), updated)
      .catch(err => console.error('[HouseholdPantry] update error:', err));
  }, [householdId, logActivity]);

  const removeItem = useCallback((id, displayName) => {
    if (!householdId) return;
    const item = itemsRef.current.find(i => i.id === id);
    setItems(prev => prev.filter(i => i.id !== id));
    deleteDoc(doc(db, 'household_pantry', householdId, 'items', id))
      .catch(err => console.error('[HouseholdPantry] remove error:', err));
    if (logActivity && item) logActivity(householdId, 'pantry_remove', `${displayName || 'Someone'} removed ${item.name}`, displayName);
  }, [householdId, logActivity]);

  const clearAll = useCallback(() => {
    if (!householdId) return;
    const all = [...itemsRef.current];
    setItems([]);
    const batch = writeBatch(db);
    all.forEach(i => batch.delete(doc(db, 'household_pantry', householdId, 'items', i.id)));
    batch.commit().catch(err => console.error('[HouseholdPantry] clearAll error:', err));
  }, [householdId]);

  const findByName = useCallback((name) => {
    return itemsRef.current.find(i => i.name.toLowerCase() === name.toLowerCase()) || null;
  }, []);

  return { items, addItem, updateItem, removeItem, clearAll, findByName };
}
