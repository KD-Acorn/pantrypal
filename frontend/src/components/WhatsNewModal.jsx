import { useEffect, useState } from 'react';

export const TYPE_ICON = { major: '🚀', minor: '✨', patch: '🔧' };

export default function WhatsNewModal({ onClose }) {
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/versions.json')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setVersions(list);
        // Opening this modal counts as "seen" regardless of how it was
        // opened (About row or the update banner's "See what's new").
        if (list[0]?.version) {
          localStorage.setItem('pantrypal_last_seen_version', list[0].version);
        }
      })
      .catch(() => setError(true));
  }, []);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, padding: 24, maxWidth: 400, width: '100%',
        maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>What's New</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#9ca3af', fontSize: 20,
            cursor: 'pointer', padding: 4, lineHeight: 1, fontFamily: 'inherit',
          }}>×</button>
        </div>

        {error && (
          <p style={{ fontSize: 13, color: '#6b7280' }}>Couldn't load what's new right now — try again later.</p>
        )}
        {!error && versions === null && (
          <p style={{ fontSize: 13, color: '#6b7280' }}>Loading…</p>
        )}
        {!error && versions?.length === 0 && (
          <p style={{ fontSize: 13, color: '#6b7280' }}>Nothing to show yet.</p>
        )}
        {!error && versions?.map(v => (
          <div key={v.version} style={{
            display: 'flex', gap: 10, padding: '12px 0',
            borderBottom: '1px solid #f3f4f6',
          }}>
            <div style={{ fontSize: 20, lineHeight: 1.4 }}>{TYPE_ICON[v.type] || '🔧'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{v.title}</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>v{v.version}</span>
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: 4 }}>{v.summary}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{v.date}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
