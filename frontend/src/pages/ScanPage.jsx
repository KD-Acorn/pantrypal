import { useState } from 'react';
import Spinner from '../components/Spinner';
import { trackEvent } from '../utils/analytics';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3003';
const UNITS = ['item','box','can','bag','bottle','jar','cup','oz','lb','g','ml','l','bunch','clove','slice','pinch','pack','fl oz','gallon'];
const IMG_ACCEPT = 'image/*,image/jpeg,image/png,image/heic,image/heif';
const HIDDEN_INPUT = { position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, opacity: 0 };
function tapLabel(id) { return (e) => { e.preventDefault(); document.getElementById(id)?.click(); }; }

export default function ScanPage({ pantry, toast, grocery, rateLimit }) {
  const { currentUser } = useAuth();
  const [mode, setMode] = useState('text');
  const [scanSubMode, setScanSubMode] = useState('photo');
  const [textInput, setTextInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [preview, setPreview] = useState(null);
  const [barcodeContext, setBarcodeContext] = useState(null); // { barcode, originalName, itemSize, communityVerified }
  const [storeBanner, setStoreBanner] = useState(null);
  const [barcodeBanner, setBarcodeBanner] = useState(null);
  const [dupeActions, setDupeActions] = useState({});
  const [scanError, setScanError] = useState(null);
  const [barcodeManualInput, setBarcodeManualInput] = useState('');
  const [lastBarcodeImg, setLastBarcodeImg] = useState(null); // { base64, mimeType }
  const [barcodeRetryCount, setBarcodeRetryCount] = useState(0);
  const [barcodeRetrying, setBarcodeRetrying] = useState(false);
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [correctionName, setCorrectionName] = useState('');
  const [correctionQty, setCorrectionQty] = useState(1);
  const [correctionUnit, setCorrectionUnit] = useState('item');
  const [correctionSaving, setCorrectionSaving] = useState(false);
  function handleTextAdd() {
    const names = textInput.split(',').map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    pantry.add(names.map(n => ({ name: n, quantity: 1, unit: 'item' })));
    toast.show(`Added ${names.length} ingredient${names.length > 1 ? 's' : ''}`, 'success');
    setTextInput('');
  }

  const [heicWarning, setHeicWarning] = useState(false);

  // HEIC/HEIF: iOS native format — base64 read works but API may reject; warn user
  function fileToBase64(file) {
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif'
      || file.name?.toLowerCase().endsWith('.heic') || file.name?.toLowerCase().endsWith('.heif');
    setHeicWarning(isHeic);
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  const COMPRESS_MAX_DIMENSION = 1600;
  const COMPRESS_JPEG_QUALITY = 0.8;

  // Raw camera photos are commonly 3-10MB+; base64 adds ~33% on top of that,
  // which can exceed the backend's JSON body limit. Downscale + re-encode as
  // JPEG via canvas before upload. Canvas can't decode HEIC/HEIF in most
  // browsers, so that format falls back to the raw fileToBase64 path (same
  // as before this fix) rather than failing to compress.
  function compressImageToBase64(file) {
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif'
      || file.name?.toLowerCase().endsWith('.heic') || file.name?.toLowerCase().endsWith('.heif');
    if (isHeic) return fileToBase64(file).then(base64 => ({ base64, mimeType: file.type }));

    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;
        if (width > COMPRESS_MAX_DIMENSION || height > COMPRESS_MAX_DIMENSION) {
          if (width > height) {
            height = Math.round(height * (COMPRESS_MAX_DIMENSION / width));
            width = COMPRESS_MAX_DIMENSION;
          } else {
            width = Math.round(width * (COMPRESS_MAX_DIMENSION / height));
            height = COMPRESS_MAX_DIMENSION;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', COMPRESS_JPEG_QUALITY);
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image for compression')); };
      img.src = objectUrl;
    });
  }

  async function handleImageUpload(file) {
    if (!file) return;
    setScanning(true);
    setScanMsg('Analyzing your photo...');
    setStoreBanner(null);
    setScanError(null);
    try {
      const { base64, mimeType } = await compressImageToBase64(file);
      const resp = await fetch(`${API}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      if (!resp.ok) {
        const err = new Error(`Scan failed with status ${resp.status}`);
        err.status = resp.status;
        throw err;
      }
      const data = await resp.json();
      const items = (data.ingredients || []).filter(Boolean);
      const detectedBarcodes = data.detectedBarcodes || [];

      let foodItems = items.map(i =>
        typeof i === 'string'
          ? { name: i, quantity: 1, unit: 'item', checked: true }
          : { name: i.name, quantity: i.quantity || 1, unit: UNITS.includes(i.unit) ? i.unit : 'item', checked: true }
      );

      // Lookup any barcodes detected in the image and prepend as named items
      if (detectedBarcodes.length > 0) {
        const barcodeResults = await Promise.all(
          detectedBarcodes.map(async (bc) => {
            try {
              const r = await fetch(`${API}/api/barcode-lookup?barcode=${bc}`);
              if (!r.ok) return null;
              const p = await r.json();
              if (p.error) return null;
              return { name: p.name, quantity: p.quantity || 1, unit: UNITS.includes(p.unit) ? p.unit : 'item', checked: true, source: 'barcode' };
            } catch { return null; }
          })
        );
        const validBarcodeItems = barcodeResults.filter(Boolean);
        foodItems = [...validBarcodeItems, ...foodItems];
      }

      if (foodItems.length === 0) {
        setScanError('photo');
        return;
      }
      setPreview(foodItems);
      setBarcodeContext(null);
      setDupeActions({});
      if (rateLimit) rateLimit.increment('scan_camera');
      trackEvent('scan_complete', { type: 'camera', items: foodItems.length, barcodes: detectedBarcodes.length });
    } catch (err) {
      console.error('Scan error:', err);
      trackEvent('scan_failed', { errorMessage: err?.message, status: err?.status });
      const message = err?.status === 413
        ? "That photo's a bit too large — try again, we've made this more reliable"
        : 'Scan failed — try adding ingredients manually';
      toast.show(message, 'error');
    } finally {
      setScanning(false);
      setScanMsg('');
    }
  }

  async function handleReceiptUpload(file) {
    if (!file) return;
    setScanning(true);
    setScanMsg('Reading receipt...');
    setStoreBanner(null);
    setScanError(null);
    try {
      const base64 = await fileToBase64(file);
      const resp = await fetch(`${API}/api/scan-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      });
      if (!resp.ok) throw new Error('Receipt scan failed');
      const data = await resp.json();
      const items = data.ingredients || [];
      if (items.length === 0) {
        setScanError('receipt');
        return;
      }
      setPreview(items.map(i => ({
        name: i.name || '',
        quantity: i.quantity || 1,
        unit: UNITS.includes(i.unit) ? i.unit : 'item',
        checked: true,
      })));
      setDupeActions({});
      setStoreBanner(data.detectedStore || null);
      if (rateLimit) rateLimit.increment('scan_receipt');
      trackEvent('scan_complete', { type: 'receipt', items: items.length });
    } catch {
      toast.show('Receipt scan failed — try better lighting or a flatter photo', 'error');
    } finally {
      setScanning(false);
      setScanMsg('');
    }
  }

  async function handleBarcodeUpload(file) {
    if (!file) return;
    setScanning(true);
    setScanMsg('Scanning barcode...');
    setBarcodeBanner(null);
    setScanError(null);
    setBarcodeManualInput('');
    setShowCorrectionForm(false);
    setBarcodeRetryCount(0);
    try {
      const base64 = await fileToBase64(file);
      setLastBarcodeImg({ base64, mimeType: file.type || 'image/jpeg' });
      const resp = await fetch(`${API}/api/scan-barcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      });
      if (!resp.ok) throw new Error('Barcode scan failed');
      const data = await resp.json();

      if (data.error === 'no_barcode') {
        setScanError('no_barcode');
        return;
      }
      if (data.error === 'not_found') {
        setScanError('not_found');
        setBarcodeManualInput(data.barcode || '');
        return;
      }
      if (data.error) {
        setScanError('scan_failed');
        return;
      }

      const items = (data.ingredients || []).filter(i => i && i.name);
      if (items.length === 0) {
        setScanError('scan_failed');
        return;
      }
      setPreview(items.map(i => ({
        name: i.name, quantity: i.quantity || 1,
        unit: UNITS.includes(i.unit) ? i.unit : 'item', checked: true,
      })));
      setBarcodeContext({
        barcode: data.barcode,
        originalName: data.productName,
        itemSize: data.itemSize || null,
        communityVerified: data.communityVerified || false,
        originalItems: items.map(i => ({ name: i.name, quantity: i.quantity || 1, unit: i.unit })),
      });
      setDupeActions({});
      setBarcodeBanner({ productName: data.productName, brand: data.brand, communityVerified: data.communityVerified });
      if (rateLimit) rateLimit.increment('scan_barcode');
      trackEvent('scan_complete', { type: 'barcode', items: items.length });
    } catch {
      toast.show('Barcode scan failed — please try again', 'error');
    } finally {
      setScanning(false);
      setScanMsg('');
    }
  }

  async function retryBarcode() {
    if (!lastBarcodeImg) return;
    setBarcodeRetrying(true);
    setScanError(null);
    setBarcodeRetryCount(c => c + 1);
    try {
      const resp = await fetch(`${API}/api/scan-barcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: lastBarcodeImg.base64, mimeType: lastBarcodeImg.mimeType }),
      });
      if (!resp.ok) throw new Error('Barcode scan failed');
      const data = await resp.json();
      if (data.error === 'no_barcode') { setScanError('no_barcode'); return; }
      if (data.error === 'not_found') { setScanError('not_found'); setBarcodeManualInput(data.barcode || ''); return; }
      if (data.error) { setScanError('scan_failed'); return; }
      const items = (data.ingredients || []).filter(i => i && i.name);
      if (items.length === 0) { setScanError('scan_failed'); return; }
      setPreview(items.map(i => ({
        name: i.name, quantity: i.quantity || 1,
        unit: UNITS.includes(i.unit) ? i.unit : 'item', checked: true,
      })));
      setBarcodeContext({
        barcode: data.barcode, originalName: data.productName,
        itemSize: data.itemSize || null, communityVerified: data.communityVerified || false,
        originalItems: items.map(i => ({ name: i.name, quantity: i.quantity || 1, unit: i.unit })),
      });
      setDupeActions({});
      setBarcodeBanner({ productName: data.productName, brand: data.brand, communityVerified: data.communityVerified });
      trackEvent('scan_complete', { type: 'barcode_retry', items: items.length });
    } catch {
      setScanError('scan_failed');
    } finally {
      setBarcodeRetrying(false);
    }
  }

  async function handleSaveCorrection() {
    if (!correctionName.trim() || !barcodeContext?.barcode) return;
    setCorrectionSaving(true);
    try {
      await fetch(`${API}/api/scan-barcode/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: barcodeContext.barcode,
          originalName: barcodeContext.originalName || '',
          name: correctionName.trim(),
          correctedName: correctionName.trim(),
          quantity: correctionQty,
          unit: correctionUnit,
          uid: currentUser?.uid || 'anonymous',
          needsReview: true,
        }),
      });
      setPreview(prev => prev?.map((item, i) =>
        i === 0 ? { ...item, name: correctionName.trim(), quantity: correctionQty, unit: correctionUnit } : item
      ) || prev);
      toast.show('Thanks! Your correction helps improve scanning for everyone.', 'success');
      setShowCorrectionForm(false);
    } catch {
      toast.show('Could not save correction — please try again', 'error');
    } finally {
      setCorrectionSaving(false);
    }
  }

  function updatePreviewItem(idx, changes) {
    setPreview(prev => prev.map((p, i) => i === idx ? { ...p, ...changes } : p));
  }

  async function confirmPreview() {
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

    // Log barcode correction if user edited the scan result
    if (barcodeContext?.barcode && currentUser?.uid && toAdd.length > 0) {
      const confirmed = toAdd[0];
      const original = barcodeContext.originalItems?.[0];
      const wasEdited = !original ||
        confirmed.name !== original.name ||
        confirmed.quantity !== original.quantity ||
        confirmed.unit !== original.unit;
      if (wasEdited || !barcodeContext.communityVerified) {
        fetch(`${API}/api/scan-barcode/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            barcode: barcodeContext.barcode,
            originalName: barcodeContext.originalName,
            name: confirmed.name,
            quantity: confirmed.quantity,
            unit: confirmed.unit,
            itemSize: barcodeContext.itemSize || null,
            uid: currentUser.uid,
          }),
        }).catch(() => {});
      }
    }

    setPreview(null);
    setBarcodeContext(null);
    setDupeActions({});
    setStoreBanner(null);
  }

  const checkedCount = preview ? preview.filter(p => p.checked).length : 0;

  const tabBtn = (key, label) => (
    <button onClick={() => { setMode(key); setPreview(null); setBarcodeContext(null); setStoreBanner(null); setBarcodeBanner(null); setScanError(null); setBarcodeManualInput(''); }} style={{
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

  const previewChecklist = (
    <div>
      {storeBanner !== undefined && storeBanner !== null && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
          padding: '8px 14px', marginBottom: 12, fontSize: 13, color: '#166534',
        }}>
          📄 Receipt detected: <strong>{storeBanner}</strong> — review items before adding to pantry
        </div>
      )}
      {mode === 'receipt' && storeBanner === null && preview && (
        <div style={{
          background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 10,
          padding: '8px 14px', marginBottom: 12, fontSize: 13, color: '#6b7280',
        }}>
          📄 Receipt scanned — review items before adding to pantry
        </div>
      )}
      {barcodeBanner && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
          padding: '8px 14px', marginBottom: 12, fontSize: 13, color: '#166534',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span>📦 Found: <strong>{barcodeBanner.productName}</strong>{barcodeBanner.brand ? ` by ${barcodeBanner.brand}` : ''}</span>
          {barcodeBanner.communityVerified && (
            <span title="This product was verified by other My Pantry Club users" style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
              background: '#22c55e', color: '#fff', flexShrink: 0,
            }}>✓ Community Verified</span>
          )}
        </div>
      )}
      {barcodeContext?.barcode && !showCorrectionForm && (
        <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginBottom: 10 }}>
          Not the right product?{' '}
          <button onClick={() => {
            setCorrectionName(preview?.[0]?.name || '');
            setCorrectionQty(preview?.[0]?.quantity || 1);
            setCorrectionUnit(preview?.[0]?.unit || 'item');
            setShowCorrectionForm(true);
          }} style={{
            background: 'none', border: 'none', color: '#10b981', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: 0, textDecoration: 'underline',
          }}>Edit & Report</button>
        </div>
      )}
      {barcodeContext?.barcode && showCorrectionForm && (
        <div style={{
          background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12,
          padding: '14px 16px', marginBottom: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            What product did you actually scan?
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>
            Barcode: {barcodeContext.barcode}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <input value={correctionName} onChange={e => setCorrectionName(e.target.value)}
              placeholder="Corrected product name"
              style={{
                height: 36, border: '1px solid #e5e7eb', borderRadius: 8,
                padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
              }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" min="1" value={correctionQty}
                onChange={e => setCorrectionQty(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: 60, height: 36, border: '1px solid #e5e7eb', borderRadius: 8,
                  padding: '0 8px', fontSize: 13, fontFamily: 'inherit', outline: 'none', textAlign: 'center',
                }} />
              <select value={correctionUnit} onChange={e => setCorrectionUnit(e.target.value)}
                style={{
                  height: 36, border: '1px solid #e5e7eb', borderRadius: 8,
                  padding: '0 8px', fontSize: 13, fontFamily: 'inherit', background: '#fff',
                }}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowCorrectionForm(false)} style={{
              flex: 1, height: 36, borderRadius: 8, border: '1px solid #e5e7eb',
              background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>Cancel</button>
            <button onClick={handleSaveCorrection}
              disabled={!correctionName.trim() || correctionSaving} style={{
                flex: 2, height: 36, borderRadius: 8, border: 'none',
                background: correctionName.trim() && !correctionSaving ? '#10b981' : '#d1d5db',
                color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                cursor: correctionName.trim() && !correctionSaving ? 'pointer' : 'default',
              }}>{correctionSaving ? 'Saving...' : 'Save Correction'}</button>
          </div>
        </div>
      )}
      <div style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 12 }}>
        Found {preview?.length || 0} ingredients — edit details and confirm:
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {(preview || []).map((p, idx) => {
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
                {p.source === 'barcode' && (
                  <span title="Identified via barcode" style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 8,
                    background: '#eff6ff', color: '#1d4ed8', flexShrink: 0,
                  }}>📦</span>
                )}
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
        <button onClick={() => { setPreview(null); setBarcodeContext(null); setDupeActions({}); setStoreBanner(null); setBarcodeBanner(null); }} style={{
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
      {grocery && (
        <button onClick={() => {
          const toAdd = preview.filter(p => p.checked);
          if (toAdd.length === 0) return;
          const added = grocery.addItems(toAdd.map(p => ({ name: p.name, quantity: p.quantity, unit: p.unit, source: 'scan' })));
          if (added > 0) toast.show(`${added} item${added > 1 ? 's' : ''} added to grocery list`, 'success');
          else toast.show('Items already in grocery list', 'info');
          setPreview(null); setBarcodeContext(null); setDupeActions({}); setStoreBanner(null); setBarcodeBanner(null);
        }} disabled={checkedCount === 0} style={{
          width: '100%', height: 38, borderRadius: 10, border: '1px solid #e5e7eb',
          background: '#fff', color: checkedCount > 0 ? '#374151' : '#9ca3af',
          fontSize: 13, fontWeight: 500, cursor: checkedCount > 0 ? 'pointer' : 'default',
          fontFamily: 'inherit', marginTop: 8,
        }}>🛒 Add to Grocery List instead</button>
      )}
    </div>
  );

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Scan Ingredients</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Add ingredients by typing, scanning, or uploading a receipt</p>

      <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', marginBottom: 20 }}>
        {tabBtn('text', 'Type / Paste')}
        {tabBtn('scan', 'Photo Scan')}
        {tabBtn('receipt', 'Receipt')}
      </div>

      {/* Text mode */}
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

      {/* Photo scan mode */}
      {mode === 'scan' && !preview && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
            <button onClick={() => { setScanSubMode('photo'); setScanError(null); setBarcodeManualInput(''); }} style={{
              flex: 1, height: 36, borderRadius: 8, border: 'none',
              background: scanSubMode === 'photo' ? '#fff' : 'transparent',
              color: scanSubMode === 'photo' ? '#374151' : '#6b7280',
              fontSize: 13, fontWeight: scanSubMode === 'photo' ? 600 : 400,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: scanSubMode === 'photo' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>🍽 Food Photo</button>
            <button onClick={() => { setScanSubMode('barcode'); setScanError(null); }} style={{
              flex: 1, height: 36, borderRadius: 8, border: 'none',
              background: scanSubMode === 'barcode' ? '#fff' : 'transparent',
              color: scanSubMode === 'barcode' ? '#374151' : '#6b7280',
              fontSize: 13, fontWeight: scanSubMode === 'barcode' ? 600 : 400,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: scanSubMode === 'barcode' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>📦 Barcode</button>
          </div>

          <div style={{
            border: '2px dashed #d1d5db', borderRadius: 16, padding: '32px 20px',
            textAlign: 'center', background: '#fafafa',
          }}>
            {scanning ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <Spinner size={32} />
                <div style={{ fontSize: 14, color: '#6b7280' }}>{scanMsg}</div>
              </div>
            ) : scanError === 'photo' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 14, color: '#b45309', lineHeight: 1.5 }}>
                  ⚠️ No food items found in this photo.<br />
                  Try a clearer shot with better lighting, or upload a different photo.
                </div>
                <button onClick={() => setScanError(null)} style={{
                  height: 40, padding: '0 24px', borderRadius: 10, border: 'none',
                  background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Try Again</button>
              </div>
            ) : scanError === 'no_barcode' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 14, color: '#b45309', lineHeight: 1.5 }}>
                  ⚠️ No barcode detected.<br />
                  Try better lighting or a clearer angle.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setScanError(null)} style={{
                    height: 40, padding: '0 20px', borderRadius: 10, border: '1px solid #e5e7eb',
                    background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>Try Again</button>
                  {lastBarcodeImg && barcodeRetryCount === 0 && (
                    <button onClick={retryBarcode} disabled={barcodeRetrying} style={{
                      height: 40, padding: '0 20px', borderRadius: 10, border: 'none',
                      background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600,
                      cursor: barcodeRetrying ? 'default' : 'pointer', fontFamily: 'inherit',
                    }}>{barcodeRetrying ? 'Retrying...' : '🔄 Retry Same Image'}</button>
                  )}
                </div>
                {barcodeRetryCount >= 1 && (
                  <div style={{ width: '100%' }}>
                    <input value={barcodeManualInput} onChange={e => setBarcodeManualInput(e.target.value)}
                      placeholder="Enter product name manually"
                      style={{
                        width: '80%', height: 38, border: '1px solid #e5e7eb', borderRadius: 8,
                        padding: '0 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', textAlign: 'center',
                      }} />
                    <button onClick={() => {
                      if (!barcodeManualInput.trim()) return;
                      setPreview([{ name: barcodeManualInput.trim(), quantity: 1, unit: 'item', checked: true }]);
                      setDupeActions({}); setScanError(null);
                    }} disabled={!barcodeManualInput.trim()} style={{
                      marginTop: 8, height: 40, padding: '0 20px', borderRadius: 10, border: 'none',
                      background: barcodeManualInput.trim() ? '#10b981' : '#d1d5db', color: '#fff',
                      fontSize: 13, fontWeight: 600, cursor: barcodeManualInput.trim() ? 'pointer' : 'default', fontFamily: 'inherit',
                    }}>Add Manually</button>
                  </div>
                )}
              </div>
            ) : scanError === 'not_found' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 14, color: '#b45309', lineHeight: 1.5 }}>
                  ⚠️ Product not found. You can add it manually below.
                </div>
                <input value={barcodeManualInput} onChange={e => setBarcodeManualInput(e.target.value)}
                  placeholder="Enter product name"
                  style={{
                    width: '80%', height: 38, border: '1px solid #e5e7eb', borderRadius: 8,
                    padding: '0 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                    textAlign: 'center',
                  }} />
                <button onClick={() => {
                  if (!barcodeManualInput.trim()) return;
                  setPreview([{ name: barcodeManualInput.trim(), quantity: 1, unit: 'item', checked: true }]);
                  setDupeActions({});
                  setScanError(null);
                }} disabled={!barcodeManualInput.trim()} style={{
                  height: 40, padding: '0 24px', borderRadius: 10, border: 'none',
                  background: barcodeManualInput.trim() ? '#10b981' : '#d1d5db', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: barcodeManualInput.trim() ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                }}>Add to Preview</button>
              </div>
            ) : scanError === 'scan_failed' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 14, color: '#b45309', lineHeight: 1.5 }}>
                  ⚠️ Barcode scan failed. Please try again.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setScanError(null)} style={{
                    height: 40, padding: '0 20px', borderRadius: 10, border: '1px solid #e5e7eb',
                    background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>Try Again</button>
                  {lastBarcodeImg && barcodeRetryCount === 0 && (
                    <button onClick={retryBarcode} disabled={barcodeRetrying} style={{
                      height: 40, padding: '0 20px', borderRadius: 10, border: 'none',
                      background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600,
                      cursor: barcodeRetrying ? 'default' : 'pointer', fontFamily: 'inherit',
                    }}>{barcodeRetrying ? 'Retrying...' : '🔄 Retry Same Image'}</button>
                  )}
                </div>
                {barcodeRetryCount >= 1 && (
                  <div style={{ width: '100%' }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Enter product name manually:</div>
                    <input value={barcodeManualInput} onChange={e => setBarcodeManualInput(e.target.value)}
                      placeholder="Enter product name"
                      style={{
                        width: '80%', height: 38, border: '1px solid #e5e7eb', borderRadius: 8,
                        padding: '0 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', textAlign: 'center',
                      }} />
                    <button onClick={() => {
                      if (!barcodeManualInput.trim()) return;
                      setPreview([{ name: barcodeManualInput.trim(), quantity: 1, unit: 'item', checked: true }]);
                      setDupeActions({}); setScanError(null);
                    }} disabled={!barcodeManualInput.trim()} style={{
                      marginTop: 8, height: 40, padding: '0 20px', borderRadius: 10, border: 'none',
                      background: barcodeManualInput.trim() ? '#10b981' : '#d1d5db', color: '#fff',
                      fontSize: 13, fontWeight: 600, cursor: barcodeManualInput.trim() ? 'pointer' : 'default', fontFamily: 'inherit',
                    }}>Add Manually</button>
                  </div>
                )}
              </div>
            ) : scanSubMode === 'photo' ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📸</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 12 }}>Scan your ingredients</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                  <label htmlFor="camera-capture" onTouchEnd={tapLabel('camera-capture')} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    height: 40, padding: '0 20px', borderRadius: 10, border: 'none',
                    background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>📷 Take a Photo</label>
                  <label htmlFor="camera-upload" onTouchEnd={tapLabel('camera-upload')} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    height: 40, padding: '0 20px', borderRadius: 10,
                    border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
                    fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  }}>🖼️ Upload from Gallery</label>
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Point at your fridge, pantry, or groceries</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 12 }}>Scan a product barcode</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                  <label htmlFor="barcode-capture" onTouchEnd={tapLabel('barcode-capture')} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    height: 40, padding: '0 20px', borderRadius: 10, border: 'none',
                    background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>📷 Scan Barcode</label>
                  <label htmlFor="barcode-upload" onTouchEnd={tapLabel('barcode-upload')} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    height: 40, padding: '0 20px', borderRadius: 10,
                    border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
                    fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  }}>🖼️ Upload Barcode Image</label>
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Point camera at any grocery product barcode</div>
              </>
            )}
          </div>
          <input id="camera-capture" type="file" accept={IMG_ACCEPT} capture="environment"
            style={HIDDEN_INPUT} onChange={e => handleImageUpload(e.target.files?.[0])} />
          <input id="camera-upload" type="file" accept={IMG_ACCEPT}
            style={HIDDEN_INPUT} onChange={e => handleImageUpload(e.target.files?.[0])} />
          <input id="barcode-capture" type="file" accept={IMG_ACCEPT} capture="environment"
            style={HIDDEN_INPUT} onChange={e => handleBarcodeUpload(e.target.files?.[0])} />
          <input id="barcode-upload" type="file" accept={IMG_ACCEPT}
            style={HIDDEN_INPUT} onChange={e => handleBarcodeUpload(e.target.files?.[0])} />
        </div>
      )}

      {/* Receipt mode */}
      {/* Mobile fix: use <label> trigger instead of ref.click() */}
      {/* ref.click() is blocked by mobile Safari and Chrome as a security measure */}
      {mode === 'receipt' && !preview && (
        <div>
          <div style={{
            border: '2px dashed #d1d5db', borderRadius: 16, padding: '32px 20px',
            textAlign: 'center', background: '#fafafa',
          }}>
            {scanning ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <Spinner size={32} />
                <div style={{ fontSize: 14, color: '#6b7280' }}>{scanMsg}</div>
              </div>
            ) : scanError === 'receipt' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 14, color: '#b45309', lineHeight: 1.5 }}>
                  ⚠️ No food items found on this receipt.<br />
                  Try a flatter photo with better lighting, or upload a different receipt.
                </div>
                <button onClick={() => setScanError(null)} style={{
                  height: 40, padding: '0 24px', borderRadius: 10, border: 'none',
                  background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Try Again</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🧾</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 12 }}>Scan a grocery receipt</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <label htmlFor="receipt-capture" onTouchEnd={tapLabel('receipt-capture')} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    height: 40, padding: '0 20px', borderRadius: 10, border: 'none',
                    background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>📷 Scan Receipt</label>
                  <label htmlFor="receipt-upload" onTouchEnd={tapLabel('receipt-upload')} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    height: 40, padding: '0 20px', borderRadius: 10,
                    border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
                    fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  }}>🖼️ Upload Receipt Photo</label>
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Works best with flattened receipts in good lighting</div>
              </>
            )}
          </div>
          <input id="receipt-capture" type="file" accept={IMG_ACCEPT} capture="environment"
            style={HIDDEN_INPUT} onChange={e => handleReceiptUpload(e.target.files?.[0])} />
          <input id="receipt-upload" type="file" accept={IMG_ACCEPT}
            style={HIDDEN_INPUT} onChange={e => handleReceiptUpload(e.target.files?.[0])} />
        </div>
      )}

      {heicWarning && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
          padding: '8px 14px', marginBottom: 12, fontSize: 12, color: '#92400e', lineHeight: 1.5,
        }}>
          📱 For best results, switch your iPhone camera to JPEG format: Settings → Camera → Formats → Most Compatible
        </div>
      )}
      {/* Shared preview checklist — used by scan, receipt, and barcode modes */}
      {(mode === 'scan' || mode === 'receipt') && preview && previewChecklist}
    </div>
  );
}
