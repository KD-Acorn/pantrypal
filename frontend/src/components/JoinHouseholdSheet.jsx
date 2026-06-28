import { useState } from 'react';

export default function JoinHouseholdSheet({ household, displayName, onClose, toast }) {
  const [tab, setTab] = useState('code');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin() {
    if (code.trim().length < 4) return;
    setJoining(true);
    setError('');
    try {
      await household.joinByCode(code.trim(), displayName);
      toast?.show(`Welcome to ${household.household?.name || 'your household'}!`, 'success');
      onClose();
    } catch (err) {
      setError(err.message || 'Household not found. Check the code and try again.');
    } finally {
      setJoining(false);
    }
  }

  async function handleInvite() {
    if (!email.trim() || !email.includes('@')) return;
    try {
      await household.inviteByEmail(email.trim(), displayName);
      toast?.show('Invite request sent!', 'success');
      setEmail('');
    } catch {
      toast?.show('Failed to send invite', 'error');
    }
  }

  const tabStyle = (active) => ({
    flex: 1, height: 36, borderRadius: 8, border: 'none',
    background: active ? '#10b981' : '#f3f4f6',
    color: active ? '#fff' : '#6b7280',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  });

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 300,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480,
        padding: '24px 16px', boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Join a Household</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
          <button onClick={() => { setTab('code'); setError(''); }} style={tabStyle(tab === 'code')}>🔢 Enter Code</button>
          <button onClick={() => { setTab('email'); setError(''); }} style={tabStyle(tab === 'email')}>📧 Email Invite</button>
        </div>

        {tab === 'code' && (
          <>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              style={{
                width: '100%', height: 52, border: '1px solid #e5e7eb', borderRadius: 10,
                padding: '0 14px', fontSize: 24, fontFamily: 'monospace', outline: 'none',
                textAlign: 'center', letterSpacing: '0.15em', boxSizing: 'border-box',
                marginBottom: error ? 8 : 14,
              }} />
            {error && (
              <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>{error}</div>
            )}
            <button onClick={handleJoin} disabled={code.trim().length < 4 || joining} style={{
              width: '100%', height: 44, borderRadius: 10, border: 'none',
              background: code.trim().length >= 4 && !joining ? '#10b981' : '#d1d5db', color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: code.trim().length >= 4 && !joining ? 'pointer' : 'default',
              fontFamily: 'inherit',
            }}>{joining ? 'Joining...' : 'Join Household'}</button>
          </>
        )}

        {tab === 'email' && (
          <>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, lineHeight: 1.5 }}>
              Enter the email of someone in the household to request an invite
            </div>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="family@example.com" type="email"
              style={{
                width: '100%', height: 44, border: '1px solid #e5e7eb', borderRadius: 10,
                padding: '0 14px', fontSize: 14, fontFamily: 'inherit', outline: 'none',
                marginBottom: 14, boxSizing: 'border-box',
              }} />
            <button onClick={handleInvite} disabled={!email.trim() || !email.includes('@')} style={{
              width: '100%', height: 44, borderRadius: 10, border: 'none',
              background: email.includes('@') ? '#10b981' : '#d1d5db', color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: email.includes('@') ? 'pointer' : 'default',
              fontFamily: 'inherit',
            }}>Send Request</button>
          </>
        )}
      </div>
    </div>
  );
}
