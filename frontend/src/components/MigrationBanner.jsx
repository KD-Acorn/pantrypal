import { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import Spinner from './Spinner';

const KEYS = {
  pantry: 'pantrypal_ingredients',
  recipes: 'pantrypal_saved_recipes',
  history: 'pantrypal_cook_history',
  subs: 'pantrypal_substitutions',
};

function safeId(id) {
  return String(id).replace(/\//g, '_');
}

function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch { return []; }
}

export default function MigrationBanner({ uid, toast }) {
  const [visible, setVisible] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!uid) return;
    if (localStorage.getItem('pantrypal_migration_done')) return;
    const hasData = Object.values(KEYS).some(k => readLocal(k).length > 0);
    if (hasData) setVisible(true);
  }, [uid]);

  if (!visible) return null;

  async function handleImport() {
    setImporting(true);
    try {
      const pantryItems = readLocal(KEYS.pantry);
      for (const item of pantryItems) {
        if (!item?.name) continue;
        const id = safeId(item.id || Date.now().toString(36));
        await setDoc(doc(db, 'pantry', uid, 'items', id), {
          ...item, id, addedAt: item.addedAt || new Date().toISOString(),
        });
      }

      const recipes = readLocal(KEYS.recipes);
      for (const recipe of recipes) {
        if (!recipe?.id) continue;
        await setDoc(doc(db, 'saved_recipes', uid, 'recipes', safeId(recipe.id)), recipe);
      }

      const history = readLocal(KEYS.history);
      for (const entry of history) {
        if (!entry) continue;
        const id = safeId(entry.id ?? Date.now().toString());
        await setDoc(doc(db, 'cook_history', uid, 'entries', id), { ...entry, id });
      }

      const subs = readLocal(KEYS.subs);
      for (const sub of subs) {
        if (!sub) continue;
        const id = safeId(sub.id ?? Date.now().toString());
        await setDoc(doc(db, 'substitutions', uid, 'entries', id), { ...sub, id });
      }

      Object.values(KEYS).forEach(k => localStorage.removeItem(k));
      localStorage.setItem('pantrypal_migration_done', '1');
      toast.show('Local data imported to your account!', 'success');
    } catch (err) {
      console.error('Migration error:', err);
      toast.show('Import failed — please try again', 'error');
    } finally {
      setImporting(false);
      setVisible(false);
    }
  }

  function handleSkip() {
    localStorage.setItem('pantrypal_migration_done', '1');
    setVisible(false);
  }

  return (
    <div style={{
      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
      padding: '12px 16px', margin: '0 16px 12px',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#166534', marginBottom: 4 }}>
        Import local data?
      </div>
      <div style={{ fontSize: 13, color: '#166534', marginBottom: 10 }}>
        You have pantry items and recipes saved on this device. Import them to your account?
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleImport} disabled={importing} style={{
          flex: 1, height: 36, borderRadius: 8, border: 'none',
          background: importing ? '#d1d5db' : '#10b981', color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: importing ? 'default' : 'pointer',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>{importing ? <><Spinner size={14} /> Importing...</> : 'Import'}</button>
        <button onClick={handleSkip} disabled={importing} style={{
          flex: 1, height: 36, borderRadius: 8, border: '1px solid #bbf7d0',
          background: '#fff', color: '#166534', fontSize: 13, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>Skip</button>
      </div>
    </div>
  );
}
