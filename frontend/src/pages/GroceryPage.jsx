import { useState, useMemo } from 'react';

const UNITS = ['item','box','can','bag','bottle','jar','cup','oz','lb','g','ml','l','bunch','clove','slice','pinch','pack'];

const CATEGORY_ORDER = [
  '🥩 Meat & Seafood',
  '🥛 Dairy & Eggs',
  '🥦 Produce',
  '🌾 Grains & Bread',
  '🥫 Canned & Packaged',
  '🧂 Spices & Condiments',
  '🧊 Frozen',
  '🥤 Beverages',
  '🛍 Other',
];

export default function GroceryPage({ grocery, pantry, saved, toast }) {
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [confirmClear, setConfirmClear] = useState(false);

  function handleAdd() {
    const names = input.split(',').map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    const added = grocery.addItems(names.map(n => ({ name: n, quantity: 1, unit: 'item', source: 'manual' })));
    if (added > 0) toast.show(`Added ${added} item${added > 1 ? 's' : ''} to grocery list`, 'success');
    else toast.show('Items already in grocery list', 'info');
    setInput('');
  }

  function handleSync() {
    if (!saved?.items?.length) {
      toast.show('No saved recipes to sync from', 'info');
      return;
    }
    const added = grocery.syncFromRecipes(saved.items);
    if (added > 0) toast.show(`Added ${added} item${added > 1 ? 's' : ''} from your saved recipes`, 'success');
    else toast.show('No new missing ingredients found', 'info');
  }

  function handleAddToPantry() {
    const checked = grocery.getChecked();
    if (checked.length === 0) return;
    pantry.add(checked.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit })));
    grocery.clearChecked();
    toast.show(`${checked.length} item${checked.length > 1 ? 's' : ''} added to pantry`, 'success');
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
    const knownCats = new Set(CATEGORY_ORDER);
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
    <div style={{ padding: '20px 16px 100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Grocery List</h1>
        {grocery.items.length > 0 && (
          <span style={{
            fontSize: 12, fontWeight: 600, background: '#f3f4f6', color: '#374151',
            padding: '2px 10px', borderRadius: 20,
          }}>{grocery.items.length}</span>
        )}
      </div>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        {checkedCount > 0 ? `${checkedCount} of ${grocery.items.length} checked` : 'Your shopping list'}
      </p>

      <button onClick={handleSync} style={{
        width: '100%', height: 40, borderRadius: 10, border: '1px solid #e5e7eb',
        background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12,
      }}>🔄 Sync from Saved Recipes</button>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Add items (comma-separated)"
          style={{
            flex: 1, height: 42, border: '1px solid #e5e7eb', borderRadius: 10,
            padding: '0 14px', fontSize: 14, fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button onClick={handleAdd} style={{
          height: 42, padding: '0 18px', borderRadius: 10, border: 'none',
          background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}>Add</button>
      </div>

      {grocery.items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🛒</div>
          <div style={{ fontSize: 14 }}>Your grocery list is empty.</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Add items manually or sync from your saved recipes.</div>
        </div>
      ) : (
        <>
          {CATEGORY_ORDER.filter(cat => grouped[cat]?.length > 0).map(cat => (
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
                          style={{
                            width: '100%', height: 34, border: '1px solid #e5e7eb', borderRadius: 8,
                            padding: '0 10px', fontSize: 13, fontFamily: 'inherit', marginBottom: 8,
                            outline: 'none', boxSizing: 'border-box',
                          }} />
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <input type="number" min="1" value={editDraft.quantity}
                            onChange={e => setEditDraft(d => ({ ...d, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                            style={{
                              width: 60, height: 34, border: '1px solid #e5e7eb', borderRadius: 8,
                              padding: '0 8px', fontSize: 13, fontFamily: 'inherit', outline: 'none', textAlign: 'center',
                            }} />
                          <select value={editDraft.unit} onChange={e => setEditDraft(d => ({ ...d, unit: e.target.value }))}
                            style={{
                              height: 34, border: '1px solid #e5e7eb', borderRadius: 8,
                              padding: '0 8px', fontSize: 13, fontFamily: 'inherit', background: '#fff',
                            }}>
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={saveEdit} style={{
                            fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 6,
                            background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}>Save</button>
                          <button onClick={() => setEditingId(null)} style={{
                            fontSize: 12, padding: '5px 14px', borderRadius: 6,
                            background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={item.checked}
                          onChange={() => grocery.toggleChecked(item.id)}
                          style={{ accentColor: '#10b981', width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }} />
                        <span style={{
                          flex: 1, fontSize: 14, color: item.checked ? '#9ca3af' : '#1f2937',
                          textDecoration: item.checked ? 'line-through' : 'none',
                        }}>
                          {item.name}
                          <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 6 }}>
                            {item.quantity} {item.unit}
                          </span>
                        </span>
                        <button onClick={() => startEdit(item)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 14, color: '#9ca3af', padding: '0 4px', lineHeight: 1,
                        }}>✏️</button>
                        <button onClick={() => grocery.removeItem(item.id)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 18, color: '#d1d5db', lineHeight: 1, padding: '0 4px',
                        }}>×</button>
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
                  style={{ fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Yes, clear
                </button>
                <button onClick={() => setConfirmClear(false)}
                  style={{ fontSize: 13, padding: '6px 16px', borderRadius: 8, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
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
    </div>
  );
}
