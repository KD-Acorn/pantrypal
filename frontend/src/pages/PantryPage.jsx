import { useState, useMemo } from 'react';

const UNITS = ['item','box','can','bag','bottle','jar','cup','oz','lb','g','ml','l','bunch','clove','slice','pinch'];

function daysUntilExpiry(expiryDate) {
  if (!expiryDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
}

function formatExpiry(expiryDate) {
  const d = new Date(expiryDate);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function PantryPage({ pantry, toast }) {
  const [input, setInput] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [expiringExpanded, setExpiringExpanded] = useState(true);

  function handleAdd() {
    const names = input.split(',').map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    pantry.add(names.map(n => ({ name: n, quantity: 1, unit: 'item' })));
    toast.show(`Added ${names.length} ingredient${names.length > 1 ? 's' : ''}`, 'success');
    setInput('');
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditDraft({ name: item.name, quantity: item.quantity, unit: item.unit, expiryDate: item.expiryDate || '' });
  }

  function saveEdit() {
    if (!editDraft.name?.trim()) return;
    pantry.update(editingId, {
      name: editDraft.name.trim(), quantity: editDraft.quantity, unit: editDraft.unit,
      expiryDate: editDraft.expiryDate || null,
    });
    setEditingId(null);
    toast.show('Updated', 'success');
  }

  const expiringSoon = useMemo(() => {
    return pantry.items
      .filter(item => {
        const days = daysUntilExpiry(item.expiryDate);
        return days !== null && days <= 7;
      })
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  }, [pantry.items]);

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>My Pantry</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
        {pantry.items.length} ingredient{pantry.items.length !== 1 ? 's' : ''} on hand
      </p>

      {expiringSoon.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <button onClick={() => setExpiringExpanded(v => !v)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>⚠️ Expiring Soon</span>
            <span style={{
              fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e',
              padding: '2px 8px', borderRadius: 20,
            }}>{expiringSoon.length}</span>
            <span style={{ marginLeft: 'auto', fontSize: 14, color: '#9ca3af' }}>
              {expiringExpanded ? '▴' : '▾'}
            </span>
          </button>
          {expiringExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {expiringSoon.map(item => {
                const days = daysUntilExpiry(item.expiryDate);
                const isExpired = days <= 0;
                return (
                  <div key={item.id} style={{
                    background: isExpired ? '#fef2f2' : '#fffbeb',
                    border: `1px solid ${isExpired ? '#fecaca' : '#fde68a'}`,
                    borderRadius: 10, padding: '10px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}>
                          {item.quantity} {item.unit} {item.name}
                        </span>
                        <div style={{ fontSize: 12, color: isExpired ? '#dc2626' : '#d97706', marginTop: 2 }}>
                          {isExpired ? '❌' : '⚠️'} {isExpired ? 'Expired' : 'Expires'} {formatExpiry(item.expiryDate)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        <button onClick={() => startEdit(item)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 14, color: '#9ca3af', padding: '0 4px', lineHeight: 1,
                        }}>✏️</button>
                        <button onClick={() => pantry.remove(item.id)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 18, color: '#d1d5db', lineHeight: 1, padding: '0 4px',
                        }}>×</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Add ingredients (comma-separated)"
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

      {pantry.items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🧊</div>
          <div style={{ fontSize: 14 }}>Your pantry is empty. Add some ingredients!</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pantry.items.map(item => (
            <div key={item.id} style={{
              background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 10,
              padding: editingId === item.id ? 12 : '10px 14px',
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
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 4 }}>
                      Best by / Expiry date (optional)
                    </label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="date" value={editDraft.expiryDate || ''}
                        onChange={e => setEditDraft(d => ({ ...d, expiryDate: e.target.value }))}
                        style={{
                          height: 34, border: '1px solid #e5e7eb', borderRadius: 8,
                          padding: '0 8px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                          background: '#fff', color: '#374151',
                        }} />
                      {editDraft.expiryDate && (
                        <button onClick={() => setEditDraft(d => ({ ...d, expiryDate: '' }))} style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb',
                          background: '#fff', color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit',
                        }}>Clear</button>
                      )}
                    </div>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, color: '#1f2937' }}>
                      <span style={{ fontWeight: 500 }}>{item.quantity} {item.unit}</span> {item.name}
                    </span>
                    {item.expiryDate ? (() => {
                      const days = daysUntilExpiry(item.expiryDate);
                      const isExpired = days <= 0;
                      const isWarning = days > 0 && days <= 7;
                      return (
                        <div style={{
                          fontSize: 11, marginTop: 2,
                          color: isExpired ? '#dc2626' : isWarning ? '#d97706' : '#9ca3af',
                        }}>
                          {isExpired ? '❌ Expired' : isWarning ? '⚠️ Expires' : 'Expires'} {formatExpiry(item.expiryDate)}
                        </div>
                      );
                    })() : (
                      <div
                        onClick={() => startEdit(item)}
                        style={{ fontSize: 11, color: '#d1d5db', marginTop: 2, cursor: 'pointer' }}
                      >Add expiry date</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <button onClick={() => startEdit(item)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 14, color: '#9ca3af', padding: '0 4px', lineHeight: 1,
                    }}>✏️</button>
                    <button onClick={() => pantry.remove(item.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 18, color: '#d1d5db', lineHeight: 1, padding: '0 4px',
                    }}>×</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pantry.items.length > 0 && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          {confirmClear ? (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <span style={{ fontSize: 13, color: '#6b7280', lineHeight: '34px' }}>Clear everything?</span>
              <button onClick={() => { pantry.clear(); setConfirmClear(false); toast.show('Pantry cleared', 'info'); }}
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
      )}
    </div>
  );
}
