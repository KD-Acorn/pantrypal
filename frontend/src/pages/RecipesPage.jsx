import { useState, useMemo } from 'react';
import RecipeCard from '../components/RecipeCard';

const SORT_OPTIONS = [
  { key: 'date', label: 'Date Saved' },
  { key: 'score', label: 'Match Score' },
  { key: 'rating', label: 'Rating' },
  { key: 'time', label: 'Cook Time' },
];

const CUISINE_FILTERS = ['All', 'Italian', 'Asian', 'Mexican', 'Quick & Easy', 'Mediterranean'];
const DIFF_FILTERS = ['All', 'Easy', 'Medium', 'Hard'];
const TIME_FILTERS = [
  { key: 'any', label: 'Any' },
  { key: '15', label: 'Under 15 min' },
  { key: '30', label: 'Under 30 min' },
  { key: '60', label: 'Under 1 hour' },
];

function parseMins(cookTime) {
  if (!cookTime) return Infinity;
  const m = cookTime.match(/(\d+)/);
  if (!m) return Infinity;
  const n = parseInt(m[1], 10);
  if (/hour|hr/i.test(cookTime)) return n * 60;
  return n;
}

export default function RecipesPage({ saved, pantry, toast, onSwitchTab }) {
  const [expandedId, setExpandedId] = useState(null);
  const [sort, setSort] = useState('date');
  const [cuisineFilter, setCuisineFilter] = useState('All');
  const [diffFilter, setDiffFilter] = useState('All');
  const [timeFilter, setTimeFilter] = useState('any');

  const hasActiveFilter = cuisineFilter !== 'All' || diffFilter !== 'All' || timeFilter !== 'any';

  const filtered = useMemo(() => {
    let list = [...saved.items];

    if (cuisineFilter !== 'All') list = list.filter(r => (r.cuisine || '').toLowerCase().includes(cuisineFilter.toLowerCase()));
    if (diffFilter !== 'All') list = list.filter(r => r.difficulty === diffFilter);
    if (timeFilter !== 'any') {
      const maxMins = parseInt(timeFilter, 10);
      list = list.filter(r => parseMins(r.cookTime) <= maxMins);
    }

    if (sort === 'date') list.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
    else if (sort === 'score') list.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    else if (sort === 'rating') list.sort((a, b) => (b.userRating || saved.ratings[b.title] || 0) - (a.userRating || saved.ratings[a.title] || 0));
    else if (sort === 'time') list.sort((a, b) => parseMins(a.cookTime) - parseMins(b.cookTime));

    return list;
  }, [saved.items, saved.ratings, sort, cuisineFilter, diffFilter, timeFilter]);

  const pill = (label, active, onClick) => (
    <button onClick={onClick} style={{
      fontSize: 11, fontWeight: active ? 600 : 400, padding: '5px 12px', borderRadius: 20,
      border: active ? 'none' : '1px solid #e5e7eb', cursor: 'pointer', fontFamily: 'inherit',
      background: active ? '#10b981' : '#fff', color: active ? '#fff' : '#6b7280',
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>{label}</button>
  );

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>My Recipes</h1>
        {saved.items.length > 0 && (
          <span style={{
            fontSize: 12, fontWeight: 600, background: '#f3f4f6', color: '#374151',
            padding: '2px 10px', borderRadius: 20,
          }}>{saved.items.length}</span>
        )}
      </div>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        Your saved recipe collection
      </p>

      {saved.items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📖</div>
          <div style={{ fontSize: 14, marginBottom: 16 }}>No saved recipes yet. Find recipes on the Discover tab and tap the bookmark to save them.</div>
          <button onClick={() => onSwitchTab('discover')} style={{
            fontSize: 14, fontWeight: 600, padding: '10px 24px', borderRadius: 10,
            background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>Go to Discover</button>
        </div>
      ) : (
        <>
          {/* Sort + filter bar */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 10, background: '#fff',
            paddingBottom: 12, marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>Sort:</span>
              <select value={sort} onChange={e => setSort(e.target.value)} style={{
                height: 32, border: '1px solid #e5e7eb', borderRadius: 8,
                padding: '0 8px', fontSize: 12, fontFamily: 'inherit', background: '#fff',
              }}>
                {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              {hasActiveFilter && (
                <button onClick={() => { setCuisineFilter('All'); setDiffFilter('All'); setTimeFilter('any'); }}
                  style={{ fontSize: 11, color: '#10b981', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>
                  Clear filters
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {CUISINE_FILTERS.map(c => pill(c, cuisineFilter === c, () => setCuisineFilter(c)))}
              <span style={{ width: 1, background: '#e5e7eb', flexShrink: 0 }} />
              {DIFF_FILTERS.map(d => pill(d, diffFilter === d, () => setDiffFilter(d)))}
              <span style={{ width: 1, background: '#e5e7eb', flexShrink: 0 }} />
              {TIME_FILTERS.map(t => pill(t.label, timeFilter === t.key, () => setTimeFilter(t.key)))}
            </div>
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>
              No recipes match your filters.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(r => (
              <RecipeCard
                key={r.id}
                recipe={r}
                pantryItems={pantry.items}
                ratings={saved.ratings}
                onRate={(title, stars) => saved.updateRating(title, stars)}
                collapsed={expandedId !== r.id}
                onToggleCollapse={() => setExpandedId(prev => prev === r.id ? null : r.id)}
                isSaved={true}
                onUnsave={(recipe) => { saved.unsave(r.id); toast.show('Recipe removed', 'info'); }}
                mode="saved"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
