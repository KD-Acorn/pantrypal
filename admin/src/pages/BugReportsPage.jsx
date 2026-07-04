import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
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

function DebugCollapsible({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={e => { e.stopPropagation(); setOpen(v => !v); }} style={{
        background: 'none', border: '1px solid #e5e7eb', borderRadius: 6,
        padding: '4px 10px', fontSize: 11, color: '#6b7280', cursor: 'pointer',
        fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {open ? '▾' : '▸'} {title}
      </button>
      {open && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

export default function BugReportsPage() {
  const [activeSection, setActiveSection] = useState('reports');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [correctionsLoading, setCorrectionsLoading] = useState(false);
  const [correctionsLoaded, setCorrectionsLoaded] = useState(false);

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

  async function loadCorrections() {
    setCorrectionsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'verified_products'));
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data(), reportedAt: d.data().reportedAt?.toDate?.() || null }))
        .filter(d => d.needsReview === true);
      list.sort((a, b) => (b.reportedAt || new Date(0)) - (a.reportedAt || new Date(0)));
      setCorrections(list);
      setCorrectionsLoaded(true);
    } catch (err) {
      console.error('[Corrections] Load error:', err);
    } finally {
      setCorrectionsLoading(false);
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

  async function approveCorrection(correction) {
    try {
      await updateDoc(doc(db, 'verified_products', correction.id), {
        needsReview: false,
        communityVerified: true,
        approvedAt: serverTimestamp(),
      });
      setCorrections(prev => prev.filter(c => c.id !== correction.id));
    } catch (err) {
      console.error('[Corrections] Approve error:', err);
    }
  }

  async function rejectCorrection(correction) {
    try {
      await deleteDoc(doc(db, 'verified_products', correction.id));
      setCorrections(prev => prev.filter(c => c.id !== correction.id));
    } catch (err) {
      console.error('[Corrections] Reject error:', err);
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

  function switchToCorrections() {
    setActiveSection('corrections');
    if (!correctionsLoaded && !correctionsLoading) loadCorrections();
  }

  return (
    <div>
      {/* Section tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
        <button onClick={() => setActiveSection('reports')} style={{
          padding: '8px 16px', fontSize: 13, fontWeight: activeSection === 'reports' ? 600 : 400,
          color: activeSection === 'reports' ? '#10b981' : '#6b7280',
          background: 'none', border: 'none',
          borderBottom: `2px solid ${activeSection === 'reports' ? '#10b981' : 'transparent'}`,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>Bug Reports</button>
        <button onClick={switchToCorrections} style={{
          padding: '8px 16px', fontSize: 13, fontWeight: activeSection === 'corrections' ? 600 : 400,
          color: activeSection === 'corrections' ? '#10b981' : '#6b7280',
          background: 'none', border: 'none',
          borderBottom: `2px solid ${activeSection === 'corrections' ? '#10b981' : 'transparent'}`,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Barcode Corrections{corrections.length > 0 ? ` (${corrections.length})` : ''}
        </button>
      </div>

      {/* Barcode Corrections section */}
      {activeSection === 'corrections' && (
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Barcode Corrections</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            {correctionsLoading ? 'Loading...' : `${corrections.length} pending review`}
          </p>
          {!correctionsLoading && corrections.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af', fontSize: 13 }}>
              No pending corrections.
            </div>
          )}
          {corrections.map(c => (
            <div key={c.id} style={{
              background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
              padding: 16, marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Barcode</div>
                  <strong style={{ fontFamily: 'monospace' }}>{c.barcode || c.id}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Reported By</div>
                  <span style={{ color: '#6b7280' }}>{c.reportedBy ? c.reportedBy.slice(0, 12) + '...' : '—'}</span>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Original Name</div>
                  <span style={{ color: '#ef4444' }}>{c.originalName || '—'}</span>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Corrected Name</div>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>{c.correctedName || c.name || '—'}</span>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Qty / Unit</div>
                  <span>{c.quantity} {c.unit}</span>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Date</div>
                  <span style={{ color: '#6b7280' }}>
                    {c.reportedAt ? format(c.reportedAt, 'MMM d, yyyy') : '—'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => approveCorrection(c)} style={{
                  flex: 1, height: 36, borderRadius: 8, border: 'none',
                  background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Approve</button>
                <button onClick={() => rejectCorrection(c)} style={{
                  flex: 1, height: 36, borderRadius: 8, border: '1px solid #fca5a5',
                  background: '#fff', color: '#ef4444', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bug Reports section */}
      {activeSection === 'reports' && (
        <>
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
              const di = r.debugInfo;
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
                    <div onClick={e => e.stopPropagation()} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
                        <div><strong>Device:</strong> {parseUA(r.userAgent)}</div>
                        <div><strong>Domain:</strong> {r.domain || '—'}</div>
                        <div><strong>Page:</strong> {r.currentTab || '—'}</div>
                        <div><strong>UID:</strong> {r.uid ? r.uid.slice(0, 12) + '...' : 'anonymous'}</div>
                      </div>

                      {di && (
                        <div style={{ marginBottom: 14, padding: '12px 14px', background: '#f9fafb', borderRadius: 10, border: '1px solid #f0f0f0' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Debug Info</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                            <span><strong>Browser:</strong> {di.browser}</span>
                            <span style={{ color: '#d1d5db' }}>·</span>
                            <span><strong>OS:</strong> {di.os}</span>
                            <span style={{ color: '#d1d5db' }}>·</span>
                            <span><strong>Device:</strong> {di.deviceType}</span>
                            <span style={{ color: '#d1d5db' }}>·</span>
                            <span><strong>Screen:</strong> {di.screenResolution}</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                            <span><strong>Tab:</strong> {di.currentTab}</span>
                            <span style={{ color: '#d1d5db' }}>·</span>
                            <span><strong>Pantry items:</strong> {di.pantryItemCount}</span>
                            <span style={{ color: '#d1d5db' }}>·</span>
                            <span><strong>Saved recipes:</strong> {di.savedRecipeCount}</span>
                            <span style={{ color: '#d1d5db' }}>·</span>
                            <span><strong>Version:</strong> {di.appVersion}</span>
                          </div>
                          {di.recentLogs?.length > 0 && (
                            <DebugCollapsible title={`Recent Logs (${di.recentLogs.length})`}>
                              <div style={{
                                background: '#1f2937', borderRadius: 6, padding: 10,
                                fontFamily: 'monospace', fontSize: 11,
                                maxHeight: 200, overflowY: 'auto', overflowX: 'auto',
                              }}>
                                {di.recentLogs.map((log, i) => (
                                  <div key={i} style={{
                                    color: log.level === 'error' ? '#f87171' : log.level === 'warn' ? '#fbbf24' : '#9ca3af',
                                    marginBottom: 2,
                                  }}>
                                    <span style={{ color: '#4b5563' }}>{(log.timestamp || '').slice(11, 19)}</span>
                                    {' '}<span style={{ fontWeight: 700 }}>[{(log.level || '').toUpperCase()}]</span>
                                    {' '}{log.message}
                                  </div>
                                ))}
                              </div>
                            </DebugCollapsible>
                          )}
                          {di.recentErrors?.length > 0 && (
                            <DebugCollapsible title={`Recent Errors (${di.recentErrors.length})`}>
                              <div style={{
                                background: '#1f2937', borderRadius: 6, padding: 10,
                                fontFamily: 'monospace', fontSize: 11,
                                maxHeight: 200, overflowY: 'auto',
                              }}>
                                {di.recentErrors.map((err, i) => (
                                  <div key={i} style={{ color: '#f87171', marginBottom: 8 }}>
                                    <div>{(err.timestamp || '').slice(11, 19)} [ERROR] {err.message}</div>
                                    {err.stack && (
                                      <div style={{ color: '#6b7280', paddingLeft: 8, fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                        {String(err.stack).slice(0, 400)}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </DebugCollapsible>
                          )}
                        </div>
                      )}

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
        </>
      )}
    </div>
  );
}
