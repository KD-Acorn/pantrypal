import { useState, useCallback, useEffect, useRef } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const SLOTS = ['breakfast', 'lunch', 'dinner'];

function fmtDate(d) { return d.toISOString().slice(0, 10); }

export default function useHouseholdMealPlan(householdId, logActivity) {
  const [plan, setPlan] = useState({});
  const planRef = useRef(plan);
  planRef.current = plan;

  useEffect(() => {
    if (!householdId) { setPlan({}); return; }
    const unsub = onSnapshot(
      collection(db, 'household_meal_plan', householdId, 'days'),
      (snap) => {
        const result = {};
        snap.docs.forEach(d => { result[d.id] = d.data(); });
        setPlan(result);
      },
      (err) => console.error('[HouseholdMealPlan] onSnapshot error:', err)
    );
    return unsub;
  }, [householdId]);

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
      days.push({ date: key, dayObj: d, ...(planRef.current[key] || { breakfast: null, lunch: null, dinner: null }) });
    }
    return days;
  }, []);

  const assignMeal = useCallback((date, slot, recipe, displayName) => {
    if (!householdId) return;
    const key = typeof date === 'string' ? date : fmtDate(date);
    const current = planRef.current[key] || { breakfast: null, lunch: null, dinner: null };
    const meal = recipe ? {
      recipeId: recipe.id || recipe.title, title: recipe.title,
      cookTime: recipe.cookTime || '', matchScore: recipe.matchScore ?? null,
      cuisine: recipe.cuisine || '', missingIngredients: recipe.missingIngredients || [],
    } : null;
    const updated = { ...current, [slot]: meal };
    setPlan(prev => ({ ...prev, [key]: updated }));
    setDoc(doc(db, 'household_meal_plan', householdId, 'days', key), updated)
      .catch(err => console.error('[HouseholdMealPlan] assign error:', err));
    if (logActivity && recipe) logActivity(householdId, 'meal_planned', `${displayName || 'Someone'} planned ${recipe.title} for ${slot}`, displayName);
  }, [householdId, logActivity]);

  const removeMeal = useCallback((date, slot) => {
    if (!householdId) return;
    const key = typeof date === 'string' ? date : fmtDate(date);
    const current = planRef.current[key] || { breakfast: null, lunch: null, dinner: null };
    const updated = { ...current, [slot]: null };
    setPlan(prev => ({ ...prev, [key]: updated }));
    setDoc(doc(db, 'household_meal_plan', householdId, 'days', key), updated)
      .catch(err => console.error('[HouseholdMealPlan] remove error:', err));
  }, [householdId]);

  const clearDay = useCallback((date) => {
    if (!householdId) return;
    const key = typeof date === 'string' ? date : fmtDate(date);
    setPlan(prev => { const next = { ...prev }; delete next[key]; return next; });
    deleteDoc(doc(db, 'household_meal_plan', householdId, 'days', key))
      .catch(err => console.error('[HouseholdMealPlan] clearDay error:', err));
  }, [householdId]);

  const getWeekMissing = useCallback(() => {
    const missing = new Set();
    const week = getWeek();
    for (const day of week) {
      for (const slot of SLOTS) {
        const meal = day[slot];
        if (meal?.missingIngredients?.length) meal.missingIngredients.forEach(m => missing.add(m));
      }
    }
    return [...missing];
  }, [getWeek]);

  return { plan, getDay, getWeek, assignMeal, removeMeal, clearDay, getWeekMissing };
}
