import { useState, useCallback, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const DIETARY_KEY = 'pantrypal_dietary_prefs';
const PARTNERS_KEY = 'pantrypal_shopping_partners';
const CUISINE_PREFS_KEY = 'pantrypal_cuisine_prefs';
const CUISINE_MEMORY_KEY = 'pantrypal_cuisine_memory';

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}

export default function useSettings(uid) {
  const [dietaryPrefs, setDietaryPrefs] = useState(() => loadJson(DIETARY_KEY, []));
  const [shoppingPartners, setShoppingPartners] = useState(() => loadJson(PARTNERS_KEY, []));
  const [cuisinePrefs, setCuisinePrefs] = useState(() => loadJson(CUISINE_PREFS_KEY, []));
  const [cuisineMemory, setCuisineMemory] = useState(() => loadJson(CUISINE_MEMORY_KEY, {}));
  const [displayName, setDisplayName] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!uid) { setLoaded(true); return; }
    getDoc(doc(db, 'users', uid)).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.dietaryPreferences?.length) {
          setDietaryPrefs(data.dietaryPreferences);
          localStorage.setItem(DIETARY_KEY, JSON.stringify(data.dietaryPreferences));
        }
        if (data.cuisinePreferences?.length) {
          setCuisinePrefs(data.cuisinePreferences);
          localStorage.setItem(CUISINE_PREFS_KEY, JSON.stringify(data.cuisinePreferences));
        }
        if (data.displayName) setDisplayName(data.displayName);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [uid]);

  const updateDietaryPrefs = useCallback((prefs) => {
    setDietaryPrefs(prefs);
    localStorage.setItem(DIETARY_KEY, JSON.stringify(prefs));
    if (uid) {
      setDoc(doc(db, 'users', uid), { dietaryPreferences: prefs }, { merge: true });
    }
  }, [uid]);

  const toggleDietaryPref = useCallback((pref) => {
    setDietaryPrefs(prev => {
      const next = prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref];
      localStorage.setItem(DIETARY_KEY, JSON.stringify(next));
      if (uid) setDoc(doc(db, 'users', uid), { dietaryPreferences: next }, { merge: true });
      return next;
    });
  }, [uid]);

  const updateShoppingPartners = useCallback((partners) => {
    setShoppingPartners(partners);
    localStorage.setItem(PARTNERS_KEY, JSON.stringify(partners));
  }, []);

  const toggleShoppingPartner = useCallback((partnerId) => {
    setShoppingPartners(prev => {
      const next = prev.includes(partnerId) ? prev.filter(p => p !== partnerId) : [...prev, partnerId];
      localStorage.setItem(PARTNERS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updateCuisinePrefs = useCallback((prefs) => {
    setCuisinePrefs(prefs);
    localStorage.setItem(CUISINE_PREFS_KEY, JSON.stringify(prefs));
    if (uid) {
      setDoc(doc(db, 'users', uid), { cuisinePreferences: prefs }, { merge: true });
    }
  }, [uid]);

  const toggleCuisinePref = useCallback((cuisine) => {
    setCuisinePrefs(prev => {
      const next = prev.includes(cuisine) ? prev.filter(c => c !== cuisine) : [...prev, cuisine];
      localStorage.setItem(CUISINE_PREFS_KEY, JSON.stringify(next));
      if (uid) setDoc(doc(db, 'users', uid), { cuisinePreferences: next }, { merge: true });
      return next;
    });
  }, [uid]);

  const updateDisplayName = useCallback((name) => {
    setDisplayName(name);
    if (uid) {
      setDoc(doc(db, 'users', uid), { displayName: name }, { merge: true });
    }
  }, [uid]);

  const recordCuisineView = useCallback((cuisine) => {
    if (!cuisine || cuisine === 'Any') return;
    const key = cuisine.toLowerCase();
    setCuisineMemory(prev => {
      const next = { ...prev, [key]: (prev[key] || 0) + 1 };
      localStorage.setItem(CUISINE_MEMORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getTopCuisines = useCallback((n = 2) => {
    const entries = Object.entries(cuisineMemory);
    if (entries.length === 0) return [];
    return entries.sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  }, [cuisineMemory]);

  const getTotalShuffles = useCallback(() => {
    return Object.values(cuisineMemory).reduce((sum, v) => sum + v, 0);
  }, [cuisineMemory]);

  return {
    dietaryPrefs, toggleDietaryPref, updateDietaryPrefs,
    shoppingPartners, toggleShoppingPartner, updateShoppingPartners,
    cuisinePrefs, toggleCuisinePref, updateCuisinePrefs,
    cuisineMemory, recordCuisineView, getTopCuisines, getTotalShuffles,
    displayName, updateDisplayName,
    loaded,
  };
}
