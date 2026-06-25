import { useState, useCallback, useEffect, useRef } from 'react';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

// Key kept as "pantrypal_*" for backward compatibility
const STORAGE_KEY = 'pantrypal_ingredients';

let _idCounter = Date.now();
function genId() { return (++_idCounter).toString(36); }

function migrate(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (typeof item === 'string') return { id: genId(), name: item, quantity: 1, unit: 'item' };
    if (item && typeof item === 'object' && item.name) return { ...item, id: item.id || genId() };
    return null;
  }).filter(Boolean);
}

function loadLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return migrate(raw);
  } catch { return []; }
}

function saveLocal(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function usePantry(uid) {
  const [items, setItems] = useState(() => uid ? [] : loadLocal());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!uid) {
      setItems(loadLocal());
      return;
    }
    const unsub = onSnapshot(collection(db, 'pantry', uid, 'items'), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [uid]);

  const findByName = useCallback((name) => {
    return itemsRef.current.find(i => i.name.toLowerCase() === name.toLowerCase()) || null;
  }, []);

  const add = useCallback((newItems) => {
    if (!uid) {
      setItems(prev => {
        const merged = [...prev];
        for (const item of newItems) {
          const entry = typeof item === 'string'
            ? { id: genId(), name: item.trim(), quantity: 1, unit: 'item' }
            : { ...item, id: item.id || genId() };
          if (!entry.name) continue;
          const existIdx = merged.findIndex(i => i.name.toLowerCase() === entry.name.toLowerCase());
          if (existIdx === -1) merged.push(entry);
        }
        saveLocal(merged);
        return merged;
      });
    } else {
      for (const item of newItems) {
        const entry = typeof item === 'string'
          ? { id: genId(), name: item.trim(), quantity: 1, unit: 'item' }
          : { ...item, id: item.id || genId() };
        if (!entry.name) continue;
        const exists = itemsRef.current.some(i => i.name.toLowerCase() === entry.name.toLowerCase());
        if (!exists) {
          const data = { ...entry, addedAt: new Date().toISOString() };
          setDoc(doc(db, 'pantry', uid, 'items', entry.id), data);
        }
      }
    }
  }, [uid]);

  const addOrMerge = useCallback((entry, mode) => {
    if (!uid) {
      setItems(prev => {
        const merged = [...prev];
        const existIdx = merged.findIndex(i => i.name.toLowerCase() === entry.name.toLowerCase());
        if (existIdx === -1) {
          merged.push({ ...entry, id: entry.id || genId() });
        } else if (mode === 'replace') {
          merged[existIdx] = { ...merged[existIdx], ...entry };
        } else if (mode === 'add') {
          merged[existIdx] = { ...merged[existIdx], quantity: (merged[existIdx].quantity || 1) + (entry.quantity || 1) };
        }
        saveLocal(merged);
        return merged;
      });
    } else {
      const existing = itemsRef.current.find(i => i.name.toLowerCase() === entry.name.toLowerCase());
      if (!existing) {
        const id = entry.id || genId();
        setDoc(doc(db, 'pantry', uid, 'items', id), { ...entry, id, addedAt: new Date().toISOString() });
      } else if (mode === 'replace') {
        updateDoc(doc(db, 'pantry', uid, 'items', existing.id), entry);
      } else if (mode === 'add') {
        updateDoc(doc(db, 'pantry', uid, 'items', existing.id), {
          quantity: (existing.quantity || 1) + (entry.quantity || 1),
        });
      }
    }
  }, [uid]);

  const update = useCallback((id, changes) => {
    if (!uid) {
      setItems(prev => {
        const next = prev.map(i => i.id === id ? { ...i, ...changes } : i);
        saveLocal(next);
        return next;
      });
    } else {
      updateDoc(doc(db, 'pantry', uid, 'items', id), changes);
    }
  }, [uid]);

  const remove = useCallback((id) => {
    if (!uid) {
      setItems(prev => {
        const next = prev.filter(i => i.id !== id);
        saveLocal(next);
        return next;
      });
    } else {
      deleteDoc(doc(db, 'pantry', uid, 'items', id));
    }
  }, [uid]);

  const clear = useCallback(() => {
    if (!uid) {
      saveLocal([]);
      setItems([]);
    } else {
      const batch = writeBatch(db);
      itemsRef.current.forEach(i => batch.delete(doc(db, 'pantry', uid, 'items', i.id)));
      batch.commit();
    }
  }, [uid]);

  return { items, add, addOrMerge, update, remove, clear, findByName };
}
