import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, doc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAdminAuth } from '../context/AdminAuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3003';

function StatCard({ icon, label, value, loading }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
      padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>{loading ? '...' : value}</div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const DEFAULT_INGREDIENTS = [
  'chicken breast', 'ground beef', 'eggs', 'salmon', 'shrimp', 'tofu', 'pork',
  'pasta', 'rice', 'garlic', 'onion', 'tomato', 'potato', 'broccoli',
  'cheese', 'butter', 'chicken garlic', 'beef onion', 'pasta tomato',
  'rice chicken', 'salmon lemon', 'shrimp garlic butter',
].join('\n');

const PAGE_SIZE = 20;

export default function CatalogPage() {
  const { currentUser } = useAdminAuth();
  const [stats, setStats] = useState({ total: 0, bySource: {}, hasNutrition: 0, lastSync: null });
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState([]);
  const [recipesTotal, setRecipesTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sourceFilter, setSourceFilter] = useState('');
  const [search, setSearch] = useState('');

  const [seedInput, setSeedInput] = useState(DEFAULT_INGREDIENTS);
  const [seedRunning, setSeedRunning] = useState(false);
  const [seedLogs, setSeedLogs] = useState([]);
  const [seedStats, setSeedStats] = useState(null);
  const pollRef = useRef(null);
  const logsEndRef = useRef(null);

  async function getToken() {
    return currentUser?.getIdToken?.() || null;
  }

  async function loadStats() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'recipe_catalog'));
      const bySource = { spoonacular: 0, themealdb: 0, edamam: 0 };
      let hasNutrition = 0;
      for (const d of snap.docs) {
        const data = d.data();
        if (bySource[data.source] !== undefined) bySource[data.source]++;
        if (data.nutrition?.calories > 0) hasNutrition++;
      }
      setStats({ total: snap.size, bySource, hasNutrition, lastSync: null });
    } catch (err) { console.error('Stats error:', err); }
    finally { setLoading(false); }
  }

  async function loadRecipes() {
    try {
      const snap = await getDocs(collection(db, 'recipe_catalog'));
      let all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (sourceFilter) all = all.filter(r => r.source === sourceFilter);
      if (search) {
        const s = search.toLowerCase();
        all = all.filter(r => r.title?.toLowerCase().includes(s) || r.cuisine?.toLowerCase().includes(s));
      }
      all.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));
      setRecipesTotal(all.length);
      setRecipes(all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
    } catch (err) { console.error('Recipes error:', err); }
  }

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { loadRecipes(); }, [page, sourceFilter, search]);

  async function handleSeed() {
    const token = await getToken();
    if (!token) return;
    const ingredients = seedInput.split('\n').map(s => s.trim()).filter(Boolean);
    setSeedRunning(true);
    setSeedLogs(['Starting seed...']);
    setSeedStats(null);

    try {
      await fetch(`${API}/api/admin/seed-catalog`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients }),
      });
    } catch {}

    pollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${API}/api/admin/seed-catalog/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json();
        setSeedLogs(data.logs || []);
        setSeedStats({ saved: data.saved, points: data.pointsUsed });
        if (!data.running) {
          clearInterval(pollRef.current);
          setSeedRunning(false);
          loadStats();
          loadRecipes();
        }
      } catch {}
    }, 2000);
  }

  async function handleStop() {
    const token = await getToken();
    if (!token) return;
    try {
      await fetch(`${API}/api/admin/seed-catalog/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }

  async function handleDelete(id) {
    try {
      await deleteDoc(doc(db, 'recipe_catalog', id));
      loadRecipes();
      loadStats();
    } catch (err) { console.error('Delete error:', err); }
  }

  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
  }, [seedLogs]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const totalPages = Math.ceil(recipesTotal / PAGE_SIZE);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>📚 Recipe Catalog</h1>
      <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>Manage the recipe catalog that serves recipes without API calls.</p>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard icon="📦" label="Total Recipes" value={stats.total} loading={loading} />
        <StatCard icon="🥄" label="Spoonacular" value={stats.bySource.spoonacular || 0} loading={loading} />
        <StatCard icon="🍽" label="TheMealDB" value={stats.bySource.themealdb || 0} loading={loading} />
        <StatCard icon="🥗" label="Edamam" value={stats.bySource.edamam || 0} loading={loading} />
        <StatCard icon="🧪" label="Has Nutrition" value={stats.hasNutrition} loading={loading} />
      </div>

      {/* Seed section */}
      <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 }}>Seed Catalog</div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
          Fetch new recipes from Spoonacular and add to catalog. Uses ~45 Spoonacular points per run. Resets daily.
        </div>

        <textarea
          value={seedInput}
          onChange={e => setSeedInput(e.target.value)}
          rows={6}
          disabled={seedRunning}
          style={{
            width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px',
            fontSize: 12, fontFamily: 'monospace', resize: 'vertical', marginBottom: 10,
            boxSizing: 'border-box', color: '#374151',
          }}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSeed} disabled={seedRunning} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: seedRunning ? '#d1d5db' : '#22c55e', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: seedRunning ? 'default' : 'pointer', fontFamily: 'inherit',
          }}>🌱 {seedRunning ? 'Running...' : 'Run Catalog Seed'}</button>
          {seedRunning && (
            <button onClick={handleStop} style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid #ef4444',
              background: '#fff', color: '#ef4444', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>⏹ Stop</button>
          )}
        </div>

        {seedStats && (
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
            Saved: {seedStats.saved} recipes · Points used: ~{seedStats.points}
          </div>
        )}

        {seedLogs.length > 0 && (
          <div ref={logsEndRef} style={{
            marginTop: 10, background: '#1a1a2e', borderRadius: 8, padding: 12,
            maxHeight: 200, overflow: 'auto', fontFamily: 'monospace', fontSize: 11,
          }}>
            {seedLogs.map((log, i) => (
              <div key={i} style={{ color: log.startsWith('Error') ? '#ef4444' : log.startsWith('Saved') ? '#22c55e' : '#9ca3af', marginBottom: 2 }}>
                {log}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Catalog browser */}
      <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 12 }}>Browse Catalog</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search recipes..."
            style={{ flex: 1, height: 36, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 13, fontFamily: 'inherit' }}
          />
          <select
            value={sourceFilter}
            onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
            style={{ height: 36, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 10px', fontSize: 13, fontFamily: 'inherit', color: '#374151' }}
          >
            <option value="">All Sources</option>
            <option value="spoonacular">Spoonacular</option>
            <option value="themealdb">TheMealDB</option>
            <option value="edamam">Edamam</option>
          </select>
        </div>

        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
          {recipesTotal} recipe{recipesTotal !== 1 ? 's' : ''} · Page {page} of {totalPages || 1}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'left' }}>
              <th style={{ padding: '8px 6px', color: '#9ca3af', fontWeight: 500, fontSize: 11 }}></th>
              <th style={{ padding: '8px 6px', color: '#9ca3af', fontWeight: 500, fontSize: 11 }}>Title</th>
              <th style={{ padding: '8px 6px', color: '#9ca3af', fontWeight: 500, fontSize: 11 }}>Source</th>
              <th style={{ padding: '8px 6px', color: '#9ca3af', fontWeight: 500, fontSize: 11 }}>Cuisine</th>
              <th style={{ padding: '8px 6px', color: '#9ca3af', fontWeight: 500, fontSize: 11 }}>Uses</th>
              <th style={{ padding: '8px 6px', color: '#9ca3af', fontWeight: 500, fontSize: 11 }}>Nutr.</th>
              <th style={{ padding: '8px 6px', color: '#9ca3af', fontWeight: 500, fontSize: 11 }}></th>
            </tr>
          </thead>
          <tbody>
            {recipes.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                <td style={{ padding: '6px', width: 40 }}>
                  {r.thumbnail ? (
                    <img src={r.thumbnail} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🍽</div>
                  )}
                </td>
                <td style={{ padding: '6px', fontWeight: 500, color: '#111827', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</td>
                <td style={{ padding: '6px' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 10,
                    background: r.source === 'spoonacular' ? '#ecfdf5' : r.source === 'themealdb' ? '#eff6ff' : '#fefce8',
                    color: r.source === 'spoonacular' ? '#065f46' : r.source === 'themealdb' ? '#1d4ed8' : '#92400e',
                  }}>{r.source}</span>
                </td>
                <td style={{ padding: '6px', color: '#6b7280' }}>{r.cuisine || '—'}</td>
                <td style={{ padding: '6px', color: '#6b7280' }}>{r.useCount || 0}</td>
                <td style={{ padding: '6px' }}>
                  {r.nutrition?.calories > 0 ? (
                    <span style={{ fontSize: 10, color: '#22c55e' }}>✓</span>
                  ) : (
                    <span style={{ fontSize: 10, color: '#d1d5db' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '6px', textAlign: 'right' }}>
                  <button onClick={() => handleDelete(r.id)} style={{
                    fontSize: 11, color: '#ef4444', background: 'none', border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>Delete</button>
                </td>
              </tr>
            ))}
            {recipes.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No recipes found</td></tr>
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: page === 1 ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12, color: page === 1 ? '#d1d5db' : '#374151' }}>← Prev</button>
            <span style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center' }}>{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: page === totalPages ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12, color: page === totalPages ? '#d1d5db' : '#374151' }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
