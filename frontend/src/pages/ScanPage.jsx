import { useState, useRef } from 'react';
import Spinner from '../components/Spinner';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3003';
const UNITS = ['item','box','can','bag','bottle','jar','cup','oz','lb','g','ml','l','bunch','clove','slice','pinch'];

export default function ScanPage({ pantry, toast }) {
  const [mode, setMode] = useState('text');
  const [textInput, setTextInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState(null);
  const [dupeActions, setDupeActions] = useState({});
  const fileRef = useRef(null);

  function handleTextAdd() {
    const names = textInput.split(',').map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    pantry.add(names.map(n => ({ name: n, quantity: 1, unit: 'item' })));
    toast.show(`Added ${names.length} ingredient${names.length > 1 ? 's' : ''}`, 'success');
    setTextInput('');
  }

  async function handleImageUpload(file) {
    if (!file) return;
    setScanning(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const resp = await fetch(`${API}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      });
      if (!resp.ok) throw new Error('Scan failed');
      const data = await resp.json();
      const items = (data.ingredients || []).filter(Boolean);
      if (items.length === 0) {
        toast.show('No ingredients detected — try a clearer photo', 'error');
        return;
      }
      setPreview(items.map(name => ({ name, quantity: 1, unit: 'item', checked: true })));
      setDupeActions({});
    } catch {
      toast.show('Scan failed — try adding ingredients manually', 'error');
    } finally {
      setScanning(false);
    }
  }

  function updatePreviewItem(idx, changes) {
    setPreview(prev => prev.map((p, i) => i === idx ? { ...p, ...changes } : p));
  }

  function confirmPreview() {
    const toAdd = preview.filter(p => p.checked);
    let added = 0;
    for (const p of toAdd) {
      const entry = { name: p.name, quantity: p.quantity, unit: p.unit };
      const existing = pantry.findByName(p.name);
      if (existing) {
        const action = dupeActions[p.name];
        if (action === 'skip' || !action) continue;
        pantry.addOrMerge(entry, action);
      } else {
        pantry.add([entry]);
      }
      added++;
    }
    if (added > 0) toast.show(`Added ${added} ingredient${added > 1 ? 's' : ''}`, 'success');
    setPreview(null);
    setDupeActions({});
  }

  const checkedCount = preview ? preview.filter(p => p.checked).length : 0;

  const tabBtn = (key, label) => (
    <button onClick={() => { setMode(key); setPreview(null); }} style={{
      flex: 1, padding: '10px 0', fontSize: 13, fontWeight: mode === key ? 600 : 400,
      color: mode === key ? '#10b981' : '#6b7280', background: 'none', border: 'none',
      borderBottom: `2px solid ${mode === key ? '#10b981' : 'transparent'}`,
      cursor: 'pointer', fontFamily: 'inherit',
    }}>{label}</button>
  );

  const smallBtn = (label, active, onClick) => (
    <button onClick={onClick} style={{
      fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
      border: active ? 'none' : '1px solid #e5e7eb',
      background: active ? '#10b981' : '#fff',
      color: active ? '#fff' : '#6b7280',
    }}>{label}</button>
  );

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Scan Ingredients</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Add ingredients by typing or scanning a photo</p>

      <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', marginBottom: 20 }}>
        {tabBtn('text', 'Type / Paste')}
        {tabBtn('scan', 'Photo Scan')}
      </div>

      {mode === 'text' && (
        <div>
          <textarea
            value={textInput} onChange={e => setTextInput(e.target.value)}
            placeholder="Paste or type ingredients, separated by commas..."
            style={{
              width: '100%', minHeight: 100, border: '1px solid #e5e7eb', borderRadius: 10,
              padding: 14, fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          <button onClick={handleTextAdd} disabled={!textInput.trim()} style={{
            marginTop: 10, width: '100%', height: 44, borderRadius: 10, border: 'none',
            background: textInput.trim() ? '#10b981' : '#d1d5db', color: '#fff',
            fontSize: 15, fontWeight: 600, cursor: textInput.trim() ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}>Add to Pantry</button>
        </div>
      )}

      {mode === 'scan' && !preview && (
        <div>
          <div onClick={() => fileRef.current?.click()} style={{
            border: '2px dashed #d1d5db', borderRadius: 16, padding: '40px 20px',
            textAlign: 'center', cursor: 'pointer', background: '#fafafa',
          }}>
            {scanning ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <Spinner size={32} />
                <div style={{ fontSize: 14, color: '#6b7280' }}>Analyzing your photo...</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📸</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Tap to take a photo or upload</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>Point at your fridge, pantry, or groceries</div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }} onChange={e => handleImageUpload(e.target.files?.[0])} />
        </div>
      )}

      {mode === 'scan' && preview && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 12 }}>
            Found {preview.length} ingredients — edit details and confirm:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {preview.map((p, idx) => {
              const existing = pantry.findByName(p.name);
              const action = dupeActions[p.name];
              return (
                <div key={idx} style={{
                  background: p.checked ? '#fff' : '#f9fafb',
                  border: `1px solid ${p.checked ? '#e5e7eb' : '#f3f4f6'}`,
                  borderRadius: 12, padding: 12, opacity: p.checked ? 1 : 0.5,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input type="checkbox" checked={p.checked} onChange={() => updatePreviewItem(idx, { checked: !p.checked })}
                      style={{ accentColor: '#10b981', width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }} />
                    <input value={p.name} onChange={e => updatePreviewItem(idx, { name: e.target.value })}
                      style={{
                        flex: 1, height: 34, border: '1px solid #e5e7eb', borderRadius: 8,
                        padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                      }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, paddingLeft: 26 }}>
                    <input type="number" min="1" value={p.quantity} onChange={e => updatePreviewItem(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                      style={{
                        width: 60, height: 34, border: '1px solid #e5e7eb', borderRadius: 8,
                        padding: '0 8px', fontSize: 13, fontFamily: 'inherit', outline: 'none', textAlign: 'center',
                      }} />
                    <select value={p.unit} onChange={e => updatePreviewItem(idx, { unit: e.target.value })}
                      style={{
                        height: 34, border: '1px solid #e5e7eb', borderRadius: 8,
                        padding: '0 8px', fontSize: 13, fontFamily: 'inherit', background: '#fff',
                      }}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  {existing && p.checked && (
                    <div style={{ marginTop: 8, paddingLeft: 26, fontSize: 12 }}>
                      <div style={{ color: '#f59e0b', marginBottom: 4 }}>
                        "{existing.name}" already in pantry ({existing.quantity} {existing.unit})
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {smallBtn('Replace', action === 'replace', () => setDupeActions(d => ({ ...d, [p.name]: 'replace' })))}
                        {smallBtn('Add qty', action === 'add', () => setDupeActions(d => ({ ...d, [p.name]: 'add' })))}
                        {smallBtn('Skip', action === 'skip', () => setDupeActions(d => ({ ...d, [p.name]: 'skip' })))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setPreview(null); setDupeActions({}); }} style={{
              flex: 1, height: 44, borderRadius: 10, border: '1px solid #e5e7eb',
              background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Rescan</button>
            <button onClick={confirmPreview} disabled={checkedCount === 0} style={{
              flex: 1, height: 44, borderRadius: 10, border: 'none',
              background: checkedCount > 0 ? '#10b981' : '#d1d5db', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: checkedCount > 0 ? 'pointer' : 'default',
              fontFamily: 'inherit',
            }}>Add {checkedCount} to Pantry</button>
          </div>
        </div>
      )}
    </div>
  );
}
