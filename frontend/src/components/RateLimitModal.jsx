import { LABELS } from '../hooks/useRateLimit';

export default function RateLimitModal({ feature, limit, onClose }) {
  const label = LABELS[feature] || feature;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, padding: 24, maxWidth: 360, width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
          Daily limit reached
        </div>
        <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
          You've used all {limit} free {label.toLowerCase()} today.
          Your limit resets at midnight.
        </p>
        <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
          Upgrade to <strong>PantryPal Pro</strong> for unlimited access.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, height: 42, borderRadius: 10, border: '1px solid #e5e7eb',
            background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Maybe Later</button>
          <button onClick={() => { window.open('/pro', '_blank'); onClose(); }} style={{
            flex: 1, height: 42, borderRadius: 10, border: 'none',
            background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Learn More</button>
        </div>
      </div>
    </div>
  );
}
