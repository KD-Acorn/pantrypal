import { useState, useCallback, useEffect, useRef } from 'react';
import { collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export default function useHouseholdRecipes(householdId, logActivity) {
  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!householdId) { setItems([]); return; }
    const unsub = onSnapshot(
      collection(db, 'household_recipes', householdId, 'recipes'),
      (snap) => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.error('[HouseholdRecipes] onSnapshot error:', err)
    );
    return unsub;
  }, [householdId]);

  const isSaved = useCallback((title) => {
    return itemsRef.current.some(r => r.title === title);
  }, []);

  const save = useCallback((recipe, uid, displayName) => {
    if (!householdId) return;
    if (itemsRef.current.some(r => r.title === recipe.title)) return;
    const id = `hhr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const entry = {
      ...recipe, id, savedAt: new Date().toISOString(),
      addedBy: uid || '', addedByName: displayName || '',
      userRating: 0,
    };
    setItems(prev => [entry, ...prev]);
    setDoc(doc(db, 'household_recipes', householdId, 'recipes', id), entry)
      .catch(err => console.error('[HouseholdRecipes] save error:', err));
    if (logActivity) logActivity(householdId, 'recipe_add', `${displayName || 'Someone'} saved ${recipe.title}`, displayName);
  }, [householdId, logActivity]);

  const unsave = useCallback((id) => {
    if (!householdId) return;
    setItems(prev => prev.filter(r => r.id !== id));
    deleteDoc(doc(db, 'household_recipes', householdId, 'recipes', id))
      .catch(err => console.error('[HouseholdRecipes] unsave error:', err));
  }, [householdId]);

  const updateRating = useCallback((title, stars) => {
    if (!householdId) return;
    const item = itemsRef.current.find(r => r.title === title);
    if (!item) return;
    setItems(prev => prev.map(r => r.title === title ? { ...r, userRating: stars } : r));
    updateDoc(doc(db, 'household_recipes', householdId, 'recipes', item.id), { userRating: stars })
      .catch(err => console.error('[HouseholdRecipes] updateRating error:', err));
  }, [householdId]);

  return { items, isSaved, save, unsave, updateRating };
}
