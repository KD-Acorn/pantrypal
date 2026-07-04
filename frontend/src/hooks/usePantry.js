import { useState, useCallback, useEffect, useRef } from 'react';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, increment } from 'firebase/firestore';
import { db } from '../firebase';

// Key kept as "pantrypal_*" for backward compatibility
const STORAGE_KEY = 'pantrypal_ingredients';

const CATEGORY_KEYWORDS = [
  ['🥩 Meat & Seafood', ['chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'shrimp', 'turkey', 'lamb', 'bacon', 'sausage', 'steak', 'ham', 'crab', 'lobster', 'scallop', 'cod', 'tilapia', 'ground beef', 'ground turkey', 'hot dog', 'pepperoni', 'salami']],
  ['🥛 Dairy & Eggs', ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'egg', 'cheddar', 'mozzarella', 'parmesan', 'brie', 'ricotta', 'sour cream', 'half and half', 'whipped cream', 'cottage cheese', 'cream cheese', 'ghee', 'kefir']],
  ['🥦 Produce', ['apple', 'banana', 'orange', 'lemon', 'lime', 'grape', 'strawberry', 'blueberry', 'raspberry', 'watermelon', 'tomato', 'potato', 'onion', 'garlic', 'carrot', 'broccoli', 'spinach', 'lettuce', 'cucumber', 'pepper', 'zucchini', 'corn', 'mushroom', 'avocado', 'celery', 'cabbage', 'kale', 'asparagus', 'beet', 'sweet potato', 'cherry', 'peach', 'pear', 'mango', 'pineapple', 'ginger', 'jalapeño', 'cilantro', 'basil', 'parsley', 'mint', 'rosemary', 'thyme']],
  ['🌾 Grains & Bread', ['rice', 'pasta', 'bread', 'flour', 'oat', 'quinoa', 'barley', 'tortilla', 'cracker', 'cereal', 'noodle', 'couscous', 'cornmeal', 'panko', 'breadcrumb', 'pita', 'bagel', 'muffin', 'wrap', 'roll', 'bun', 'pretzel', 'granola', 'oatmeal']],
  ['🥫 Canned & Packaged', ['can', 'jar', 'soup', 'beans', 'lentil', 'chickpea', 'tomato sauce', 'broth', 'stock', 'coconut milk', 'pumpkin', 'artichoke', 'olive', 'pickle', 'salsa', 'pasta sauce', 'curry paste', 'tomato paste', 'diced tomato', 'black bean', 'kidney bean', 'refried bean', 'condensed']],
  ['🧂 Spices & Condiments', ['salt', 'pepper', 'cumin', 'oregano', 'cinnamon', 'paprika', 'turmeric', 'chili', 'cayenne', 'garlic powder', 'onion powder', 'bay leaf', 'nutmeg', 'vanilla', 'vinegar', 'soy sauce', 'hot sauce', 'ketchup', 'mustard', 'mayonnaise', 'ranch', 'honey', 'maple syrup', 'sugar', 'brown sugar', 'worcestershire', 'teriyaki', 'fish sauce', 'oyster sauce', 'sriracha', 'balsamic', 'olive oil', 'sesame oil', 'cooking spray', 'oil']],
  ['🧊 Frozen', ['frozen', 'ice cream', 'gelato', 'sorbet', 'popsicle', 'waffle', 'edamame']],
  ['🥤 Beverages', ['juice', 'soda', 'coffee', 'tea', 'espresso', 'coconut water', 'sports drink', 'kombucha', 'wine', 'beer', 'liquor', 'whiskey', 'vodka', 'rum', 'gin', 'tequila', 'champagne', 'cider']],
  ['🍫 Snacks & Sweets', ['chip', 'popcorn', 'cookie', 'chocolate', 'candy', 'granola bar', 'protein bar', 'nuts', 'almonds', 'cashews', 'peanuts', 'walnuts', 'trail mix', 'dried fruit', 'gummy', 'marshmallow', 'cake mix', 'brownie mix', 'pudding', 'jello', 'peanut butter', 'almond butter', 'jam', 'jelly', 'nutella', 'syrup', 'caramel']],
];

export const PANTRY_CATEGORY_ORDER = [
  '🥩 Meat & Seafood',
  '🥛 Dairy & Eggs',
  '🥦 Produce',
  '🌾 Grains & Bread',
  '🥫 Canned & Packaged',
  '🧂 Spices & Condiments',
  '🧊 Frozen',
  '🥤 Beverages',
  '🍫 Snacks & Sweets',
  '🛍 Other',
];

export function assignCategory(name) {
  const lower = (name || '').toLowerCase();
  for (const [cat, keywords] of CATEGORY_KEYWORDS) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return cat;
    }
  }
  return '🛍 Other';
}

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

