import { useState, useCallback, useEffect, useRef } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const STORAGE_KEY = 'pantrypal_meal_plan';
const SLOTS = ['breakfast', 'lunch', 'dinner'];

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveLocal(plan) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
}

export default function useMealPlan(uid) {
  const [plan, setPlan] = useState(() => uid ? {} : loadLocal());
  const planRef = useRef(plan);
  planRef.current = plan;

  useEffect(() => {
    if (!uid) { setPlan(loadLocal()); return; }
    const unsub = onSnapshot(
      collection(db, 'meal_plan', uid, 'days'),
      (snap) => {
        const result = {};
        snap.docs.forEach(d => { result[d.id] = d.data(); });
        setPlan(result);
      },
      (err) => console.error('[MealPlan] onSnapshot error:', err)
    );
    return unsub;
  }, [uid]);

  const getDay = useCallback((date) => {
    const key = typeof date === 'string' ? date : fmtDate(date);
    return planRef.current[key] || { breakfast: null, lunch: null, dinner: null };
  }, []);

  const getWeek = useCallback(() => {
    const days = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const key = fmtDate(d);
      days.push({
        date: key,
        dayObj: d,
        ...(planRef.current[key] || { breakfast: null, lunch: null, dinner: null }),
      });
    }
    return days;
  }, []);

  function persist(dateKey, dayData) {
    if (!uid) {
      setPlan(prev => {
        const next = { ...prev, [dateKey]: dayData };
        saveLocal(next);
        return next;
      });
    } else {
      setPlan(prev => ({ ...prev, [dateKey]: dayData }));
      setDoc(doc(db, 'meal_plan', uid, 'days', dateKey), dayData)
        .catch(err => console.error('[MealPlan] write error:', err));
    }
  }

  const assignMeal = useCallback((date, slot, recipe) => {
    const key = typeof date === 'string' ? date : fmtDate(date);
    const current = planRef.current[key] || { breakfast: null, lunch: null, dinner: null };
    const meal = recipe ? {
      recipeId: recipe.id || recipe.title,
      title: recipe.title,
      cookTime: recipe.cookTime || '',
      matchScore: recipe.matchScore ?? null,
      cuisine: recipe.cuisine || '',
      missingIngredients: recipe.missingIngredients || [],
    } : null;
    persist(key, { ...current, [slot]: meal });
  }, [uid]);

  const removeMeal = useCallback((date, slot) => {
    const key = typeof date === 'string' ? date : fmtDate(date);
    const current = planRef.current[key] || { breakfast: null, lunch: null, dinner: null };
    persist(key, { ...current, [slot]: null });
  }, [uid]);

  const clearDay = useCallback((date) => {
    const key = typeof date === 'string' ? date : fmtDate(date);
    if (!uid) {
      setPlan(prev => {
        const next = { ...prev };
        delete next[key];
        saveLocal(next);
        return next;
      });
    } else {
      setPlan(prev => { const next = { ...prev }; delete next[key]; return next; });
      deleteDoc(doc(db, 'meal_plan', uid, 'days', key))
        .catch(err => console.error('[MealPlan] clearDay error:', err));
    }
  }, [uid]);

  const clearWeek = useCallback(() => {
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      clearDay(d);
    }
  }, [clearDay]);

  const getWeekMissing = useCallback(() => {
    const missing = new Set();
    const week = getWeek();
    for (const day of week) {
      for (const slot of SLOTS) {
        const meal = day[slot];
        if (meal?.missingIngredients?.length) {
          meal.missingIngredients.forEach(m => missing.add(m));
        }
      }
    }
    return [...missing];
  }, [getWeek]);

  return { plan, getDay, getWeek, assignMeal, removeMeal, clearDay, clearWeek, getWeekMissing };
}
