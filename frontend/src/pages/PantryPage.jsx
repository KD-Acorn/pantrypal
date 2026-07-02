import { useState, useMemo, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { assignCategory, PANTRY_CATEGORY_ORDER } from '../hooks/usePantry';
import ShopListSheet from '../components/ShopListSheet';

const UNITS = ['item','box','can','bag','bottle','jar','cup','oz','lb','g','ml','l','bunch','clove','slice','pinch'];
const GROCERY_UNITS = ['item','box','can','bag','bottle','jar','cup','oz','lb','g','ml','l','bunch','clove','slice','pinch','pack'];

function daysUntilExpiry(expiryDate) {
  if (!expiryDate) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const exp = new Date(expiryDate); exp.setHours(0,0,0,0);
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
}
function formatExpiry(expiryDate) {
  return new Date(expiryDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

function PantryItemList({ items, onEdit, onRemove, editingId, editDraft, setEditDraft, saveEdit, setEditingId, showAddedBy }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(item => (
        <div key={item.id} style={{
          background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 10,
          padding: editingId === item.id ? 12 : '10px 14px',
        }}>
          {editingId === item.id ? (
            <div>
              <input value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                style={{ width: '100%', height: 34, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 10px', fontSize: 13, fontFamily: 'inherit', marginBottom: 8, outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input type="number" min="1" value={editDraft.quantity} onChange={e => setEditDraft(d => ({ ...d, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                  style={{ width: 60, height: 34, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 8px', fontSize: 13, fontFamily: 'inherit', outline: 'none', textAlign: 'center' }} />
                <select value={editDraft.unit} onChange={e => setEditDraft(d => ({ ...d, unit: e.target.value }))}
                  style={{ height: 34, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 8px', fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={saveEdit} style={{ fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 6, background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                <button onClick={() => setEditingId(null)} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 6, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, color: '#1f2937' }}><span style={{ fontWeight: 500 }}>{item.quantity} {item.unit}</span> {item.name}</span>
                {showAddedBy && item.addedByName && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>Added by {item.addedByName}</div>}
                {item.expiryDate && (() => {
                  const days = daysUntilExpiry(item.expiryDate);
                  return <div style={{ fontSize: 11, marginTop: 2, color: days <= 0 ? '#dc2626' : days <= 7 ? '#d97706' : '#9ca3af' }}>{days <= 0 ? '❌ Expired' : days <= 7 ? '⚠️ Expires' : 'Expires'} {formatExpiry(item.expiryDate)}</div>;
                })()}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                <button onClick={() => onEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9ca3af', padding: '0 4px', lineHeight: 1 }}>✏️</button>
                <button onClick={() => onRemove(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#d1d5db', lineHeight: 1, padding: '0 4px' }}>×</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Grocery content (inline) ──────────────────────────────────────────────────
const GROCERY_CATEGORY_ORDER = [
  '🥩 Meat & Seafood','🥛 Dairy & Eggs','🥦 Produce','🌾 Grains & Bread',
  '🥫 Canned & Packaged','🧂 Spices & Condiments','🧊 Frozen','🥤 Beverages',
  '🍫 Snacks & Sweets','🛍 Other',
];

function GroceryContent({ grocery, pantry, saved, toast }) {
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [showShopSheet, setShowShopSheet] = useState(false);
  const [showPurchasedBanner, setShowPurchasedBanner] = useState(false);

  function handleAdd() {
    const names = input.split(',').map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    const added = grocery.addItems(names.map(n => ({ name: n, quantity: 1, unit: 'item', source: 'manual' })));
    if (added > 0) toast.show(`Added ${added} item${added > 1 ? 's' : ''} to grocery list`, 'success');
    else toast.show('Items already in grocery list', 'info');
    setInput('');
  }

  function handleSync() {
    if (!saved?.items?.length) { toast.show('No saved recipes to sync from', 'info'); return; }
    const added = grocery.syncFromRecipes(saved.items);
    if (added > 0) toast.show(`Added ${added} item${added > 1 ? 's' : ''} from your saved recipes`, 'success');
    else toast.show('No new missing ingredients found', 'info');
  }

  function handleAddToPantry() {
    const checked = grocery.getChecked();
    if (checked.length === 0) return;
    pantry.add(checked.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit })));
    grocery.clearChecked();
    setShowPurchasedBanner(false);
    toast.show(`${checked.length} item${checked.length > 1 ? 's' : ''} added to pantry 🎉`, 'success');
  }

  function handleClearChecked() {
    const checked = grocery.getChecked();
    if (checked.length === 0) return;
    grocery.clearChecked();
    toast.show(`Removed ${checked.length} item${checked.length > 1 ? 's' : ''}`, 'info');
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditDraft({ name: item.name, quantity: item.quantity, unit: item.unit });
  }

  function saveEdit() {
    if (!editDraft.name?.trim()) return;
    grocery.updateItem(editingId, { name: editDraft.name.trim(), quantity: editDraft.quantity, unit: editDraft.unit });
    setEditingId(null);
  }

  const grouped = useMemo(() => {
    const groups = {};
    const knownCats = new Set(GROCERY_CATEGORY_ORDER);
    for (const item of grocery.items) {
      let cat = item.category || '🛍 Other';
      if (!knownCats.has(cat)) cat = '🛍 Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) => {
        if (a.checked !== b.checked) return a.checked ? 1 : -1;
        return new Date(b.addedAt || 0) - new Date(a.addedAt || 0);
      });
    }
    return groups;
  }, [grocery.items]);

  const checkedCount = grocery.items.filter(i => i.checked).length;

  return (
    <div>
      <button onClick={handleSync} style={{
        width: '100%', height: 40, borderRadius: 10, border: '1px solid #e5e7eb',
        background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12,
      }}>🔄 Sync from Saved Recipes</button>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Add items (comma-separated)"
          style={{ flex: 1, height: 42, border: '1px solid #e5e7eb', borderRadius: 10, padding: '0 14px', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
        <button onClick={handleAdd} style={{
          height: 42, padding: '0 18px', borderRadius: 10, border: 'none',
          background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}>Add</button>
      </div>

      {checkedCount > 0 && (
        <button onClick={() => setShowShopSheet(true)} style={{
          width: '100%', height: 42, borderRadius: 10, border: 'none',
          background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12,
        }}>🛒 Shop ({checkedCount} item{checkedCount !== 1 ? 's' : ''})</button>
      )}

      {showPurchasedBanner && checkedCount > 0 && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
          padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#166534',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span>Did you get everything?</span>
          <button onClick={handleAddToPantry} style={{
            fontSize: 12, fontWeight: 600, color: '#065f46', background: 'none',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            textDecoration: 'underline',
          }}>Mark checked as purchased</button>
        </div>
      )}

      {grocery.items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🛒</div>
          <div style={{ fontSize: 14 }}>Your grocery list is empty.</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Add items manually or sync from your saved recipes.</div>
        </div>
      ) : (
        <>
          {GROCERY_CATEGORY_ORDER.filter(cat => grouped[cat]?.length > 0).map(cat => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>{cat}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {grouped[cat].map(item => (
                  <div key={item.id} style={{
                    background: item.checked ? '#f9fafb' : '#fff',
                    border: `1px solid ${item.checked ? '#f3f4f6' : '#e5e7eb'}`,
                    borderRadius: 10, padding: editingId === item.id ? 12 : '8px 12px',
                  }}>
                    {editingId === item.id ? (
                      <div>
                        <input value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                          style={{ width: '100%', height: 34, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 10px', fontSize: 13, fontFamily: 'inherit', marginBottom: 8, outline: 'none', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <input type="number" min="1" value={editDraft.quantity} onChange={e => setEditDraft(d => ({ ...d, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                            style={{ width: 60, height: 34, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 8px', fontSize: 13, fontFamily: 'inherit', outline: 'none', textAlign: 'center' }} />
                          <select value={editDraft.unit} onChange={e => setEditDraft(d => ({ ...d, unit: e.target.value }))}
                            style={{ height: 34, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 8px', fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
                            {GROCERY_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={saveEdit} style={{ fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 6, background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                          <button onClick={() => setEditingId(null)} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 6, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={item.checked} onChange={() => grocery.toggleChecked(item.id)}
                          style={{ accentColor: '#10b981', width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 14, color: item.checked ? '#9ca3af' : '#1f2937', textDecoration: item.checked ? 'line-through' : 'none' }}>
                          {item.name}
                          <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 6 }}>{item.quantity} {item.unit}</span>
                        </span>
                        <button onClick={() => startEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9ca3af', padding: '0 4px', lineHeight: 1 }}>✏️</button>
                        <button onClick={() => grocery.removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#d1d5db', lineHeight: 1, padding: '0 4px' }}>×</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {checkedCount > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <button onClick={handleAddToPantry} style={{
                width: '100%', height: 44, borderRadius: 10, border: 'none',
                background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>✅ Add {checkedCount} checked to Pantry</button>
              <button onClick={handleClearChecked} style={{
                width: '100%', height: 38, borderRadius: 10, border: '1px solid #e5e7eb',
                background: '#fff', color: '#6b7280', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>🗑 Clear checked</button>
            </div>
          )}

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            {confirmClear ? (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <span style={{ fontSize: 13, color: '#6b7280', lineHeight: '34px' }}>Clear everything?</span>
                <button onClick={() => { grocery.clearAll(); setConfirmClear(false); toast.show('Grocery list cleared', 'info'); }}
                  style={{ fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Yes, clear</button>
                <button onClick={() => setConfirmClear(false)}
                  style={{ fontSize: 13, padding: '6px 16px', borderRadius: 8, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} style={{
                fontSize: 13, color: '#9ca3af', background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
              }}>Clear all</button>
            )}
          </div>
        </>
      )}

      {showShopSheet && (
        <ShopListSheet
          checkedItems={grocery.getChecked()}
          onClose={() => { setShowShopSheet(false); setShowPurchasedBanner(true); }}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PantryPage({ pantry, toast, household, householdPantry, uid, displayName, grocery, saved }) {
  const hh = household?.household;
  const [viewMode, setViewMode] = useState('pantry'); // 'pantry' | 'grocery'
  const [activeTab, setActiveTab] = useState('personal');
  const [input, setInput] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [expiringExpanded, setExpiringExpanded] = useState(true);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [activityFull, setActivityFull] = useState(false);
  const [activity, setActivity] = useState([]);
  const [pantrySort, setPantrySort] = useState('date');
  const [categoryFilter, setCategoryFilter] = useState('All');

  useEffect(() => {
    if (!hh?.id) { setActivity([]); return; }
    const unsub = onSnapshot(
      collection(db, 'household_activity', hh.id, 'events'),
      (snap) => {
        const events = snap.docs.map(d => ({ id: d.id, ...d.data(), timestamp: d.data().timestamp?.toDate?.() || new Date(0) }));
        events.sort((a, b) => b.timestamp - a.timestamp);
        setActivity(events);
      },
      () => {}
    );
    return unsub;
  }, [hh?.id]);

  const activePantry = activeTab === 'household' && householdPantry ? householdPantry : pantry;
  const isHousehold = activeTab === 'household';

  function handleAdd() {
    const names = input.split(',').map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    if (isHousehold) {
      names.forEach(n => householdPantry.addItem({ name: n, quantity: 1, unit: 'item' }, uid, displayName));
    } else {
      pantry.add(names.map(n => ({ name: n, quantity: 1, unit: 'item' })));
    }
    toast.show(`Added ${names.length} ingredient${names.length > 1 ? 's' : ''}`, 'success');
    setInput('');
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditDraft({ name: item.name, quantity: item.quantity, unit: item.unit, expiryDate: item.expiryDate || '' });
  }

  function saveEdit() {
    if (!editDraft.name?.trim()) return;
    const changes = { name: editDraft.name.trim(), quantity: editDraft.quantity, unit: editDraft.unit, expiryDate: editDraft.expiryDate || null };
    if (isHousehold) householdPantry.updateItem(editingId, changes, uid, displayName);
    else pantry.update(editingId, changes);
    setEditingId(null);
    toast.show('Updated', 'success');
  }

  function handleRemove(id) {
    if (isHousehold) householdPantry.removeItem(id, displayName);
    else pantry.remove(id);
  }

  const expiringSoon = useMemo(() => {
    return pantry.items.filter(item => { const d = daysUntilExpiry(item.expiryDate); return d !== null && d <= 7; })
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  }, [pantry.items]);

  const availableCategories = useMemo(() => {
    const cats = new Set(activePantry.items.map(i => i.category || assignCategory(i.name)));
    return PANTRY_CATEGORY_ORDER.filter(c => cats.has(c));
  }, [activePantry.items]);

  const displayItems = useMemo(() => {
    let items = [...activePantry.items].map(i => ({ ...i, category: i.category || assignCategory(i.name) }));
    if (categoryFilter !== 'All') items = items.filter(i => i.category === categoryFilter);
    if (pantrySort === 'az') items.sort((a, b) => a.name.localeCompare(b.name));
    else if (pantrySort === 'date') items.sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0));
    else if (pantrySort === 'expiring') {
      items.sort((a, b) => {
        const da = daysUntilExpiry(a.expiryDate) ?? 99999;
        const db2 = daysUntilExpiry(b.expiryDate) ?? 99999;
        return da - db2;
      });
    } else if (pantrySort === 'category') {
      items.sort((a, b) => {
        const ca = PANTRY_CATEGORY_ORDER.indexOf(a.category);
        const cb = PANTRY_CATEGORY_ORDER.indexOf(b.category);
        if (ca !== cb) return ca - cb;
        return a.name.localeCompare(b.name);
      });
    }
    return items;
  }, [activePantry.items, pantrySort, categoryFilter]);

  const grouped = useMemo(() => {
    if (pantrySort !== 'category') return null;
    const groups = {};
    for (const item of displayItems) {
      const cat = item.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }, [displayItems, pantrySort]);

  const hhTabStyle = (active) => ({
    flex: 1, height: 36, borderRadius: 8, border: 'none',
    background: active ? '#10b981' : '#f3f4f6',
    color: active ? '#fff' : '#6b7280',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  });

  const visibleActivity = activityFull ? activity : activity.slice(0, 5);

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        {viewMode === 'grocery' ? 'Grocery List' : isHousehold ? `${hh?.name || 'Household'} Pantry` : 'My Pantry'}
      </h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
        {viewMode === 'grocery'
          ? `${grocery?.items?.length || 0} item${(grocery?.items?.length || 0) !== 1 ? 's' : ''} on your list`
          : `${activePantry.items.length} ingredient${activePantry.items.length !== 1 ? 's' : ''} on hand`}
      </p>

      {/* Pantry / Grocery toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f3f4f6', borderRadius: 24, padding: 3 }}>
        <button onClick={() => setViewMode('pantry')} style={{
          flex: 1, height: 34, borderRadius: 20, border: 'none',
          background: viewMode === 'pantry' ? '#10b981' : 'transparent',
          color: viewMode === 'pantry' ? '#fff' : '#6b7280',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          transition: 'background 0.15s, color 0.15s',
        }}>🥫 Pantry</button>
        <button onClick={() => setViewMode('grocery')} style={{
          flex: 1, height: 34, borderRadius: 20, border: 'none',
          background: viewMode === 'grocery' ? '#10b981' : 'transparent',
          color: viewMode === 'grocery' ? '#fff' : '#6b7280',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          transition: 'background 0.15s, color 0.15s',
        }}>🛒 Grocery</button>
      </div>

      {/* ── GROCERY SIDE ── */}
      {viewMode === 'grocery' && grocery && (
        <GroceryContent grocery={grocery} pantry={pantry} saved={saved} toast={toast} />
      )}

      {/* ── PANTRY SIDE ── */}
      {viewMode === 'pantry' && (
        <>
          {/* Household toggle */}
          {hh && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
              <button onClick={() => setActiveTab('personal')} style={hhTabStyle(activeTab === 'personal')}>👤 My Pantry</button>
              <button onClick={() => setActiveTab('household')} style={hhTabStyle(activeTab === 'household')}>🏠 Household</button>
            </div>
          )}

          {/* Household activity feed */}
          {isHousehold && activity.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <button onClick={() => setActivityExpanded(v => !v)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Recent Activity</span>
                <span style={{ fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#374151', padding: '2px 8px', borderRadius: 20 }}>{activity.length}</span>
                <span style={{ marginLeft: 'auto', fontSize: 14, color: '#9ca3af' }}>{activityExpanded ? '▴' : '▾'}</span>
              </button>
              {activityExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {visibleActivity.map(e => (
                    <div key={e.id} style={{ fontSize: 12, color: '#6b7280', padding: '4px 0', borderBottom: '1px solid #f9fafb' }}>
                      {e.description} <span style={{ color: '#9ca3af' }}>— {timeAgo(e.timestamp)}</span>
                    </div>
                  ))}
                  {!activityFull && activity.length > 5 && (
                    <button onClick={() => setActivityFull(true)} style={{ fontSize: 11, color: '#10b981', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>View all ({activity.length})</button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Household sharing off message */}
          {isHousehold && hh?.settings && !hh.settings.sharesPantry && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>
              Pantry sharing is turned off for this household.
            </div>
          )}

          {/* Expiring soon — personal tab only, always at top */}
          {!isHousehold && expiringSoon.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <button onClick={() => setExpiringExpanded(v => !v)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>⚠️ Expiring Soon</span>
                <span style={{ fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 20 }}>{expiringSoon.length}</span>
                <span style={{ marginLeft: 'auto', fontSize: 14, color: '#9ca3af' }}>{expiringExpanded ? '▴' : '▾'}</span>
              </button>
              {expiringExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {expiringSoon.map(item => {
                    const days = daysUntilExpiry(item.expiryDate); const isExpired = days <= 0;
                    return (
                      <div key={item.id} style={{ background: isExpired ? '#fef2f2' : '#fffbeb', border: `1px solid ${isExpired ? '#fecaca' : '#fde68a'}`, borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}>{item.quantity} {item.unit} {item.name}</span>
                            <div style={{ fontSize: 12, color: isExpired ? '#dc2626' : '#d97706', marginTop: 2 }}>{isExpired ? '❌ Expired' : '⚠️ Expires'} {formatExpiry(item.expiryDate)}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                            <button onClick={() => startEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9ca3af', padding: '0 4px', lineHeight: 1 }}>✏️</button>
                            <button onClick={() => handleRemove(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#d1d5db', lineHeight: 1, padding: '0 4px' }}>×</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sort + Filter bar */}
          {(!isHousehold || hh?.settings?.sharesPantry) && activePantry.items.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>Sort:</span>
                <select value={pantrySort} onChange={e => setPantrySort(e.target.value)} style={{
                  height: 30, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 8px',
                  fontSize: 12, fontFamily: 'inherit', background: '#fff', color: '#374151',
                }}>
                  <option value="date">Recently Added</option>
                  <option value="az">A–Z</option>
                  <option value="category">Category</option>
                  <option value="expiring">Expiring Soon</option>
                </select>
              </div>
              {availableCategories.length > 1 && (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                  {['All', ...availableCategories].map(cat => {
                    const active = categoryFilter === cat;
                    return (
                      <button key={cat} onClick={() => setCategoryFilter(cat)} style={{
                        fontSize: 11, fontWeight: active ? 600 : 400,
                        padding: '4px 10px', borderRadius: 16, flexShrink: 0,
                        border: active ? 'none' : '1px solid #e5e7eb',
                        background: active ? '#10b981' : '#fff',
                        color: active ? '#fff' : '#6b7280',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>{cat}</button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Add input */}
          {(!isHousehold || hh?.settings?.sharesPantry) && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="Add ingredients (comma-separated)"
                style={{ flex: 1, height: 42, border: '1px solid #e5e7eb', borderRadius: 10, padding: '0 14px', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
              <button onClick={handleAdd} style={{
                height: 42, padding: '0 18px', borderRadius: 10, border: 'none',
                background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}>Add</button>
            </div>
          )}

          {/* Item list */}
          {displayItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🥫</div>
              <div style={{ fontSize: 14 }}>
                {categoryFilter !== 'All'
                  ? `No items in ${categoryFilter}.`
                  : isHousehold ? 'Household pantry is empty.' : 'Your pantry is empty. Add some ingredients!'}
              </div>
            </div>
          ) : grouped ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {PANTRY_CATEGORY_ORDER.filter(cat => grouped[cat]?.length > 0).map(cat => (
                <div key={cat} style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: '#374151',
                    background: '#f3f4f6', borderRadius: 8, padding: '6px 12px',
                    marginBottom: 6,
                  }}>
                    {cat} <span style={{ fontWeight: 400, color: '#9ca3af' }}>({grouped[cat].length})</span>
                  </div>
                  <PantryItemList items={grouped[cat]} onEdit={startEdit} onRemove={handleRemove}
                    editingId={editingId} editDraft={editDraft} setEditDraft={setEditDraft}
                    saveEdit={saveEdit} setEditingId={setEditingId} showAddedBy={isHousehold} />
                </div>
              ))}
            </div>
          ) : (
            <PantryItemList items={displayItems} onEdit={startEdit} onRemove={handleRemove}
              editingId={editingId} editDraft={editDraft} setEditDraft={setEditDraft}
              saveEdit={saveEdit} setEditingId={setEditingId} showAddedBy={isHousehold} />
          )}

          {activePantry.items.length > 0 && (
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              {confirmClear ? (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <span style={{ fontSize: 13, color: '#6b7280', lineHeight: '34px' }}>Clear everything?</span>
                  <button onClick={() => {
                    if (isHousehold) householdPantry.clearAll();
                    else pantry.clear();
                    setConfirmClear(false); toast.show('Pantry cleared', 'info');
                  }} style={{ fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Yes, clear</button>
                  <button onClick={() => setConfirmClear(false)} style={{ fontSize: 13, padding: '6px 16px', borderRadius: 8, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmClear(true)} style={{ fontSize: 13, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Clear all</button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
