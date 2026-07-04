import { useState, useCallback, useEffect, useRef } from 'react';
import { collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { trackEvent } from '../utils/analytics';

// Keys kept as "pantrypal_*" for backward compatibility
const STORAGE_KEY = 'pantrypal_saved_recipes';
const RATINGS_KEY = 'pantrypal_ratings';

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function persistLocal(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function loadRatings() {
  try { return JSON.parse(localStorage.getItem(RATINGS_KEY)) || {}; }
  catch { return {}; }
}
function persistRating(title, stars) {
  const all = loadRatings();
  all[title] = stars;
  localStorage.setItem(RATINGS_KEY, JSON.stringify(all));
}

export { loadRatings, persistRating };

export default function useSavedRecipes(uid) {
  const [items, setItems] = useState(() => uid ? [] : loadLocal());
  const [ratings, setRatings] = useState(loadRatings);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!uid) {
      setItems(loadLocal());
      return;
    }
    const unsub = onSnapshot(collection(db, 'saved_recipes', uid, 'recipes'), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(docs);
      const merged = { ...loadRatings() };
      docs.forEach(r => { if (r.userRating) merged[r.title] = r.userRating; });
      setRatings(merged);
    });
    return unsub;
  }, [uid]);

  const isSaved = useCallback((title) => {
    return itemsRef.current.some(r => r.title === title);
  }, []);

  const save = useCallback((recipe) => {
    if (itemsRef.current.some(r => r.title === recipe.title)) return;
    const currentRatings = loadRatings();
    const entry = {
      ...recipe,
      id: `${recipe.title.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30)}_${Date.now()}`,
      savedAt: new Date().toISOString(),
      userRating: currentRatings[recipe.title] || 0,
    };
    if (!uid) {
      setItems(prev => {
        const next = [entry, ...prev];
        persistLocal(next);
        return next;
      });
    } else {
      setDoc(doc(db, 'saved_recipes', uid, 'recipes', entry.id), entry);
      updateDoc(doc(db, 'users', uid), { recipesCount: increment(1) });
    }
    trackEvent('recipe_save', { title: recipe.title }, uid);
  }, [uid]);

  const unsave = useCallback((id) => {
    if (!uid) {
      setItems(prev => {
        const next = prev.filter(r => r.id !== id);
        persistLocal(next);
        return next;
      });
    } else {
      deleteDoc(doc(db, 'saved_recipes', uid, 'recipes', id));
      updateDoc(doc(db, 'users', uid), { recipesCount: increment(-1) });
    }
  }, [uid]);

  const updateRating = useCallback((title, stars) => {
    persistRating(title, stars);
    setRatings(prev => ({ ...prev, [title]: stars }));
    if (!uid) {
      setItems(prev => {
        const next = prev.map(r => r.title === title ? { ...r, userRating: stars } : r);
        persistLocal(next);
        return next;
      });
    } else {
      const item = itemsRef.current.find(r => r.title === title);
      if (item) {
        updateDoc(doc(db, 'saved_recipes', uid, 'recipes', item.id), { userRating: stars });
      }
    }
  }, [uid]);

  const rate = useCallback((title, stars) => {
    persistRating(title, stars);
    setRatings(prev => ({ ...prev, [title]: stars }));
  }, []);

  return { items, ratings, isSaved, save, unsave, updateRating, rate };
}
