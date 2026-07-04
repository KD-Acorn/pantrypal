import { useState, useCallback, useEffect, useRef } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export default function useSavedDrinks(uid) {
  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!uid) { setItems([]); return; }
    const unsub = onSnapshot(collection(db, 'saved_drinks', uid, 'drinks'), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [uid]);

  const isSaved = useCallback((title) => {
    return itemsRef.current.some(d => d.title === title);
  }, []);

  const save = useCallback((drink) => {
    if (!uid || itemsRef.current.some(d => d.title === drink.title)) return;
    const entry = {
      ...drink,
      id: `${(drink.title || '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30)}_${Date.now()}`,
      savedAt: new Date().toISOString(),
    };
    setDoc(doc(db, 'saved_drinks', uid, 'drinks', entry.id), entry);
  }, [uid]);

  const unsave = useCallback((id) => {
    if (!uid) return;
    deleteDoc(doc(db, 'saved_drinks', uid, 'drinks', id));
  }, [uid]);

  return { items, isSaved, save, unsave };
}
