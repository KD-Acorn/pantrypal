import { useState, useCallback } from 'react';

const STORAGE_KEY = 'pantrypal_saved_recipes';
const RATINGS_KEY = 'pantrypal_ratings';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function persist(items) {
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

export default function useSavedRecipes() {
  const [items, setItems] = useState(load);
  const [ratings, setRatings] = useState(loadRatings);

  const isSaved = useCallback((title) => {
    return items.some(r => r.title === title);
  }, [items]);

  const save = useCallback((recipe) => {
    setItems(prev => {
      if (prev.some(r => r.title === recipe.title)) return prev;
      const entry = {
        ...recipe,
        id: `${recipe.title.replace(/\s+/g, '_').slice(0, 30)}_${Date.now()}`,
        savedAt: new Date().toISOString(),
        userRating: ratings[recipe.title] || 0,
      };
      const next = [entry, ...prev];
      persist(next);
      return next;
    });
  }, [ratings]);

  const unsave = useCallback((id) => {
    setItems(prev => {
      const next = prev.filter(r => r.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const updateRating = useCallback((title, stars) => {
    persistRating(title, stars);
    setRatings(prev => ({ ...prev, [title]: stars }));
    setItems(prev => {
      const next = prev.map(r => r.title === title ? { ...r, userRating: stars } : r);
      persist(next);
      return next;
    });
  }, []);

  const rate = useCallback((title, stars) => {
    persistRating(title, stars);
    setRatings(prev => ({ ...prev, [title]: stars }));
  }, []);

  return { items, ratings, isSaved, save, unsave, updateRating, rate };
}
