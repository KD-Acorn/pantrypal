import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../firebase';

const STATUS_COLORS = {
  open: { bg: '#fef2f2', color: '#991b1b', label: 'Open' },
  in_progress: { bg: '#fffbeb', color: '#92400e', label: 'In Progress' },
  resolved: { bg: '#ecfdf5', color: '#065f46', label: 'Resolved' },
};

const TYPE_COLORS = {
  bug: { bg: '#fef2f2', color: '#991b1b', label: '🐛 Bug' },
  feature: { bg: '#eff6ff', color: '#1d4ed8', label: '💡 Feature' },
  feedback: { bg: '#f3f4f6', color: '#374151', label: '💬 Feedback' },
};

function parseUA(ua) {
  if (!ua) return 'Unknown';
  const mobile = /Mobile|Android|iPhone/i.test(ua);
  const browser = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/)?.[0] || 'Unknown browser';
  return `${mobile ? 'Mobile' : 'Desktop'} · ${browser}`;
}

export default function BugReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => { loadReports(); }, []);

  async function loadReports() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'bug_reports'));
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        timestamp: d.data().timestamp?.toDate?.() || new Date(0),
      }));
      list.sort((a, b) => b.timestamp - a.timestamp);
      setReports(list);
    } catch (err) {
      console.error('[BugReports] Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id, status) {
    try {
      await updateDoc(doc(db, 'bug_reports', id), { status });
      setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (err) {
      console.error('[BugReports] Status update error:', err);
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return reports;
    return reports.filter(r => r.status === filter);
  }, [reports, filter]);

  const counts = useMemo(() => ({
    total: reports.length,
    open: reports.filter(r => r.status === 'open').length,
    in_progress: reports.filter(r => r.status === 'in_progress').length,
    resolved: reports.filter(r => r.status === 'resolved').length,
  }), [reports]);

  const filterBtn = (key, label, count) => (
    <button onClick={() => setFilter(key)} style={{
      fontSize: 12, fontWeight: filter === key ? 600 : 400, padding: '6px 14px',
      borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
      border: filter === key ? 'none' : '1px solid #e5e7eb',
      background: filter === key ? '#22c55e' : '#fff',
      color: filter === key ? '#fff' : '#6b7280',
    }}>{label} ({count})</button>
  );

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Bug Reports</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        {loading ? 'Loading...' : `${reports.length} total report${reports.length !== 1 ? 's' : ''}`}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total', value: counts.total, icon: '📋' },
          { label: 'Open', value: counts.open, icon: '🔴' },
          { label: 'In Progress', value: counts.in_progress, icon: '🟡' },
          { label: 'Resolved', value: counts.resolved, icon: '🟢' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#fff', border: '1px solid #f0f0f0', borderRadius: 10,
            padding: 12, textAlign: 'center',
          }}>
            <div style={{ fontSize: 18 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {filterBtn('all', 'All', counts.total)}
        {filterBtn('open', 'Open', counts.open)}
        {filterBtn('in_progress', 'In Progress', counts.in_progress)}
        {filterBtn('resolved', 'Resolved', counts.resolved)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(r => {
          const tc = TYPE_COLORS[r.type] || TYPE_COLORS.feedback;
          const sc = STATUS_COLORS[r.status] || STATUS_COLORS.open;
          const isExpanded = expandedId === r.id;
          return (
            <div key={r.id} onClick={() => setExpandedId(isExpanded ? null : r.id)} style={{
              background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
              padding: 16, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: tc.bg, color: tc.color }}>{tc.label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: sc.bg, color: sc.color }}>{sc.label}</span>
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
                  {r.timestamp instanceof Date && !isNaN(r.timestamp) ? format(r.timestamp, 'MMM d, yyyy h:mm a') : '—'}
                </span>
              </div>

              <div style={{
                fontSize: 13, color: '#374151', lineHeight: 1.6,
                overflow: isExpanded ? 'visible' : 'hidden',
                maxHeight: isExpanded ? 'none' : 48,
              }}>{r.description}</div>

              {isExpanded && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
                    <div><strong>Device:</strong> {parseUA(r.userAgent)}</div>
                    <div><strong>Domain:</strong> {r.domain || '—'}</div>
                    <div><strong>Page:</strong> {r.currentTab || '—'}</div>
                    <div><strong>UID:</strong> {r.uid ? r.uid.slice(0, 12) + '...' : 'anonymous'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Status:</span>
                    <select value={r.status || 'open'}
                      onClick={e => e.stopPropagation()}
                      onChange={e => { e.stopPropagation(); updateStatus(r.id, e.target.value); }}
                      style={{
                        height: 30, border: '1px solid #e5e7eb', borderRadius: 6,
                        padding: '0 8px', fontSize: 12, fontFamily: 'inherit', background: '#fff',
                      }}>
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af', fontSize: 13 }}>
            No reports match this filter.
          </div>
        )}
      </div>
    </div>
  );
}
