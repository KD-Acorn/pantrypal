import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAdminAuth } from '../context/AdminAuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3003';

function StatCard({ icon, label, value, loading, sub }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
      padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{loading ? '...' : value}</div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: '#d1d5db', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SeedPanel({ title, note, running, onRun, onStop, logs, logsRef, stats }) {
  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 4 }}>{title}</div>
      {note && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>{note}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onRun} disabled={running} style={{
          padding: '7px 18px', borderRadius: 8, border: 'none',
          background: running ? '#d1d5db' : '#22c55e', color: '#fff',
          fontSize: 12, fontWeight: 600, cursor: running ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>🌱 {running ? 'Running...' : 'Run'}</button>
        {running && (
          <button onClick={onStop} style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid #ef4444',
            background: '#fff', color: '#ef4444', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>⏹ Stop</button>
        )}
      </div>
      {stats && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>{stats}</div>}
      {logs.length > 0 && (
        <div ref={logsRef} style={{
          marginTop: 8, background: '#1a1a2e', borderRadius: 8, padding: 10,
          maxHeight: 160, overflow: 'auto', fontFamily: 'monospace', fontSize: 10,
        }}>
          {logs.map((log, i) => (
            <div key={i} style={{
              color: log.startsWith('Error') || log.startsWith('Fatal') ? '#ef4444'
                : log.startsWith('Saved') ? '#22c55e'
                : log.startsWith('Done') ? '#60a5fa' : '#9ca3af',
              marginBottom: 2,
            }}>{log}</div>
          ))}
        </div>
      )}
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
  const [catalogTab, setCatalogTab] = useState('recipes');

  // ── Recipes state ──────────────────────────────────────────────────────────
  const [stats, setStats] = useState({ total: 0, bySource: {}, hasNutrition: 0 });
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

  // ── Drinks state ───────────────────────────────────────────────────────────
  const [drinkStats, setDrinkStats] = useState(null);
  const [drinkStatsLoading, setDrinkStatsLoading] = useState(false);
  const [drinks, setDrinks] = useState([]);
  const [drinksTotal, setDrinksTotal] = useState(0);
  const [drinkPage, setDrinkPage] = useState(1);
  const [drinkSourceFilter, setDrinkSourceFilter] = useState('');
  const [drinkCatFilter, setDrinkCatFilter] = useState('');
  const [drinkSearch, setDrinkSearch] = useState('');

  const [cocktailRunning, setCocktailRunning] = useState(false);
  const [cocktailLogs, setCocktailLogs] = useState([]);
  const [cocktailStats, setCocktailStats] = useState(null);
  const cocktailPollRef = useRef(null);
  const cocktailLogsRef = useRef(null);

  const [bevRunning, setBevRunning] = useState(false);
  const [bevLogs, setBevLogs] = useState([]);
  const [bevStats, setBevStats] = useState(null);
  const bevPollRef = useRef(null);
  const bevLogsRef = useRef(null);

  async function getToken() {
    return currentUser?.getIdToken?.() || null;
  }

  // ── Recipe data loaders ────────────────────────────────────────────────────
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
      setStats({ total: snap.size, bySource, hasNutrition });
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

  // ── Drink data loaders ─────────────────────────────────────────────────────
  async function loadDrinkStats() {
    setDrinkStatsLoading(true);
    try {
      const token = await getToken();
      const resp = await fetch(`${API}/api/admin/beverage-catalog/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) setDrinkStats(await resp.json());
    } catch (err) { console.error('Drink stats error:', err); }
    finally { setDrinkStatsLoading(false); }
  }

  async function loadDrinks() {
    try {
      const token = await getToken();
      const params = new URLSearchParams({ page: drinkPage, limit: PAGE_SIZE });
      if (drinkSourceFilter) params.set('source', drinkSourceFilter);
      if (drinkCatFilter) params.set('category', drinkCatFilter);
      if (drinkSearch) params.set('search', drinkSearch);
      const resp = await fetch(`${API}/api/admin/beverage-catalog/drinks?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setDrinks(data.drinks || []);
        setDrinksTotal(data.total || 0);
      }
    } catch (err) { console.error('Drinks load error:', err); }
  }

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => { loadStats(); }, []);
  useEffect(() => { loadRecipes(); }, [page, sourceFilter, search]);
  useEffect(() => {
    if (catalogTab === 'drinks') { loadDrinkStats(); loadDrinks(); }
  }, [catalogTab]);
  useEffect(() => { if (catalogTab === 'drinks') loadDrinks(); }, [drinkPage, drinkSourceFilter, drinkCatFilter, drinkSearch]);

  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
  }, [seedLogs]);
  useEffect(() => {
    if (cocktailLogsRef.current) cocktailLogsRef.current.scrollTop = cocktailLogsRef.current.scrollHeight;
  }, [cocktailLogs]);
  useEffect(() => {
    if (bevLogsRef.current) bevLogsRef.current.scrollTop = bevLogsRef.current.scrollHeight;
  }, [bevLogs]);
  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (cocktailPollRef.current) clearInterval(cocktailPollRef.current);
    if (bevPollRef.current) clearInterval(bevPollRef.current);
  }, []);

  // ── Recipe seed handlers ───────────────────────────────────────────────────
  async function handleSeed() {
    const token = await getToken();
    if (!token) return;
    const ingredients = seedInput.split('\n').map(s => s.trim()).filter(Boolean);
    setSeedRunning(true); setSeedLogs(['Starting seed...']); setSeedStats(null);
    try {
      await fetch(`${API}/api/admin/seed-catalog`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients }),
      });
    } catch {}
    pollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${API}/api/admin/seed-catalog/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await resp.json();
        setSeedLogs(data.logs || []);
        setSeedStats({ saved: data.saved, points: data.pointsUsed });
        if (!data.running) { clearInterval(pollRef.current); setSeedRunning(false); loadStats(); loadRecipes(); }
      } catch {}
    }, 2000);
  }

  async function handleStopSeed() {
    const token = await getToken();
    if (!token) return;
    try { await fetch(`${API}/api/admin/seed-catalog/stop`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch {}
  }

  // ── Cocktail seed handlers ─────────────────────────────────────────────────
  async function handleSeedCocktails() {
    const token = await getToken();
    if (!token) return;
    setCocktailRunning(true); setCocktailLogs(['Starting CocktailDB seed...']); setCocktailStats(null);
    try {
      await fetch(`${API}/api/admin/seed-cocktails`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } catch {}
    cocktailPollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${API}/api/admin/seed-cocktails/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await resp.json();
        setCocktailLogs(data.logs || []);
        setCocktailStats(`Seeded: ${data.seeded} | Skipped: ${data.skipped} | Errors: ${data.errors}`);
        if (!data.running) {
          clearInterval(cocktailPollRef.current);
          setCocktailRunning(false);
          loadDrinkStats(); loadDrinks();
        }
      } catch {}
    }, 2000);
  }

  async function handleStopCocktails() {
    const token = await getToken();
    if (!token) return;
    try { await fetch(`${API}/api/admin/seed-cocktails/stop`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch {}
  }

  // ── Beverage seed handlers ─────────────────────────────────────────────────
  async function handleSeedBeverages() {
    const token = await getToken();
    if (!token) return;
    setBevRunning(true); setBevLogs(['Starting Tasty/Spoonacular beverage seed...']); setBevStats(null);
    try {
      await fetch(`${API}/api/admin/seed-beverages`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } catch {}
    bevPollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${API}/api/admin/seed-beverages/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await resp.json();
        setBevLogs(data.logs || []);
        setBevStats(`Saved: ${data.saved} | Tasty requests: ${data.requestsUsed}`);
        if (!data.running) {
          clearInterval(bevPollRef.current);
          setBevRunning(false);
          loadDrinkStats(); loadDrinks();
        }
      } catch {}
    }, 2000);
  }

  async function handleStopBeverages() {
    const token = await getToken();
    if (!token) return;
    try { await fetch(`${API}/api/admin/seed-beverages/stop`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch {}
  }

  // ── Delete handlers ────────────────────────────────────────────────────────
  async function handleDeleteRecipe(id) {
    try { await deleteDoc(doc(db, 'recipe_catalog', id)); loadRecipes(); loadStats(); } catch (err) { console.error(err); }
  }

  async function handleDeleteDrink(id) {
    try {
      const token = await getToken();
      await fetch(`${API}/api/admin/beverage-catalog/drinks/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      loadDrinks(); loadDrinkStats();
    } catch (err) { console.error(err); }
  }

  const totalPages = Math.ceil(recipesTotal / PAGE_SIZE);
  const drinkTotalPages = Math.ceil(drinksTotal / PAGE_SIZE);

  const tabBtn = (key, label) => (
    <button onClick={() => setCatalogTab(key)} style={{
      padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      fontSize: 13, fontWeight: 600,
      background: catalogTab === key ? '#111827' : '#f3f4f6',
      color: catalogTab === key ? '#fff' : '#6b7280',
    }}>{label}</button>
  );

  const srcBadgeColor = (src) => {
    const map = { cocktaildb: ['#fef3c7', '#92400e'], tasty: ['#ecfdf5', '#065f46'], spoonacular: ['#eff6ff', '#1d4ed8'], ai: ['#f5f3ff', '#5b21b6'], spoonacular_bev: ['#eff6ff', '#1d4ed8'] };
    return map[src] || ['#f3f4f6', '#374151'];
  };

  const fmtDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString();
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>📚 Catalog Management</h1>
      <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>Manage recipe and drink catalogs that serve content without live API calls.</p>

      {/* Tab toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, background: '#f3f4f6', borderRadius: 10, padding: 4, alignSelf: 'flex-start', width: 'fit-content' }}>
        {tabBtn('recipes', '🍽 Recipes')}
        {tabBtn('drinks', '🍹 Drinks')}
      </div>

      {/* ── RECIPES TAB ─────────────────────────────────────────────────────── */}
      {catalogTab === 'recipes' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
            <StatCard icon="📦" label="Total Recipes" value={stats.total} loading={loading} />
            <StatCard icon="🥄" label="Spoonacular" value={stats.bySource.spoonacular || 0} loading={loading} />
            <StatCard icon="🍽" label="TheMealDB" value={stats.bySource.themealdb || 0} loading={loading} />
            <StatCard icon="🥗" label="Edamam" value={stats.bySource.edamam || 0} loading={loading} />
            <StatCard icon="🧪" label="Has Nutrition" value={stats.hasNutrition} loading={loading} />
          </div>

          <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 }}>Seed Catalog</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
              Fetch new recipes from Spoonacular and add to catalog. Uses ~45 Spoonacular points per run. Resets daily.
            </div>
            <textarea value={seedInput} onChange={e => setSeedInput(e.target.value)} rows={6} disabled={seedRunning}
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', marginBottom: 10, boxSizing: 'border-box', color: '#374151' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSeed} disabled={seedRunning} style={{
                padding: '8px 20px', borderRadius: 8, border: 'none',
                background: seedRunning ? '#d1d5db' : '#22c55e', color: '#fff',
                fontSize: 13, fontWeight: 600, cursor: seedRunning ? 'default' : 'pointer', fontFamily: 'inherit',
              }}>🌱 {seedRunning ? 'Running...' : 'Run Catalog Seed'}</button>
              {seedRunning && (
                <button onClick={handleStopSeed} style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid #ef4444',
                  background: '#fff', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>⏹ Stop</button>
              )}
            </div>
            {seedStats && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Saved: {seedStats.saved} recipes · Points used: ~{seedStats.points}</div>}
            {seedLogs.length > 0 && (
              <div ref={logsEndRef} style={{ marginTop: 10, background: '#1a1a2e', borderRadius: 8, padding: 12, maxHeight: 200, overflow: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
                {seedLogs.map((log, i) => (
                  <div key={i} style={{ color: log.startsWith('Error') ? '#ef4444' : log.startsWith('Saved') ? '#22c55e' : '#9ca3af', marginBottom: 2 }}>{log}</div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 12 }}>Browse Recipes</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search recipes..."
                style={{ flex: 1, height: 36, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 13, fontFamily: 'inherit' }} />
              <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
                style={{ height: 36, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 10px', fontSize: 13, fontFamily: 'inherit', color: '#374151' }}>
                <option value="">All Sources</option>
                <option value="spoonacular">Spoonacular</option>
                <option value="themealdb">TheMealDB</option>
                <option value="edamam">Edamam</option>
              </select>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>{recipesTotal} recipe{recipesTotal !== 1 ? 's' : ''} · Page {page} of {totalPages || 1}</div>
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
                    <td style={{ padding: 6, width: 40 }}>
                      {r.thumbnail ? <img src={r.thumbnail} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
                        : <div style={{ width: 36, height: 36, borderRadius: 6, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🍽</div>}
                    </td>
                    <td style={{ padding: 6, fontWeight: 500, color: '#111827', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</td>
                    <td style={{ padding: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: r.source === 'spoonacular' ? '#ecfdf5' : r.source === 'themealdb' ? '#eff6ff' : '#fefce8', color: r.source === 'spoonacular' ? '#065f46' : r.source === 'themealdb' ? '#1d4ed8' : '#92400e' }}>{r.source}</span>
                    </td>
                    <td style={{ padding: 6, color: '#6b7280' }}>{r.cuisine || '—'}</td>
                    <td style={{ padding: 6, color: '#6b7280' }}>{r.useCount || 0}</td>
                    <td style={{ padding: 6 }}>{r.nutrition?.calories > 0 ? <span style={{ fontSize: 10, color: '#22c55e' }}>✓</span> : <span style={{ fontSize: 10, color: '#d1d5db' }}>—</span>}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>
                      <button onClick={() => handleDeleteRecipe(r.id)} style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                    </td>
                  </tr>
                ))}
                {recipes.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No recipes found</td></tr>}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: page === 1 ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12, color: page === 1 ? '#d1d5db' : '#374151' }}>← Prev</button>
                <span style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center' }}>{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: page === totalPages ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12, color: page === totalPages ? '#d1d5db' : '#374151' }}>Next →</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── DRINKS TAB ──────────────────────────────────────────────────────── */}
      {catalogTab === 'drinks' && (
        <>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 16 }}>
            <StatCard icon="🍹" label="Total Drinks" value={drinkStats?.total ?? '—'} loading={drinkStatsLoading} />
            <StatCard icon="🍸" label="TheCocktailDB" value={drinkStats?.bySource?.cocktaildb ?? '—'} loading={drinkStatsLoading} />
            <StatCard icon="🥤" label="Tasty" value={drinkStats?.bySource?.tasty ?? '—'} loading={drinkStatsLoading} />
            <StatCard icon="🥄" label="Spoonacular" value={drinkStats?.bySource?.spoonacular ?? '—'} loading={drinkStatsLoading} />
            <StatCard icon="🤖" label="AI Generated" value={drinkStats?.bySource?.ai ?? '—'} loading={drinkStatsLoading} />
            <StatCard icon="🔞" label="Alcoholic / Non-Alc" value={drinkStats ? `${drinkStats.alcoholic} / ${drinkStats.nonAlcoholic}` : '—'} loading={drinkStatsLoading} />
          </div>
          {drinkStats && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 20 }}>
              Last cocktail seed: {fmtDate(drinkStats.lastCocktailSeed)} · Last beverage seed: {fmtDate(drinkStats.lastBeverageSeed)}
              &nbsp;·&nbsp; Smoothie: {drinkStats.byCategory?.smoothie ?? 0} · Juice: {drinkStats.byCategory?.juice ?? 0} · Milkshake: {drinkStats.byCategory?.milkshake ?? 0} · Cocktail: {drinkStats.byCategory?.cocktail ?? 0}
            </div>
          )}

          {/* Seed section */}
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 16 }}>Seed Drinks</div>
            <SeedPanel
              title="🍸 Seed Cocktails (TheCocktailDB)"
              note="Free, no rate limit — fetches entire A–Z catalog. Skip existing docs automatically."
              running={cocktailRunning}
              onRun={handleSeedCocktails}
              onStop={handleStopCocktails}
              logs={cocktailLogs}
              logsRef={cocktailLogsRef}
              stats={cocktailStats}
            />
            <SeedPanel
              title="🥤 Seed Smoothies / Juices / Milkshakes (Tasty API)"
              note="Free tier — limited requests/month, seeding stops automatically when quota is hit. Requires RAPIDAPI_KEY in .env. Falls back to Spoonacular if key is missing."
              running={bevRunning}
              onRun={handleSeedBeverages}
              onStop={handleStopBeverages}
              logs={bevLogs}
              logsRef={bevLogsRef}
              stats={bevStats}
            />
          </div>

          {/* Catalog browser */}
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 12 }}>Browse Drinks</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input value={drinkSearch} onChange={e => { setDrinkSearch(e.target.value); setDrinkPage(1); }} placeholder="Search drinks..."
                style={{ flex: 1, minWidth: 160, height: 36, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 13, fontFamily: 'inherit' }} />
              <select value={drinkCatFilter} onChange={e => { setDrinkCatFilter(e.target.value); setDrinkPage(1); }}
                style={{ height: 36, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 10px', fontSize: 13, fontFamily: 'inherit', color: '#374151' }}>
                <option value="">All Categories</option>
                <option value="cocktail">Cocktail</option>
                <option value="smoothie">Smoothie</option>
                <option value="juice">Juice</option>
                <option value="milkshake">Milkshake</option>
              </select>
              <select value={drinkSourceFilter} onChange={e => { setDrinkSourceFilter(e.target.value); setDrinkPage(1); }}
                style={{ height: 36, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 10px', fontSize: 13, fontFamily: 'inherit', color: '#374151' }}>
                <option value="">All Sources</option>
                <option value="cocktaildb">TheCocktailDB</option>
                <option value="tasty">Tasty</option>
                <option value="spoonacular">Spoonacular</option>
                <option value="ai">AI</option>
              </select>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>{drinksTotal} drink{drinksTotal !== 1 ? 's' : ''} · Page {drinkPage} of {drinkTotalPages || 1}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px', color: '#9ca3af', fontWeight: 500, fontSize: 11 }}></th>
                  <th style={{ padding: '8px 6px', color: '#9ca3af', fontWeight: 500, fontSize: 11 }}>Title</th>
                  <th style={{ padding: '8px 6px', color: '#9ca3af', fontWeight: 500, fontSize: 11 }}>Category</th>
                  <th style={{ padding: '8px 6px', color: '#9ca3af', fontWeight: 500, fontSize: 11 }}>Source</th>
                  <th style={{ padding: '8px 6px', color: '#9ca3af', fontWeight: 500, fontSize: 11 }}>Alc.</th>
                  <th style={{ padding: '8px 6px', color: '#9ca3af', fontWeight: 500, fontSize: 11 }}>Uses</th>
                  <th style={{ padding: '8px 6px', color: '#9ca3af', fontWeight: 500, fontSize: 11 }}></th>
                </tr>
              </thead>
              <tbody>
                {drinks.map(d => {
                  const [bg, fg] = srcBadgeColor(d.source);
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                      <td style={{ padding: 6, width: 40 }}>
                        {d.thumbnail ? <img src={d.thumbnail} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
                          : <div style={{ width: 36, height: 36, borderRadius: 6, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🍹</div>}
                      </td>
                      <td style={{ padding: 6, fontWeight: 500, color: '#111827', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</td>
                      <td style={{ padding: 6 }}>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#f3f4f6', color: '#374151' }}>{d.category}</span>
                      </td>
                      <td style={{ padding: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: bg, color: fg }}>{d.source}</span>
                      </td>
                      <td style={{ padding: 6 }}>
                        {d.isAlcoholic
                          ? <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>🍺</span>
                          : <span style={{ fontSize: 10, color: '#22c55e' }}>✓</span>}
                      </td>
                      <td style={{ padding: 6, color: '#6b7280' }}>{d.useCount || 0}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>
                        <button onClick={() => handleDeleteDrink(d.id)} style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
                {drinks.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No drinks found</td></tr>}
              </tbody>
            </table>
            {drinkTotalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                <button onClick={() => setDrinkPage(p => Math.max(1, p - 1))} disabled={drinkPage === 1} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: drinkPage === 1 ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12, color: drinkPage === 1 ? '#d1d5db' : '#374151' }}>← Prev</button>
                <span style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center' }}>{drinkPage} / {drinkTotalPages}</span>
                <button onClick={() => setDrinkPage(p => Math.min(drinkTotalPages, p + 1))} disabled={drinkPage === drinkTotalPages} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: drinkPage === drinkTotalPages ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12, color: drinkPage === drinkTotalPages ? '#d1d5db' : '#374151' }}>Next →</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
