import { useState, useMemo } from 'react';
import Spinner from '../components/Spinner';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3003';
const CUISINES = ['Any', 'Italian', 'Asian', 'Mexican', 'Quick & Easy', 'Mediterranean'];
const RATINGS_KEY = 'pantrypal_ratings';

function loadRatings() {
  try { return JSON.parse(localStorage.getItem(RATINGS_KEY)) || {}; }
  catch { return {}; }
}
function saveRating(title, stars) {
  const all = loadRatings();
  all[title] = stars;
  localStorage.setItem(RATINGS_KEY, JSON.stringify(all));
}

function formatAmount(n) {
  if (n >= 1) return Math.round(n * 10) / 10;
  if (n === 0.5) return '½';
  if (n === 0.25) return '¼';
  if (n === 0.75) return '¾';
  if (Math.abs(n - 0.33) < 0.02) return '⅓';
  if (Math.abs(n - 0.67) < 0.02) return '⅔';
  return Math.round(n * 100) / 100;
}

function pantryHasIngredient(pantryItems, ingredientName) {
  const lower = ingredientName.toLowerCase();
  return pantryItems.some(p => {
    const pn = (typeof p === 'string' ? p : p.name).toLowerCase();
    return pn.includes(lower) || lower.includes(pn);
  });
}

