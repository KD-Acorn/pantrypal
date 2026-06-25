import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../firebase';

const PAGE_SIZE = 20;

export default function RecipesPage() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('sharedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => { loadRecipes(); }, []);

  async function loadRecipes() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'public_recipes'));
      setRecipes(snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        sharedAt: d.data().sharedAt?.toDate?.() || new Date(0),
      })));
    } catch (err) {
      console.error('[Recipes] Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    if (recipes.length === 0) return { total: 0, avgRating: 0, topCuisine: '—', topAuthor: '—' };
    const rated = recipes.filter(r => r.ratingCount > 0);
    const avg = rated.length > 0 ? rated.reduce((s, r) => s + (r.rating || 0), 0) / rated.length : 0;

    const cuisineCounts = {};
    const authorCounts = {};
    recipes.forEach(r => {
      if (r.cuisine) cuisineCounts[r.cuisine] = (cuisineCounts[r.cuisine] || 0) + 1;
      if (r.authorName) authorCounts[r.authorName] = (authorCounts[r.authorName] || 0) + 1;
    });
    const topCuisine = Object.entries(cuisineCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    const topAuthor = Object.entries(authorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    return { total: recipes.length, avgRating: avg.toFixed(1), topCuisine, topAuthor };
  }, [recipes]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
    setPage(0);
  }

  const filtered = useMemo(() => {
    let list = [...recipes];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => (r.title || '').toLowerCase().includes(q) || (r.authorName || '').toLowerCase().includes(q));
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
  }, [recipes, search, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRecipes = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const thStyle = (key) => ({
    padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left',
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
    background: sortKey === key ? '#f0fdf4' : 'transparent',
  });
  const arrow = (key) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Recipes</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Community recipe analytics</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { icon: '🍽', label: 'Total Public', value: stats.total },
          { icon: '⭐', label: 'Avg Rating', value: stats.avgRating },
          { icon: '🌍', label: 'Top Cuisine', value: stats.topCuisine },
          { icon: '👨‍🍳', label: 'Top Contributor', value: stats.topAuthor },
        ].map(s => (
          <div key={s.label} style={{
            background: '#fff', border: '1px solid #f0f0f0', borderRadius: 10,
            padding: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
        placeholder="Search by title or author..."
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
                <th onClick={() => toggleSort('title')} style={thStyle('title')}>Title{arrow('title')}</th>
                <th onClick={() => toggleSort('authorName')} style={thStyle('authorName')}>Author{arrow('authorName')}</th>
                <th onClick={() => toggleSort('cuisine')} style={thStyle('cuisine')}>Cuisine{arrow('cuisine')}</th>
                <th onClick={() => toggleSort('rating')} style={thStyle('rating')}>Rating{arrow('rating')}</th>
                <th onClick={() => toggleSort('saveCount')} style={thStyle('saveCount')}>Saves{arrow('saveCount')}</th>
                <th onClick={() => toggleSort('sharedAt')} style={thStyle('sharedAt')}>Shared{arrow('sharedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} style={{ padding: '10px 12px' }}><div style={{ height: 14, background: '#f3f4f6', borderRadius: 4, width: '60%' }} /></td>
                ))}</tr>
              ))}
              {!loading && pageRecipes.map(r => (
                <tr key={r.id} onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  style={{ borderBottom: '1px solid #f9fafb', cursor: 'pointer' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500, color: '#111827' }}>{r.title}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>{r.authorName || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>{r.cuisine || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#374151', textAlign: 'center' }}>
                    {r.ratingCount > 0 ? `${(r.rating || 0).toFixed(1)} (${r.ratingCount})` : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#374151', textAlign: 'center' }}>{r.saveCount || 0}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>
                    {r.sharedAt instanceof Date && !isNaN(r.sharedAt) ? format(r.sharedAt, 'MMM d') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {expandedId && (() => {
          const r = recipes.find(x => x.id === expandedId);
          if (!r) return null;
          return (
            <div style={{ padding: 16, borderTop: '1px solid #f0f0f0', background: '#f9fafb' }}>
              <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>{r.description}</div>
              {r.steps?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Steps ({r.steps.length})</div>
                  <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
                    {r.steps.slice(0, 5).map((s, i) => <li key={i}>{s}</li>)}
                    {r.steps.length > 5 && <li style={{ color: '#9ca3af' }}>...and {r.steps.length - 5} more</li>}
                  </ol>
                </div>
              )}
            </div>
          );
        })()}

        {totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 16px', borderTop: '1px solid #f0f0f0', fontSize: 12, color: '#6b7280',
          }}>
            <span>Page {page + 1} of {totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: page === 0 ? '#d1d5db' : '#374151', cursor: page === 0 ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: page >= totalPages - 1 ? '#d1d5db' : '#374151', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
