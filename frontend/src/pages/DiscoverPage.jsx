import { useState } from 'react';
import Spinner from '../components/Spinner';
import RecipeCard from '../components/RecipeCard';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3003';
const CUISINES = ['Any', 'Italian', 'Asian', 'Mexican', 'Quick & Easy', 'Mediterranean'];

export default function DiscoverPage({ pantry, toast, saved }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cuisineIdx, setCuisineIdx] = useState(0);

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
            ratings={saved.ratings}
            onRate={(title, stars) => saved.rate(title, stars)}
            isSaved={saved.isSaved(r.title)}
            onSave={(recipe) => { saved.save(recipe); toast.show('Recipe saved', 'success'); }}
            onUnsave={(recipe) => {
              const match = saved.items.find(s => s.title === recipe.title);
              if (match) { saved.unsave(match.id); toast.show('Recipe removed', 'info'); }
            }}
            mode="discover"
          />
        ))}
      </div>
    </div>
  );
}