// ── RecipeCard ───────────────────────────────────────────────────────────────
function RecipeCard({ recipe, pantryItems, ratings, onRate }) {
  const [expanded, setExpanded] = useState(false);
  const [servings, setServings] = useState(recipe.baseServings || 2);
  const [nutritionTip, setNutritionTip] = useState(false);

  const scaleFactor = (recipe.baseServings && recipe.baseServings > 0)
    ? servings / recipe.baseServings : 1;

  const scaledIngredients = useMemo(() => {
    if (!recipe.ingredients?.length) return [];
    return recipe.ingredients.map(ing => ({
      ...ing,
      scaledAmount: ing.amount * scaleFactor,
    }));
  }, [recipe.ingredients, scaleFactor]);

  function adjustServings(delta) {
    setServings(s => Math.max(1, Math.min(99, s + delta)));
  }

  function handleServingsInput(val) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1 && n <= 99) setServings(n);
  }

  const diffColor = d => d === 'Easy' ? '#10b981' : d === 'Medium' ? '#f59e0b' : '#ef4444';

  return (
    <div style={{
      background: '#fff', border: '1px solid #f0f0f0', borderRadius: 16,
      boxShadow: '0 1px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
    }}>
      <div style={{ padding: 20 }}>
        {/* Title + match score */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: 0, flex: 1 }}>{recipe.title}</h3>
          {recipe.matchScore != null && (
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
              background: recipe.matchScore >= 80 ? '#ecfdf5' : recipe.matchScore >= 50 ? '#fffbeb' : '#fef2f2',
              color: recipe.matchScore >= 80 ? '#065f46' : recipe.matchScore >= 50 ? '#92400e' : '#991b1b',
              whiteSpace: 'nowrap', marginLeft: 8,
            }}>{recipe.matchScore}% match</span>
          )}
        </div>

        <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: 10 }}>{recipe.description}</p>

        {/* Tags */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {recipe.cuisine && <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#f3f4f6', color: '#374151' }}>{recipe.cuisine}</span>}
          {recipe.cookTime && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f3f4f6', color: '#6b7280' }}>⏱ {recipe.cookTime}</span>}
          {recipe.difficulty && <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#f3f4f6', color: diffColor(recipe.difficulty) }}>{recipe.difficulty}</span>}
        </div>

        {/* Missing ingredients */}
        {recipe.missingIngredients?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#9ca3af', marginBottom: 4 }}>MISSING</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {recipe.missingIngredients.map(m => (
                <span key={m} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, background: '#fef2f2', color: '#991b1b' }}>{m}</span>
              ))}
            </div>
          </div>
        )}

        {/* Star rating */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
          {[1,2,3,4,5].map(star => (
            <button key={star} onClick={() => onRate(recipe.title, star)} style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 20,
              color: (ratings[recipe.title] || 0) >= star ? '#f59e0b' : '#e5e7eb',
              padding: '2px', lineHeight: 1,
            }}>★</button>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setExpanded(v => !v)} style={{
            flex: 1, height: 38, borderRadius: 8, border: '1px solid #e5e7eb',
            background: expanded ? '#f0fdf4' : '#fff', color: expanded ? '#059669' : '#374151',
            fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Full Recipe {expanded ? '▴' : '▾'}
          </button>
          <button
            onClick={() => setNutritionTip(true)}
            onMouseLeave={() => setNutritionTip(false)}
            style={{
              flex: 1, height: 38, borderRadius: 8, border: '1px solid #f0f0f0',
              background: '#fafafa', color: '#c0c0c0', fontSize: 13, fontWeight: 500,
              cursor: 'default', fontFamily: 'inherit', position: 'relative',
            }}>
            Nutrition ▾
            {nutritionTip && (
              <span style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
                transform: 'translateX(-50%)', background: '#1f2937', color: '#fff',
                fontSize: 11, padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap',
              }}>Nutritional facts coming in v2</span>
            )}
          </button>
        </div>
      </div>

      {/* ── Expanded content ── */}
      <div style={{
        maxHeight: expanded ? 2000 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.35s ease',
      }}>
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid #f0f0f0' }}>

          {/* Ingredients section */}
          {scaledIngredients.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Ingredients</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => adjustServings(-1)} style={{
                    width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb',
                    background: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: '#374151', lineHeight: 1,
                  }}>−</button>
                  <input
                    type="number" min="1" max="99" value={servings}
                    onChange={e => handleServingsInput(e.target.value)}
                    style={{
                      width: 40, height: 28, border: '1px solid #e5e7eb', borderRadius: 6,
                      textAlign: 'center', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                  <button onClick={() => adjustServings(1)} style={{
                    width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb',
                    background: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: '#374151', lineHeight: 1,
                  }}>+</button>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>servings</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {scaledIngredients.map((ing, j) => {
                  const inPantry = pantryHasIngredient(pantryItems, ing.name);
                  const isMissing = recipe.missingIngredients?.some(m =>
                    m.toLowerCase().includes(ing.name.toLowerCase()) || ing.name.toLowerCase().includes(m.toLowerCase())
                  );
                  return (
                    <div key={j} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 10px', borderRadius: 8,
                      background: inPantry ? '#f0fdf4' : isMissing ? '#fafafa' : '#fff',
                    }}>
                      <span style={{
                        fontSize: 13, color: inPantry ? '#059669' : isMissing ? '#9ca3af' : '#374151',
                      }}>
                        • {formatAmount(ing.scaledAmount)} {ing.unit} {ing.name}
                      </span>
                      {inPantry && (
                        <span style={{ fontSize: 10, fontWeight: 500, color: '#059669', background: '#ecfdf5', padding: '1px 6px', borderRadius: 10 }}>✓ in pantry</span>
                      )}
                      {!inPantry && isMissing && (
                        <span style={{ fontSize: 10, fontWeight: 500, color: '#9ca3af', background: '#f3f4f6', padding: '1px 6px', borderRadius: 10 }}>shopping list</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Steps section */}
          {recipe.steps?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>Instructions</div>
              <ol style={{ margin: 0, paddingLeft: 22, fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                {recipe.steps.map((s, j) => (
                  <li key={j} style={{ marginBottom: 10, paddingLeft: 4 }}>{s}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Fallback for old recipes without structured ingredients */}
          {(!recipe.ingredients || recipe.ingredients.length === 0) && recipe.steps?.length > 0 && (
            <div style={{ marginTop: 16, fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
              Structured ingredients not available for this recipe. Try shuffling for new results.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DiscoverPage ─────────────────────────────────────────────────────────────
export default function DiscoverPage({ pantry, toast }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cuisineIdx, setCuisineIdx] = useState(0);
  const [ratings, setRatings] = useState(loadRatings);

  async function fetchRecipes(idx) {
    if (pantry.items.length === 0) {
      toast.show('Add ingredients to your pantry first', 'info');
      return;
    }
    setLoading(true);
    try {
      const formatted = pantry.items.map(i =>
        typeof i === 'string' ? i : `${i.quantity} ${i.unit} ${i.name}`
      );
      const resp = await fetch(`${API}/api/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: formatted, cuisineHint: CUISINES[idx] }),
      });
      if (!resp.ok) throw new Error('Recipe fetch failed');
      const data = await resp.json();
      setRecipes(data.recipes || []);
      if (!data.recipes?.length) toast.show('No recipes found — try adding more ingredients', 'info');
    } catch {
      toast.show('Failed to load recipes — please try again', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleFind() { fetchRecipes(cuisineIdx); }
  function handleShuffle() {
    const next = (cuisineIdx + 1) % CUISINES.length;
    setCuisineIdx(next);
    fetchRecipes(next);
  }

  function rate(title, stars) {
    saveRating(title, stars);
    setRatings(prev => ({ ...prev, [title]: stars }));
  }

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Discover Recipes</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
        {pantry.items.length} ingredient{pantry.items.length !== 1 ? 's' : ''} in pantry
        {recipes.length > 0 && ` · Showing ${CUISINES[cuisineIdx]} recipes`}
      </p>

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {recipes.map((r, i) => (
          <RecipeCard
            key={i}
            recipe={r}
            pantryItems={pantry.items}
            ratings={ratings}
            onRate={rate}
          />
        ))}
      </div>
    </div>
  );
}