export default function usePantry(uid, options) {
  const onDepleted = options?.onDepleted;
  const onDepletedRef = useRef(onDepleted);
  onDepletedRef.current = onDepleted;

  const [items, setItems] = useState(() => uid ? [] : loadLocal());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!uid) {
      setItems(loadLocal());
      return;
    }
    const unsub = onSnapshot(collection(db, 'pantry', uid, 'items'), (snap) => {
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const missing = loaded.filter(i => !i.category);
      if (missing.length > 0) {
        const batch = writeBatch(db);
        for (const item of missing) {
          batch.update(doc(db, 'pantry', uid, 'items', item.id), { category: assignCategory(item.name) });
        }
        batch.commit();
      }
      setItems(loaded.map(i => ({ ...i, category: i.category || assignCategory(i.name) })));
    });
    return unsub;
  }, [uid]);

  function handleDepletion(item) {
    if (onDepletedRef.current) onDepletedRef.current(item);
  }

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
          if (!entry.category) entry.category = assignCategory(entry.name);
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
        if (!entry.category) entry.category = assignCategory(entry.name);
        const exists = itemsRef.current.some(i => i.name.toLowerCase() === entry.name.toLowerCase());
        if (!exists) {
          const data = { ...entry, addedAt: new Date().toISOString() };
          setDoc(doc(db, 'pantry', uid, 'items', entry.id), data);
          updateDoc(doc(db, 'users', uid), { pantryCount: increment(1) });
        }
      }
    }
  }, [uid]);

  const addOrMerge = useCallback((entry, mode) => {
    const withCat = { ...entry, category: entry.category || assignCategory(entry.name) };
    if (!uid) {
      setItems(prev => {
        const merged = [...prev];
        const existIdx = merged.findIndex(i => i.name.toLowerCase() === withCat.name.toLowerCase());
        if (existIdx === -1) {
          merged.push({ ...withCat, id: withCat.id || genId() });
        } else if (mode === 'replace') {
          merged[existIdx] = { ...merged[existIdx], ...withCat };
        } else if (mode === 'add') {
          merged[existIdx] = { ...merged[existIdx], quantity: (merged[existIdx].quantity || 1) + (withCat.quantity || 1) };
        }
        saveLocal(merged);
        return merged;
      });
    } else {
      const existing = itemsRef.current.find(i => i.name.toLowerCase() === withCat.name.toLowerCase());
      if (!existing) {
        const id = withCat.id || genId();
        setDoc(doc(db, 'pantry', uid, 'items', id), { ...withCat, id, addedAt: new Date().toISOString() });
        updateDoc(doc(db, 'users', uid), { pantryCount: increment(1) });
      } else if (mode === 'replace') {
        updateDoc(doc(db, 'pantry', uid, 'items', existing.id), withCat);
      } else if (mode === 'add') {
        updateDoc(doc(db, 'pantry', uid, 'items', existing.id), {
          quantity: (existing.quantity || 1) + (withCat.quantity || 1),
        });
      }
    }
  }, [uid]);

  const update = useCallback((id, changes) => {
    if (!uid) {
      setItems(prev => {
        const next = prev.map(i => i.id === id ? { ...i, ...changes } : i);
        const updated = next.find(i => i.id === id);
        if (updated && updated.quantity <= 0) {
          handleDepletion(updated);
          const filtered = next.filter(i => i.id !== id);
          saveLocal(filtered);
          return filtered;
        }
        saveLocal(next);
        return next;
      });
    } else {
      const current = itemsRef.current.find(i => i.id === id);
      if (current) {
        const newQty = changes.quantity ?? current.quantity;
        if (newQty <= 0) {
          handleDepletion(current);
          deleteDoc(doc(db, 'pantry', uid, 'items', id));
          updateDoc(doc(db, 'users', uid), { pantryCount: increment(-1) });
          return;
        }
      }
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
      updateDoc(doc(db, 'users', uid), { pantryCount: increment(-1) });
    }
  }, [uid]);

  const clear = useCallback(() => {
    if (!uid) {
      saveLocal([]);
      setItems([]);
    } else {
      const count = itemsRef.current.length;
      const batch = writeBatch(db);
      itemsRef.current.forEach(i => batch.delete(doc(db, 'pantry', uid, 'items', i.id)));
      batch.commit();
      if (count > 0) updateDoc(doc(db, 'users', uid), { pantryCount: increment(-count) });
    }
  }, [uid]);

  return { items, add, addOrMerge, update, remove, clear, findByName };
}
