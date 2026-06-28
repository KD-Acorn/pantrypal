import { useState, useEffect } from 'react';
import Spinner from './Spinner';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3003';

function CountdownUnit({ value, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: 56, height: 56, borderRadius: 10, background: '#f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, fontWeight: 700, color: '#111827',
      }}>{value}</div>
      <span style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}

export default function PendingDeletionScreen({ scheduledFor, currentUser, onCancelled }) {
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });
  const [cancelling, setCancelling] = useState(false);
  const [confirmImmediate, setConfirmImmediate] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    function update() {
      const target = scheduledFor?.toDate ? scheduledFor.toDate() : new Date(scheduledFor);
      const diff = Math.max(0, target.getTime() - Date.now());
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown({ days, hours, mins, secs });
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [scheduledFor]);

  async function handleCancel() {
    setCancelling(true);
    try {
      const token = await currentUser.getIdToken();
      const resp = await fetch(`${API}/api/delete-account/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (data.success) onCancelled();
    } catch { /* ignore */ }
    setCancelling(false);
  }

  async function handleDeleteNow() {
    setDeleting(true);
    try {
      const token = await currentUser.getIdToken();
      const resp = await fetch(`${API}/api/delete-account/now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (data.success) {
        setDeleted(true);
        setTimeout(() => window.location.reload(), 3000);
      }
    } catch { /* ignore */ }
    setDeleting(false);
  }

  if (deleting) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 400, background: '#fff',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <Spinner size={40} />
        <div style={{ fontSize: 16, color: '#6b7280', marginTop: 16 }}>Deleting your account...</div>
      </div>
    );
  }

  if (deleted) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 400, background: '#fff',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>👋</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: '#111827' }}>Account deleted. Goodbye.</div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400, background: '#fff',
      overflowY: 'auto', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        maxWidth: 480, margin: '0 auto', width: '100%', flex: 1,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 24 }}>
            Account Scheduled for Deletion
          </h1>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
            <CountdownUnit value={countdown.days} label="days" />
            <CountdownUnit value={countdown.hours} label="hours" />
            <CountdownUnit value={countdown.mins} label="mins" />
            <CountdownUnit value={countdown.secs} label="secs" />
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 32 }}>Until permanent deletion</div>
        </div>

        <div style={{
          background: '#f9fafb', borderRadius: 12, padding: 16, marginBottom: 32,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>What gets deleted:</div>
          {[
            { icon: '✗', text: 'Your pantry and all ingredients', color: '#ef4444' },
            { icon: '✗', text: 'Your saved recipes and cook history', color: '#ef4444' },
            { icon: '✗', text: 'Your grocery list and meal plans', color: '#ef4444' },
            { icon: '✗', text: 'Your login credentials', color: '#ef4444' },
            { icon: '✓', text: 'Community recipes remain as "Community Member"', color: '#10b981' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
              <span style={{ fontSize: 14, color: item.color, fontWeight: 700, width: 16, textAlign: 'center' }}>{item.icon}</span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{item.text}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={handleCancel} disabled={cancelling} style={{
            width: '100%', height: 50, borderRadius: 12, border: 'none',
            background: '#10b981', color: '#fff', fontSize: 16, fontWeight: 600,
            cursor: cancelling ? 'default' : 'pointer', fontFamily: 'inherit',
          }}>{cancelling ? 'Cancelling...' : '💚 Keep My Account'}</button>

          {!confirmImmediate ? (
            <button onClick={() => setConfirmImmediate(true)} style={{
              width: '100%', height: 44, borderRadius: 12, border: '1px solid #fecaca',
              background: '#fff', color: '#ef4444', fontSize: 14, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>🗑 Delete Everything Now</button>
          ) : (
            <div style={{
              padding: 16, background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 12, textAlign: 'center',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#991b1b', marginBottom: 4 }}>
                This cannot be undone.
              </div>
              <div style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 12 }}>
                All your data will be immediately and permanently deleted.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirmImmediate(false)} style={{
                  flex: 1, height: 38, borderRadius: 8, border: '1px solid #e5e7eb',
                  background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Cancel</button>
                <button onClick={handleDeleteNow} style={{
                  flex: 1, height: 38, borderRadius: 8, border: 'none',
                  background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Yes, Delete Now</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
