import { useState, useCallback, useEffect, useRef } from 'react';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

const STORAGE_KEY = 'pantrypal_grocery';

let _idCounter = Date.now();
function genId() { return 'g' + (++_idCounter).toString(36); }

const CATEGORY_RULES = [
  { category: '🥩 Meat & Seafood', keywords: ['chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'shrimp', 'turkey', 'bacon', 'sausage', 'lamb', 'steak', 'ground meat', 'crab', 'lobster', 'ham'] },
  { category: '🥛 Dairy & Eggs', keywords: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'egg', 'sour cream', 'whipping cream', 'half and half', 'cottage cheese'] },
  { category: '🥦 Produce', keywords: ['apple', 'banana', 'lettuce', 'tomato', 'onion', 'garlic', 'pepper', 'spinach', 'carrot', 'potato', 'celery', 'cucumber', 'broccoli', 'avocado', 'lemon', 'lime', 'orange', 'berry', 'mushroom', 'corn', 'zucchini', 'kale', 'cilantro', 'basil', 'parsley', 'ginger', 'jalapeño', 'cabbage', 'green bean'] },
  { category: '🌾 Grains & Bread', keywords: ['bread', 'pasta', 'rice', 'flour', 'oat', 'cereal', 'tortilla', 'cracker', 'noodle', 'quinoa', 'couscous', 'bun', 'roll', 'pita', 'wrap'] },
  { category: '🥫 Canned & Packaged', keywords: ['canned', 'can of', 'jar of', 'sauce', 'soup', 'beans', 'diced tomatoes', 'broth', 'stock', 'paste', 'coconut milk', 'tomato sauce', 'salsa'] },
  { category: '🧂 Spices & Condiments', keywords: ['salt', 'cumin', 'oregano', 'cinnamon', 'paprika', 'chili powder', 'turmeric', 'thyme', 'rosemary', 'bay leaf', 'nutmeg', 'oil', 'vinegar', 'soy sauce', 'mustard', 'ketchup', 'mayo', 'honey', 'syrup', 'vanilla'] },
  { category: '🧊 Frozen', keywords: ['frozen', 'ice cream'] },
  { category: '🥤 Beverages', keywords: ['water', 'juice', 'soda', 'coffee', 'tea'] },
];

function assignCategory(name) {
  const lower = name.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) return rule.category;
  }
  return '🛍 Other';
}

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveLocal(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function useGroceryList(uid) {
  const [items, setItems] = useState(() => uid ? [] : loadLocal());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!uid) {
      setItems(loadLocal());
      return;
    }
    const unsub = onSnapshot(collection(db, 'grocery', uid, 'items'), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [uid]);

  const addItem = useCallback((item) => {
    const entry = {
      id: item.id || genId(),
      name: item.name,
      quantity: item.quantity || 1,
      unit: item.unit || 'item',
      category: item.category || assignCategory(item.name),
      checked: false,
      addedAt: new Date().toISOString(),
      source: item.source || 'manual',
    };
    if (!uid) {
      setItems(prev => {
        const next = [...prev, entry];
        saveLocal(next);
        return next;
      });
    } else {
      setDoc(doc(db, 'grocery', uid, 'items', entry.id), entry);
    }
  }, [uid]);

  const addItems = useCallback((newItems) => {
    const existing = new Set(itemsRef.current.map(i => i.name.toLowerCase()));
    const toAdd = [];
    for (const item of newItems) {
      const name = (item.name || item).trim();
      if (!name || existing.has(name.toLowerCase())) continue;
      existing.add(name.toLowerCase());
      toAdd.push({
        id: genId(),
        name,
        quantity: item.quantity || 1,
        unit: item.unit || 'item',
        category: item.category || assignCategory(name),
        checked: false,
        addedAt: new Date().toISOString(),
        source: item.source || 'manual',
      });
    }
    if (toAdd.length === 0) return 0;
    if (!uid) {
      setItems(prev => {
        const next = [...prev, ...toAdd];
        saveLocal(next);
        return next;
      });
    } else {
      for (const entry of toAdd) {
        setDoc(doc(db, 'grocery', uid, 'items', entry.id), entry);
      }
    }
    return toAdd.length;
  }, [uid]);

  const updateItem = useCallback((id, changes) => {
    if (!uid) {
      setItems(prev => {
        const next = prev.map(i => i.id === id ? { ...i, ...changes } : i);
        saveLocal(next);
        return next;
      });
    } else {
      updateDoc(doc(db, 'grocery', uid, 'items', id), changes);
    }
  }, [uid]);

  const removeItem = useCallback((id) => {
    if (!uid) {
      setItems(prev => {
        const next = prev.filter(i => i.id !== id);
        saveLocal(next);
        return next;
      });
    } else {
      deleteDoc(doc(db, 'grocery', uid, 'items', id));
    }
  }, [uid]);

  const toggleChecked = useCallback((id) => {
    const item = itemsRef.current.find(i => i.id === id);
    if (!item) return;
    const next = !item.checked;
    if (!uid) {
      setItems(prev => {
        const updated = prev.map(i => i.id === id ? { ...i, checked: next } : i);
        saveLocal(updated);
        return updated;
      });
    } else {
      updateDoc(doc(db, 'grocery', uid, 'items', id), { checked: next });
    }
  }, [uid]);

  const clearChecked = useCallback(() => {
    const checked = itemsRef.current.filter(i => i.checked);
    if (!uid) {
      setItems(prev => {
        const next = prev.filter(i => !i.checked);
        saveLocal(next);
        return next;
      });
    } else {
      const batch = writeBatch(db);
      checked.forEach(i => batch.delete(doc(db, 'grocery', uid, 'items', i.id)));
      batch.commit();
    }
  }, [uid]);

  const clearAll = useCallback(() => {
    if (!uid) {
      saveLocal([]);
      setItems([]);
    } else {
      const batch = writeBatch(db);
      itemsRef.current.forEach(i => batch.delete(doc(db, 'grocery', uid, 'items', i.id)));
      batch.commit();
    }
  }, [uid]);

  const getChecked = useCallback(() => {
    return itemsRef.current.filter(i => i.checked);
  }, []);

  const syncFromRecipes = useCallback((savedRecipes) => {
    const missing = [];
    for (const recipe of savedRecipes) {
      if (recipe.missingIngredients?.length) {
        for (const name of recipe.missingIngredients) {
          missing.push({ name, quantity: 1, unit: 'item', source: 'recipe' });
        }
      }
    }
    return addItems(missing);
  }, [addItems]);

  return { items, addItem, addItems, updateItem, removeItem, toggleChecked, clearChecked, clearAll, getChecked, syncFromRecipes };
}
