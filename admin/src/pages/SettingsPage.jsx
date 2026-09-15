import { useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3003';

function StatusBanner({ status }) {
  if (!status) return null;
  const isError = status.type === 'error';
  return (
    <div style={{
      marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: 13,
      background: isError ? '#fef2f2' : '#f0fdf4',
      color: isError ? '#b91c1c' : '#15803d',
      border: `1px solid ${isError ? '#fecaca' : '#bbf7d0'}`,
    }}>
      {status.message}
    </div>
  );
}

export default function SettingsPage() {
  const { currentUser } = useAdminAuth();
  const [selfSending, setSelfSending] = useState(false);
  const [selfStatus, setSelfStatus] = useState(null);
  const [testerEmail, setTesterEmail] = useState('');
  const [testerSending, setTesterSending] = useState(false);
  const [testerStatus, setTesterStatus] = useState(null);

  async function getToken() {
    return currentUser?.getIdToken?.() || null;
  }

  async function sendTestPush({ targetEmail } = {}) {
    const token = await getToken();
    const resp = await fetch(`${API}/api/push/test-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(targetEmail ? { targetEmail } : {}),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
    return data;
  }

  async function handleSendToSelf() {
    setSelfSending(true);
    setSelfStatus(null);
    try {
      const data = await sendTestPush();
      setSelfStatus({
        type: data.result === 'sent' ? 'success' : 'error',
        message: data.result === 'sent'
          ? '✅ Sent — check this device for the notification.'
          : `⚠️ Push service returned "${data.result}" — see pm2 logs for detail.`,
      });
    } catch (err) {
      setSelfStatus({ type: 'error', message: `❌ ${err.message}` });
    }
    setSelfSending(false);
  }

  async function handleSendToTester() {
    const email = testerEmail.trim();
    if (!email) return;
    setTesterSending(true);
    setTesterStatus(null);
    try {
      const data = await sendTestPush({ targetEmail: email });
      setTesterStatus({
        type: data.result === 'sent' ? 'success' : 'error',
        message: data.result === 'sent'
          ? `✅ Sent to ${email} — ask them to check their device.`
          : `⚠️ Push service returned "${data.result}" — see pm2 logs for detail.`,
      });
    } catch (err) {
      setTesterStatus({ type: 'error', message: `❌ ${err.message}` });
    }
    setTesterSending(false);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Settings</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>Admin panel configuration</p>

      <div style={{
        background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
        padding: 20, maxWidth: 480,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
          🔔 Push Notification Test
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>
          Manually trigger a test push via POST /api/push/test-send — for confirming the
          opt-in → subscribe → real device loop without waiting for the daily cron.
        </div>

        <button
          onClick={handleSendToSelf}
          disabled={selfSending}
          style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: selfSending ? '#d1d5db' : '#22c55e', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: selfSending ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {selfSending ? 'Sending...' : '🔔 Send test notification to myself'}
        </button>
        <StatusBanner status={selfStatus} />

        <div style={{ borderTop: '1px solid #f0f0f0', margin: '20px 0 16px' }} />

        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
          Send to a tester
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="email"
            value={testerEmail}
            onChange={e => setTesterEmail(e.target.value)}
            placeholder="tester@example.com"
            style={{
              flex: 1, height: 36, border: '1px solid #e5e7eb', borderRadius: 8,
              padding: '0 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleSendToTester}
            disabled={testerSending || !testerEmail.trim()}
            style={{
              padding: '0 16px', borderRadius: 8, border: '1px solid #e5e7eb',
              background: testerSending || !testerEmail.trim() ? '#f3f4f6' : '#fff',
              color: '#374151', fontSize: 13, fontWeight: 500,
              cursor: testerSending || !testerEmail.trim() ? 'default' : 'pointer',
              fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            {testerSending ? 'Sending...' : 'Send'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
          Looks up the user by email, then sends to their saved subscription. If they haven't
          toggled on "Daily pantry reminder" in Settings yet, this will tell you that instead of failing silently.
        </div>
        <StatusBanner status={testerStatus} />
      </div>
    </div>
  );
}
