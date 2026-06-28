import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../firebase';

const PAGE_SIZE = 20;

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} style={{ padding: '10px 12px' }}>
          <div style={{ height: 14, background: '#f3f4f6', borderRadius: 4, width: i === 0 ? '60%' : '40%' }} />
        </td>
      ))}
    </tr>
  );
}

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [deletions, setDeletions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);

  useEffect(() => { loadUsers(); loadDeletions(); }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.displayName || data.name || '',
          email: data.email || '',
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt || 0),
          pantryCount: data.pantryCount || 0,
          recipeCount: data.recipeCount || 0,
          cookCount: data.cookCount || 0,
        };
      });
      setUsers(list);
    } catch (err) {
      console.error('[Users] Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadDeletions() {
    try {
      const snap = await getDocs(collection(db, 'pending_deletions'));
      setDeletions(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          email: data.email || '',
          requestedAt: data.requestedAt?.toDate?.() || new Date(0),
          scheduledFor: data.scheduledFor?.toDate?.() || new Date(0),
          status: data.status || 'pending',
        };
      }));
    } catch (err) {
      console.error('[Deletions] Load error:', err);
    }
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
    setPage(0);
  }

  const filtered = useMemo(() => {
    let list = [...users];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (av instanceof Date) { av = av.getTime(); bv = bv?.getTime?.() || 0; }
      if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv || '').toLowerCase(); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [users, search, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageUsers = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const thStyle = (key) => ({
    padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left',
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
    background: sortKey === key ? '#f0fdf4' : 'transparent',
  });

  const arrow = (key) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Users</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        {loading ? 'Loading...' : `${users.length} registered user${users.length !== 1 ? 's' : ''}`}
      </p>

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
        {[
          { key: 'users', label: 'All Users' },
          { key: 'deletions', label: `Pending Deletions${deletions.length ? ` (${deletions.length})` : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: activeTab === t.key ? 600 : 400,
            color: activeTab === t.key ? '#10b981' : '#6b7280',
            background: 'none', border: 'none',
            borderBottom: `2px solid ${activeTab === t.key ? '#10b981' : 'transparent'}`,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'deletions' && (
        <div style={{
          background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
          overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 24,
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', textAlign: 'left' }}>Email</th>
                  <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', textAlign: 'left' }}>Requested</th>
                  <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', textAlign: 'left' }}>Scheduled For</th>
                  <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {deletions.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No pending deletions.</td></tr>
                )}
                {deletions.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ padding: '10px 12px', color: '#374151' }}>{d.email || d.id}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{d.requestedAt instanceof Date && !isNaN(d.requestedAt) ? format(d.requestedAt, 'MMM d, yyyy HH:mm') : '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{d.scheduledFor instanceof Date && !isNaN(d.scheduledFor) ? format(d.scheduledFor, 'MMM d, yyyy') : '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                        background: d.status === 'pending' ? '#fef3c7' : '#f3f4f6',
                        color: d.status === 'pending' ? '#92400e' : '#6b7280',
                      }}>{d.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
      <>
      <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
        placeholder="Search by name or email..."
        style={{
          width: '100%', maxWidth: 360, height: 38, border: '1px solid #e5e7eb',
          borderRadius: 8, padding: '0 12px', fontSize: 13, fontFamily: 'inherit',
          outline: 'none', marginBottom: 16, boxSizing: 'border-box',
        }} />

      <div style={{
        background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
        overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                <th onClick={() => toggleSort('name')} style={thStyle('name')}>Name{arrow('name')}</th>
                <th onClick={() => toggleSort('email')} style={thStyle('email')}>Email{arrow('email')}</th>
                <th onClick={() => toggleSort('createdAt')} style={thStyle('createdAt')}>Joined{arrow('createdAt')}</th>
                <th onClick={() => toggleSort('pantryCount')} style={thStyle('pantryCount')}>Pantry{arrow('pantryCount')}</th>
                <th onClick={() => toggleSort('recipeCount')} style={thStyle('recipeCount')}>Recipes{arrow('recipeCount')}</th>
                <th onClick={() => toggleSort('cookCount')} style={thStyle('cookCount')}>Cooks{arrow('cookCount')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
              {!loading && pageUsers.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500, color: '#111827' }}>{u.name || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>{u.email}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>
                    {u.createdAt instanceof Date && !isNaN(u.createdAt) ? format(u.createdAt, 'MMM d, yyyy') : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#374151', textAlign: 'center' }}>{u.pantryCount}</td>
                  <td style={{ padding: '10px 12px', color: '#374151', textAlign: 'center' }}>{u.recipeCount}</td>
                  <td style={{ padding: '10px 12px', color: '#374151', textAlign: 'center' }}>{u.cookCount}</td>
                </tr>
              ))}
              {!loading && pageUsers.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 16px', borderTop: '1px solid #f0f0f0', fontSize: 12, color: '#6b7280',
          }}>
            <span>Page {page + 1} of {totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb',
                  background: '#fff', color: page === 0 ? '#d1d5db' : '#374151',
                  cursor: page === 0 ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12,
                }}>Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb',
                  background: '#fff', color: page >= totalPages - 1 ? '#d1d5db' : '#374151',
                  cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12,
                }}>Next</button>
            </div>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
