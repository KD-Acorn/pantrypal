import { useState } from 'react';

export default function CreateHouseholdSheet({ household, displayName, onClose, toast }) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdCode, setCreatedCode] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const result = await household.createHousehold(name.trim(), displayName);
      console.log('[Household] Created:', result);
      setCreatedCode(result?.code || '------');
    } catch (err) {
      toast?.show('Failed to create household', 'error');
    } finally {
      setCreating(false);
    }
  }

  function copyCode() {
    navigator.clipboard?.writeText(createdCode || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 300,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480,
        padding: '24px 16px', boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
      }}>
        {createdCode ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏠</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Household Created!</div>
            <div style={{
              fontSize: 32, fontWeight: 800, letterSpacing: '0.2em', color: '#10b981',
              fontFamily: 'monospace', padding: '16px 0', background: '#f0fdf4',
              borderRadius: 12, marginBottom: 12,
            }}>{createdCode}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
              Share this code with family members so they can join
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={copyCode} style={{
                flex: 1, height: 44, borderRadius: 10, border: '1px solid #e5e7eb',
                background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>{copied ? '✓ Copied!' : '📋 Copy Code'}</button>
              <button onClick={onClose} style={{
                flex: 1, height: 44, borderRadius: 10, border: 'none',
                background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 16 }}>Create a Household</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="My Family"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={{
                width: '100%', height: 44, border: '1px solid #e5e7eb', borderRadius: 10,
                padding: '0 14px', fontSize: 14, fontFamily: 'inherit', outline: 'none',
                marginBottom: 14, boxSizing: 'border-box',
              }} />
            <button onClick={handleCreate} disabled={!name.trim() || creating} style={{
              width: '100%', height: 44, borderRadius: 10, border: 'none',
              background: name.trim() && !creating ? '#10b981' : '#d1d5db', color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: name.trim() && !creating ? 'pointer' : 'default',
              fontFamily: 'inherit',
            }}>{creating ? 'Creating...' : 'Create Household'}</button>
          </>
        )}
      </div>
    </div>
  );
}
