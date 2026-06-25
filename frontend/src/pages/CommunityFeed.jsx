import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, limit, getDocs, startAfter, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import RecipeCard from '../components/RecipeCard';
import Spinner from '../components/Spinner';

const PAGE_SIZE = 20;
const COMMUNITY_RATINGS_KEY = 'pantrypal_community_ratings';

function loadCommunityRatings() {
  try { return JSON.parse(localStorage.getItem(COMMUNITY_RATINGS_KEY)) || {}; }
  catch { return {}; }
}

function saveCommunityRating(recipeId, stars) {
  const all = loadCommunityRatings();
  all[recipeId] = stars;
  localStorage.setItem(COMMUNITY_RATINGS_KEY, JSON.stringify(all));
}

function calcMatchScore(recipe, pantryItems) {
  if (!recipe.ingredients?.length || !pantryItems.length) return 0;
  const matched = recipe.ingredients.filter(ing => {
    const lower = ing.name.toLowerCase();
    return pantryItems.some(p => {
      const pn = (typeof p === 'string' ? p : p.name).toLowerCase();
      return pn.includes(lower) || lower.includes(pn);
    });
  });
  return Math.round((matched.length / recipe.ingredients.length) * 100);
}

function pantryMatchesRecipe(recipe, pantryItems) {
  if (!recipe.ingredients?.length || !pantryItems.length) return false;
  return recipe.ingredients.some(ing => {
    const lower = ing.name.toLowerCase();
    return pantryItems.some(p => {
      const pn = (typeof p === 'string' ? p : p.name).toLowerCase();
      return pn.includes(lower) || lower.includes(pn);
    });
  });
}

export default function CommunityFeed({ pantry, toast, saved, onSwitchToAI }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [communityRatings, setCommunityRatings] = useState(loadCommunityRatings);

  async function fetchRecipes(isLoadMore = false) {
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      let q;
      if (isLoadMore && lastDoc) {
        q = query(
          collection(db, 'public_recipes'),
          orderBy('sharedAt', 'desc'),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        );
      } else {
        q = query(
          collection(db, 'public_recipes'),
          orderBy('sharedAt', 'desc'),
          limit(PAGE_SIZE)
        );
      }

      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ ...d.data(), _docSnap: d }));

      if (snap.docs.length > 0) {
        setLastDoc(snap.docs[snap.docs.length - 1]);
      }
      setHasMore(snap.docs.length === PAGE_SIZE);

      if (isLoadMore) {
        setRecipes(prev => [...prev, ...docs]);
      } else {
        setRecipes(docs);
      }
    } catch (err) {
      console.error('Community feed error:', err);
      toast.show('Failed to load community recipes', 'error');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => { fetchRecipes(); }, []);

  const sortedRecipes = useMemo(() => {
    const withScores = recipes.map(r => ({
      ...r,
      matchScore: calcMatchScore(r, pantry.items),
    }));

    const pantryMatches = withScores
      .filter(r => pantryMatchesRecipe(r, pantry.items))
      .sort((a, b) => {
        const countDiff = (b.ratingCount || 0) - (a.ratingCount || 0);
        if (countDiff !== 0) return countDiff;
        const aTime = a.sharedAt?.toDate?.() || new Date(0);
        const bTime = b.sharedAt?.toDate?.() || new Date(0);
        return bTime - aTime;
      });

    const rest = withScores
      .filter(r => !pantryMatchesRecipe(r, pantry.items))
      .sort((a, b) => {
        const aTime = a.sharedAt?.toDate?.() || new Date(0);
        const bTime = b.sharedAt?.toDate?.() || new Date(0);
        return bTime - aTime;
      });

    return [...pantryMatches, ...rest];
  }, [recipes, pantry.items]);

  async function handleCommunityRate(recipeId, stars) {
    const existing = communityRatings[recipeId];
    if (existing) {
      toast.show('You already rated this recipe', 'info');
      return;
    }

    try {
      const recipe = recipes.find(r => r.id === recipeId);
      if (!recipe) return;

      const oldRating = recipe.rating || 0;
      const oldCount = recipe.ratingCount || 0;
      const newCount = oldCount + 1;
      const newRating = ((oldRating * oldCount) + stars) / newCount;

      await updateDoc(doc(db, 'public_recipes', recipeId), {
        rating: newRating,
        ratingCount: newCount,
      });

      saveCommunityRating(recipeId, stars);
      setCommunityRatings(prev => ({ ...prev, [recipeId]: stars }));

      setRecipes(prev => prev.map(r =>
        r.id === recipeId ? { ...r, rating: newRating, ratingCount: newCount } : r
      ));

      toast.show('Rating saved', 'success');
    } catch (err) {
      console.error('Rating error:', err);
      toast.show('Failed to save rating', 'error');
    }
  }

  function handleSaveCommunityRecipe(recipe) {
    const saveData = {
      title: recipe.title,
      description: recipe.description || '',
      cookTime: recipe.cookTime || '',
      difficulty: recipe.difficulty || '',
      cuisine: recipe.cuisine || '',
      baseServings: recipe.baseServings || 2,
      ingredients: recipe.ingredients || [],
      steps: recipe.steps || [],
      matchScore: recipe.matchScore || 0,
      communityRecipeId: recipe.id,
      authorName: recipe.authorName || '',
    };
    saved.save(saveData);
    toast.show('Recipe saved to your collection', 'success');
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
        <Spinner size={32} />
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>👥</div>
        <div style={{ fontSize: 14, marginBottom: 4, color: '#374151', fontWeight: 500 }}>
          No community recipes yet.
        </div>
        <div style={{ fontSize: 13, marginBottom: 20 }}>
          Be the first to share one! Customize any recipe and share it with the community.
        </div>
        <button onClick={onSwitchToAI} style={{
          fontSize: 14, fontWeight: 600, padding: '10px 24px', borderRadius: 10,
          background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        }}>Go to AI Recipes</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sortedRecipes.map(r => (
        <RecipeCard
          key={r.id}
          recipe={r}
          pantryItems={pantry.items}
          ratings={communityRatings[r.id] ? { [r.id]: communityRatings[r.id] } : {}}
          onRate={(_, stars) => handleCommunityRate(r.id, stars)}
          ratingKey={r.id}
          isSaved={saved.isSaved(r.title)}
          onSave={() => handleSaveCommunityRecipe(r)}
          onUnsave={(recipe) => {
            const match = saved.items.find(s => s.title === recipe.title);
            if (match) { saved.unsave(match.id); toast.show('Recipe removed', 'info'); }
          }}
          mode="community"
        />
      ))}

      {hasMore && (
        <button onClick={() => fetchRecipes(true)} disabled={loadingMore} style={{
          width: '100%', height: 44, borderRadius: 10, border: '1px solid #e5e7eb',
          background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
          cursor: loadingMore ? 'default' : 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {loadingMore ? <><Spinner size={16} /> Loading...</> : 'Load More'}
        </button>
      )}
    </div>
  );
}
