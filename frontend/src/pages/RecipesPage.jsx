import { useState, useMemo } from 'react';
import { doc, setDoc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import RecipeCard from '../components/RecipeCard';
import MadeItSheet from '../components/MadeItSheet';
import CustomizeRecipeSheet from '../components/CustomizeRecipeSheet';

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

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RecipesPage({ saved, pantry, toast, onSwitchTab, cookHistory }) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const [expandedId, setExpandedId] = useState(null);
  const [sort, setSort] = useState('date');
  const [cuisineFilter, setCuisineFilter] = useState('All');
  const [diffFilter, setDiffFilter] = useState('All');
  const [timeFilter, setTimeFilter] = useState('any');
  const [madeItRecipe, setMadeItRecipe] = useState(null);
  const [madeItPortions, setMadeItPortions] = useState(2);
  const [customizeRecipe, setCustomizeRecipe] = useState(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [subsExpanded, setSubsExpanded] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);

  async function handleShareToggle(recipe) {
    if (!uid) return;
    try {
      if (recipe.sharedToPublic) {
        if (recipe.publicRecipeId) {
          await deleteDoc(doc(db, 'public_recipes', recipe.publicRecipeId));
        }
        await updateDoc(doc(db, 'saved_recipes', uid, 'recipes', recipe.id), {
          sharedToPublic: false, publicRecipeId: null,
        });
        toast.show('Recipe removed from community', 'info');
      } else {
        const publicId = `pub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await setDoc(doc(db, 'public_recipes', publicId), {
          id: publicId,
          title: recipe.title,
          description: recipe.description || '',
          cookTime: recipe.cookTime || '',
          difficulty: recipe.difficulty || '',
          cuisine: recipe.cuisine || '',
          baseServings: recipe.baseServings || 2,
          ingredients: recipe.ingredients || [],
          steps: recipe.steps || [],
          authorUid: uid,
          authorName: currentUser.displayName || '',
          sharedAt: serverTimestamp(),
          rating: 0, ratingCount: 0, saveCount: 0,
          isCustom: !!recipe.isCustom,
          originalTitle: recipe.originalTitle || recipe.title,
        });
        await updateDoc(doc(db, 'saved_recipes', uid, 'recipes', recipe.id), {
          sharedToPublic: true, publicRecipeId: publicId,
        });
        toast.show('Recipe shared with community', 'success');
      }
    } catch (err) {
      console.error('Share toggle error:', err);
      toast.show('Failed to update sharing', 'error');
    }
  }

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
                onMadeIt={(recipe, portions) => { setMadeItRecipe(recipe); setMadeItPortions(portions); }}
                onCustomize={(recipe) => setCustomizeRecipe(recipe)}
                onShareToggle={handleShareToggle}
                mode="saved"
              />
            ))}
          </div>
        </>
      )}
      {/* Cook History */}
      {cookHistory && cookHistory.history.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button onClick={() => setHistoryExpanded(v => !v)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 0', background: 'none', border: 'none', borderTop: '1px solid #f0f0f0',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Cook History</span>
            <span style={{
              fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#374151',
              padding: '2px 8px', borderRadius: 20,
            }}>{cookHistory.history.length}</span>
            <span style={{ marginLeft: 'auto', fontSize: 14, color: '#9ca3af' }}>
              {historyExpanded ? '▴' : '▾'}
            </span>
          </button>
          {historyExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
              {cookHistory.getHistory().map(entry => (
                <div key={entry.id} style={{
                  background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, padding: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{entry.recipeTitle}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(entry.cookedAt)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#6b7280' }}>
                    <span>{entry.portionSize} serving{entry.portionSize !== 1 ? 's' : ''}</span>
                    {entry.cuisine && <span>· {entry.cuisine}</span>}
                  </div>
                  {entry.substitutions?.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <button onClick={() => setExpandedHistoryId(prev => prev === entry.id ? null : entry.id)} style={{
                        fontSize: 12, color: '#f59e0b', background: 'none', border: 'none',
                        cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                      }}>
                        Made with {entry.substitutions.length} substitution{entry.substitutions.length > 1 ? 's' : ''}{' '}
                        {expandedHistoryId === entry.id ? '▴' : '▾'}
                      </button>
                      {expandedHistoryId === entry.id && (
                        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {entry.substitutions.map((s, i) => (
                            <div key={i} style={{ fontSize: 11, color: '#6b7280', paddingLeft: 8 }}>
                              Used {s.substituted.amount} {s.substituted.unit} {s.substituted.name}{' '}
                              instead of {s.original.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My Substitutions */}
      {cookHistory && cookHistory.substitutions.length > 0 && (
        <div style={{ marginTop: historyExpanded || !cookHistory.history.length ? 24 : 0 }}>
          <button onClick={() => setSubsExpanded(v => !v)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 0', background: 'none', border: 'none', borderTop: '1px solid #f0f0f0',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>My Substitutions</span>
            <span style={{
              fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#374151',
              padding: '2px 8px', borderRadius: 20,
            }}>{cookHistory.substitutions.length}</span>
            <span style={{ marginLeft: 'auto', fontSize: 14, color: '#9ca3af' }}>
              {subsExpanded ? '▴' : '▾'}
            </span>
          </button>
          {subsExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8 }}>
              {cookHistory.getSubstitutions().map(sub => (
                <div key={sub.id} style={{
                  background: '#fff', border: '1px solid #f0f0f0', borderRadius: 10, padding: '10px 12px',
                }}>
                  <div style={{ fontSize: 13, color: '#374151' }}>
                    Used <strong>{sub.substituted.amount} {sub.substituted.unit} {sub.substituted.name}</strong>{' '}
                    instead of <strong>{sub.original.name}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    in {sub.recipeTitle} · {formatDate(sub.loggedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {madeItRecipe && (
        <MadeItSheet
          recipe={madeItRecipe}
          portionSize={madeItPortions}
          pantry={pantry}
          onClose={() => setMadeItRecipe(null)}
          toast={toast}
          cookHistory={cookHistory}
        />
      )}
      {customizeRecipe && (
        <CustomizeRecipeSheet
          recipe={customizeRecipe}
          onClose={() => setCustomizeRecipe(null)}
          toast={toast}
          saved={saved}
        />
      )}
    </div>
  );
}
