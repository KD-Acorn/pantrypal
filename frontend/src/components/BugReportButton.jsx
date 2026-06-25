import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const TYPES = [
  { key: 'bug', label: '🐛 Bug Report' },
  { key: 'feature', label: '💡 Feature Request' },
  { key: 'feedback', label: '💬 General Feedback' },
];

export default function BugReportButton({ uid, currentTab, toast }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('bug');
  const [desc, setDesc] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    if (desc.trim().length < 10) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'bug_reports'), {
        type,
        description: desc.trim(),
        currentTab: currentTab || 'unknown',
        domain: window.location.hostname,
        userAgent: navigator.userAgent,
        uid: uid || 'anonymous',
        status: 'open',
        timestamp: serverTimestamp(),
      });
      toast?.show('Thanks for your feedback!', 'success');
      setDesc('');
      setType('bug');
      setOpen(false);
    } catch (err) {
      console.error('Bug report error:', err);
      toast?.show('Failed to submit — please try again', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        position: 'fixed', bottom: 72, left: 12, zIndex: 90,
        width: 40, height: 40, borderRadius: '50%',
        background: '#fff', border: '1px solid #e5e7eb',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        fontSize: 18, cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>🐛</button>

      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480,
            padding: '20px 16px', boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Report a Bug or Give Feedback</div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {TYPES.map(t => (
                <button key={t.key} onClick={() => setType(t.key)} style={{
                  fontSize: 12, fontWeight: type === t.key ? 600 : 400, padding: '6px 12px',
                  borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
                  border: type === t.key ? 'none' : '1px solid #e5e7eb',
                  background: type === t.key ? '#10b981' : '#fff',
                  color: type === t.key ? '#fff' : '#6b7280',
                }}>{t.label}</button>
              ))}
            </div>

            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Describe what happened or what you'd like to see..."
              style={{
                width: '100%', minHeight: 100, border: '1px solid #e5e7eb', borderRadius: 10,
                padding: 12, fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
                outline: 'none', boxSizing: 'border-box', marginBottom: 12,
              }} />

            <button onClick={handleSubmit} disabled={desc.trim().length < 10 || sending} style={{
              width: '100%', height: 44, borderRadius: 10, border: 'none',
              background: desc.trim().length >= 10 && !sending ? '#10b981' : '#d1d5db',
              color: '#fff', fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
              cursor: desc.trim().length >= 10 && !sending ? 'pointer' : 'default',
            }}>{sending ? 'Sending...' : 'Submit'}</button>

            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
              Your device info and current page are included automatically.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
