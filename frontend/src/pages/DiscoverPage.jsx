import { useState, useRef } from 'react';
import Spinner from '../components/Spinner';
import RecipeCard from '../components/RecipeCard';
import RateLimitModal from '../components/RateLimitModal';
import { trackEvent } from '../utils/analytics';
import MadeItSheet from '../components/MadeItSheet';
import CustomizeRecipeSheet from '../components/CustomizeRecipeSheet';
import CommunityFeed from './CommunityFeed';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3003';
const CUISINES = ['Any', 'Italian', 'Asian', 'Mexican', 'Quick & Easy', 'Mediterranean'];
const COOK_TIMES = [
  { key: 'any', label: 'Any' },
  { key: '15', label: '<15min' },
  { key: '30', label: '<30min' },
  { key: '60', label: '<1hr' },
];
const DIFFICULTIES = ['Any', 'Easy', 'Medium', 'Hard'];

const DIETARY_LABELS = {
  vegetarian: '🌱 Vegetarian', vegan: '🌿 Vegan', 'gluten-free': '🌾 Gluten-Free',
  'dairy-free': '🥛 Dairy-Free', 'nut-free': '🥜 Nut-Free', pescatarian: '🐟 Pescatarian',
};

export default function DiscoverPage({ pantry, toast, saved, cookHistory, settings, rateLimit, grocery }) {
  const [discoverTab, setDiscoverTab] = useState('ai');
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cuisineIdx, setCuisineIdx] = useState(0);
  const [madeItRecipe, setMadeItRecipe] = useState(null);
  const [madeItPortions, setMadeItPortions] = useState(2);
  const [customizeRecipe, setCustomizeRecipe] = useState(null);
  const [limitModal, setLimitModal] = useState(null);

  const [sessionDietaryOverrides, setSessionDietaryOverrides] = useState(null);
  const [filterCuisine, setFilterCuisine] = useState('Any');
  const [filterTime, setFilterTime] = useState('any');
  const [filterDifficulty, setFilterDifficulty] = useState('Any');
  const [useExpiring, setUseExpiring] = useState(false);

  const lastShuffleTime = useRef(Date.now());

  const activeDietaryFilters = sessionDietaryOverrides !== null
    ? sessionDietaryOverrides
    : (settings?.dietaryPrefs || []);

  function removeDietaryFilter(pref) {
    if (sessionDietaryOverrides !== null) {
      setSessionDietaryOverrides(prev => prev.filter(p => p !== pref));
    } else {
      setSessionDietaryOverrides((settings?.dietaryPrefs || []).filter(p => p !== pref));
    }
  }

  function resetDietaryFilters() {
    setSessionDietaryOverrides(null);
  }

  async function fetchRecipes(idx) {
    if (pantry.items.length === 0) {
      toast.show('Add ingredients to your pantry first', 'info');
      return;
    }
    if (rateLimit && !rateLimit.canUse('recipe_generate')) {
      setLimitModal({ feature: 'recipe_generate', limit: 5 });
      return;
    }
    setLoading(true);
    try {
      const formatted = pantry.items.map(i =>
        typeof i === 'string' ? i : `${i.quantity} ${i.unit} ${i.name}`
      );

      const cuisineHint = filterCuisine !== 'Any' ? filterCuisine : CUISINES[idx];

      const body = { ingredients: formatted, cuisineHint };

      if (useExpiring) {
        const now = Date.now();
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        const expiring = pantry.items.filter(i => {
          if (!i.expiresAt) return false;
          const exp = new Date(i.expiresAt).getTime();
          return exp > now && exp - now <= weekMs;
        }).map(i => typeof i === 'string' ? i : `${i.quantity} ${i.unit} ${i.name}`);
        if (expiring.length > 0) body.expiringIngredients = expiring;
      }

      if (activeDietaryFilters.length > 0) body.dietaryFilters = activeDietaryFilters;
      if (filterTime !== 'any') body.cookTimeMax = parseInt(filterTime, 10);
      if (filterDifficulty !== 'Any') body.difficulty = filterDifficulty;

      if (settings) {
        const topCuisines = settings.getTopCuisines(2);
        if (topCuisines.length > 0 && settings.getTotalShuffles() >= 3) {
          body.cuisineWeights = topCuisines;
        }
      }

      const resp = await fetch(`${API}/api/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error('Recipe fetch failed');
      const data = await resp.json();
      setRecipes(data.recipes || []);
      if (data.recipes?.length) {
        if (rateLimit) rateLimit.increment('recipe_generate');
        trackEvent('recipe_generate', { count: data.recipes.length, cuisine: cuisineHint });
      }
      if (!data.recipes?.length) toast.show('No recipes found — try adding more ingredients', 'info');
    } catch {
      toast.show('Failed to load recipes — please try again', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleFind() { fetchRecipes(cuisineIdx); }

  function handleShuffle() {
    if (settings) {
      const elapsed = Date.now() - lastShuffleTime.current;
      if (elapsed > 3000) {
        settings.recordCuisineView(CUISINES[cuisineIdx]);
      }
    }
    lastShuffleTime.current = Date.now();
    const next = (cuisineIdx + 1) % CUISINES.length;
    setCuisineIdx(next);
    fetchRecipes(next);
  }

  const tabStyle = (active) => ({
    flex: 1, height: 40, borderRadius: 10, border: 'none',
    background: active ? '#10b981' : '#f3f4f6',
    color: active ? '#fff' : '#6b7280',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'background 0.15s, color 0.15s',
  });

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
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Discover Recipes</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        {pantry.items.length} ingredient{pantry.items.length !== 1 ? 's' : ''} in pantry
        {discoverTab === 'ai' && recipes.length > 0 && ` · Showing ${CUISINES[cuisineIdx]} recipes`}
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#f3f4f6', borderRadius: 12, padding: 4 }}>
        <button onClick={() => setDiscoverTab('ai')} style={tabStyle(discoverTab === 'ai')}>
          🤖 AI Recipes
        </button>
        <button onClick={() => setDiscoverTab('community')} style={tabStyle(discoverTab === 'community')}>
          👥 Community
        </button>
      </div>

      {discoverTab === 'ai' && (
        <>
          {/* Dietary filter pills */}
          {activeDietaryFilters.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
              {activeDietaryFilters.map(pref => (
                <button key={pref} onClick={() => removeDietaryFilter(pref)} style={{
                  fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20,
                  background: '#ecfdf5', color: '#065f46', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {DIETARY_LABELS[pref] || pref} <span style={{ fontSize: 13, lineHeight: 1 }}>×</span>
                </button>
              ))}
              {sessionDietaryOverrides !== null && (
                <button onClick={resetDietaryFilters} style={{
                  fontSize: 11, color: '#10b981', background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto',
                }}>All Preferences</button>
              )}
            </div>
          )}

          {/* Use Expiring toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <button onClick={() => setUseExpiring(v => !v)} style={{
              fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 20,
              border: useExpiring ? 'none' : '1px solid #fcd34d',
              background: useExpiring ? '#f59e0b' : '#fffbeb',
              color: useExpiring ? '#fff' : '#92400e',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>⚠️ Use Expiring Soon</button>
            {useExpiring && (
              <span style={{ fontSize: 11, color: '#92400e' }}>Prioritizing expiring ingredients</span>
            )}
          </div>

          {/* Quick filter bar */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginBottom: 16 }}>
            {CUISINES.map(c => pill(c, filterCuisine === c, () => setFilterCuisine(c)))}
            <span style={{ width: 1, background: '#e5e7eb', flexShrink: 0 }} />
            {COOK_TIMES.map(t => pill(t.label, filterTime === t.key, () => setFilterTime(t.key)))}
            <span style={{ width: 1, background: '#e5e7eb', flexShrink: 0 }} />
            {DIFFICULTIES.map(d => pill(d, filterDifficulty === d, () => setFilterDifficulty(d)))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <button onClick={handleFind} disabled={loading} style={{
              flex: 1, height: 44, borderRadius: 10, border: 'none',
              background: loading ? '#d1d5db' : '#10b981', color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {loading ? <><Spinner size={18} /> Finding...</> : 'Find Recipes'}
            </button>
            {recipes.length > 0 && (
              <button onClick={handleShuffle} disabled={loading} style={{
                height: 44, padding: '0 18px', borderRadius: 10,
                border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
                fontSize: 14, fontWeight: 500, cursor: loading ? 'default' : 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}>🔀 Shuffle</button>
            )}
          </div>

          {recipes.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🍳</div>
              <div style={{ fontSize: 14 }}>Hit "Find Recipes" to get started</div>
            </div>
          )}

          {useExpiring && recipes.length > 0 && (
            <div style={{
              background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10,
              padding: '8px 14px', marginBottom: 12, fontSize: 13, color: '#92400e',
            }}>⚠️ Showing recipes that use your expiring ingredients</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {recipes.map((r, i) => (
              <RecipeCard
                key={i}
                recipe={r}
                pantryItems={pantry.items}
                pantry={pantry}
                ratings={saved.ratings}
                onRate={(title, stars) => saved.rate(title, stars)}
                isSaved={saved.isSaved(r.title)}
                onSave={(recipe) => { saved.save(recipe); toast.show('Recipe saved', 'success'); }}
                onUnsave={(recipe) => {
                  const match = saved.items.find(s => s.title === recipe.title);
                  if (match) { saved.unsave(match.id); toast.show('Recipe removed', 'info'); }
                }}
                onMadeIt={(recipe, portions) => { setMadeItRecipe(recipe); setMadeItPortions(portions); }}
                onCustomize={(recipe) => setCustomizeRecipe(recipe)}
                mode="discover"
                settings={settings}
                rateLimit={rateLimit ? { ...rateLimit, showLimitModal: (f) => setLimitModal({ feature: f, limit: 10 }) } : null}
                cookHistory={cookHistory}
                onAddToPantry={(name) => { pantry.add([{ name, quantity: 1, unit: 'item' }]); toast.show(`✓ ${name} added to pantry`, 'success'); }}
                onAddToGrocery={(name) => { grocery?.addItem({ name, quantity: 1, unit: 'item', source: 'recipe_missing' }); toast.show(`🛒 ${name} added to grocery list`, 'success'); }}
              />
            ))}
          </div>
        </>
      )}

      {discoverTab === 'community' && (
        <CommunityFeed
          pantry={pantry}
          toast={toast}
          saved={saved}
          grocery={grocery}
          onSwitchToAI={() => setDiscoverTab('ai')}
        />
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
      {limitModal && (
        <RateLimitModal feature={limitModal.feature} limit={limitModal.limit} onClose={() => setLimitModal(null)} />
      )}
    </div>
  );
}
