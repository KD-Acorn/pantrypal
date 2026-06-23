import { useState, useCallback } from 'react';

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

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return migrate(raw);
  } catch { return []; }
}

function save(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function usePantry() {
  const [items, setItems] = useState(load);

  const findByName = useCallback((name) => {
    return items.find(i => i.name.toLowerCase() === name.toLowerCase()) || null;
  }, [items]);

  const add = useCallback((newItems) => {
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
      save(merged);
      return merged;
    });
  }, []);

  const addOrMerge = useCallback((entry, mode) => {
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
      save(merged);
      return merged;
    });
  }, []);

  const update = useCallback((id, changes) => {
    setItems(prev => {
      const next = prev.map(i => i.id === id ? { ...i, ...changes } : i);
      save(next);
      return next;
    });
  }, []);

  const remove = useCallback((id) => {
    setItems(prev => {
      const next = prev.filter(i => i.id !== id);
      save(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    save([]);
    setItems([]);
  }, []);

  return { items, add, addOrMerge, update, remove, clear, findByName };
}
