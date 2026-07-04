import { useState, useMemo, useEffect } from 'react';
import { doc, setDoc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { trackEvent } from '../utils/analytics';
import RecipeCard from '../components/RecipeCard';
import MadeItSheet from '../components/MadeItSheet';
import CustomizeRecipeSheet from '../components/CustomizeRecipeSheet';
import CreateRecipeSheet from '../components/CreateRecipeSheet';
import Spinner from '../components/Spinner';

// ── Saved Recipes constants ───────────────────────────────────────────────────
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

// ── Meal Plan constants ───────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || 'http://localhost:3003';
const SLOTS = ['breakfast', 'lunch', 'dinner'];
const SLOT_LABELS = { breakfast: '🌅 Breakfast', lunch: '☀️ Lunch', dinner: '🌙 Dinner' };
const SLOT_HINTS = {
  breakfast: 'light, morning-appropriate, breakfast',
  lunch: 'quick, midday meal, lunch',
  dinner: 'hearty, evening meal, dinner',
};
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

function fmtDayLabel(dateStr, idx) {
  const d = new Date(dateStr + 'T12:00:00');
  if (idx === 0) return 'Today';
  if (idx === 1) return 'Tomorrow';
  return DAY_NAMES[d.getDay()];
}
function fmtDateShort(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

// ── Meal Plan sub-components ──────────────────────────────────────────────────
function MatchBadge({ score }) {
  if (score == null) return null;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
      background: score >= 80 ? '#ecfdf5' : score >= 50 ? '#fffbeb' : '#fef2f2',
      color: score >= 80 ? '#065f46' : score >= 50 ? '#92400e' : '#991b1b',
    }}>{score}%</span>
  );
}

function MealSlot({ meal, onAdd, onRemove }) {
  if (!meal) {
    return (
      <button onClick={onAdd} style={{
        width: '100%', height: 40, borderRadius: 8, border: '1px dashed #d1d5db',
        background: '#fafafa', color: '#9ca3af', fontSize: 13, cursor: 'pointer',
        fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>+ Add</button>
    );
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
      background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meal.title}
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
          {meal.cookTime && <span>⏱ {meal.cookTime}</span>}
          <MatchBadge score={meal.matchScore} />
        </div>
      </div>
      <button onClick={onRemove} style={{
        background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
        color: '#d1d5db', padding: '0 4px', lineHeight: 1, flexShrink: 0,
      }}>×</button>
    </div>
  );
}

function RecipePicker({ onSelect, onClose, savedRecipes, pantryItems, toast, targetDate, targetSlot }) {
  const [pickerTab, setPickerTab] = useState('saved');
  const [search, setSearch] = useState('');
  const [aiRecipes, setAiRecipes] = useState([]);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return savedRecipes;
    const q = search.toLowerCase();
    return savedRecipes.filter(r => r.title.toLowerCase().includes(q));
  }, [savedRecipes, search]);

  async function fetchAiSuggestions() {
    if (pantryItems.length === 0) { toast.show('Add ingredients first', 'info'); return; }
    setLoading(true);
    try {
      const formatted = pantryItems.map(i => typeof i === 'string' ? i : `${i.quantity} ${i.unit} ${i.name}`);
      const resp = await fetch(`${API}/api/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: formatted, cuisineHint: 'Any', mealTypeHint: SLOT_HINTS[targetSlot] || '' }),
      });
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setAiRecipes(data.recipes || []);
    } catch { toast.show('Failed to get suggestions', 'error'); }
    finally { setLoading(false); }
  }

  const tabStyle = (active) => ({
    flex: 1, height: 36, borderRadius: 8, border: 'none',
    background: active ? '#10b981' : '#f3f4f6',
    color: active ? '#fff' : '#6b7280',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  });

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480,
        maxHeight: '75vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
      }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
              Add to {SLOT_LABELS[targetSlot]?.slice(2) || targetSlot} · {fmtDateShort(targetDate)}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 6, background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
            <button onClick={() => setPickerTab('saved')} style={tabStyle(pickerTab === 'saved')}>My Recipes</button>
            <button onClick={() => setPickerTab('ai')} style={tabStyle(pickerTab === 'ai')}>AI Suggest</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {pickerTab === 'saved' && (
            <>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search saved recipes..."
                style={{ width: '100%', height: 38, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 12, boxSizing: 'border-box' }} />
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>
                  {savedRecipes.length === 0 ? 'No saved recipes. Save some from Discover!' : 'No matches.'}
                </div>
              ) : filtered.map(r => (
                <button key={r.id} onClick={() => { onSelect(r); onClose(); }} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', border: '1px solid #f0f0f0', borderRadius: 10,
                  background: '#fff', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6, textAlign: 'left',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', gap: 6, marginTop: 2 }}>
                      {r.cuisine && <span>{r.cuisine}</span>}
                      {r.cookTime && <span>⏱ {r.cookTime}</span>}
                    </div>
                  </div>
                  <MatchBadge score={r.matchScore} />
                </button>
              ))}
            </>
          )}
          {pickerTab === 'ai' && (
            <>
              <button onClick={fetchAiSuggestions} disabled={loading} style={{
                width: '100%', height: 42, borderRadius: 10, border: 'none',
                background: loading ? '#d1d5db' : '#10b981', color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
                fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12,
              }}>
                {loading ? <><Spinner size={16} /> Generating...</> : `Suggest ${SLOT_LABELS[targetSlot]?.slice(2) || ''} recipes`}
              </button>
              {aiRecipes.map((r, i) => (
                <button key={i} onClick={() => { onSelect(r); onClose(); }} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', border: '1px solid #f0f0f0', borderRadius: 10,
                  background: '#fff', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6, textAlign: 'left',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', gap: 6, marginTop: 2 }}>
                      {r.cuisine && <span>{r.cuisine}</span>}
                      {r.cookTime && <span>⏱ {r.cookTime}</span>}
                    </div>
                  </div>
                  <MatchBadge score={r.matchScore} />
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtAmount(n) {
  if (!n) return '';
  const r = Math.round(n * 100) / 100;
  return r % 1 === 0 ? String(r) : r.toFixed(2).replace(/\.?0+$/, '');
}

function VisibilityBadge({ v }) {
  const map = { private: ['🔒', '#6b7280', '#f3f4f6'], household: ['🏠', '#1d4ed8', '#eff6ff'], community: ['🌍', '#065f46', '#ecfdf5'] };
  const [icon, color, bg] = map[v] || map.private;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: bg, color }}>
      {icon} {v === 'private' ? 'Private' : v === 'household' ? 'Household' : 'Community'}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RecipesPage({ saved, pantry, toast, onSwitchTab, cookHistory, grocery, settings, household, householdRecipes, uid, displayName, mealPlan, householdMealPlan, userRecipes, savedDrinks }) {
  const { currentUser } = useAuth();
  const hh = household?.household;

  // Sub-tab
  const [subTab, setSubTab] = useState('recipes');

  // My Recipes state
  const [recipesTab, setRecipesTab] = useState('personal');
  const [recipeTypeTab, setRecipeTypeTab] = useState('food'); // 'food' | 'drinks'
  const [expandedId, setExpandedId] = useState(null);
  const [sort, setSort] = useState('date');
  const [cuisineFilter, setCuisineFilter] = useState('All');
  const [diffFilter, setDiffFilter] = useState('All');
  const [timeFilter, setTimeFilter] = useState('any');
  const [madeItRecipe, setMadeItRecipe] = useState(null);
  const [madeItPortions, setMadeItPortions] = useState(2);
  const [customizeRecipe, setCustomizeRecipe] = useState(null);

  // Cook History state
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);

  // My Creations state
  const [expandedCreationId, setExpandedCreationId] = useState(null);
  const [creationServings, setCreationServings] = useState(null);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [editingCreation, setEditingCreation] = useState(null);
  const [deletingCreationId, setDeletingCreationId] = useState(null);
  const [creationComments, setCreationComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [changingVisId, setChangingVisId] = useState(null);

  useEffect(() => {
    if (!expandedCreationId || !userRecipes) return;
    const recipe = userRecipes.recipes.find(r => r.id === expandedCreationId);
    setCreationServings(recipe?.baseServings || 4);
    setCreationComments([]);
    setCommentText('');
    if (recipe?.allowComments && recipe?.visibility !== 'private') {
      setCommentsLoading(true);
      userRecipes.getComments(expandedCreationId).then(c => {
        setCreationComments(c);
        setCommentsLoading(false);
      }).catch(() => setCommentsLoading(false));
    }
  }, [expandedCreationId]);

  async function handleCreationSave(recipeData) {
    if (!userRecipes) return;
    if (editingCreation) {
      await userRecipes.updateRecipe(editingCreation.id, recipeData);
      toast.show('Recipe updated', 'success');
    } else {
      await userRecipes.createRecipe(recipeData, displayName || '');
      toast.show('Recipe created! 🎉', 'success');
      setSubTab('creations');
    }
    setShowCreateSheet(false);
    setEditingCreation(null);
  }

  async function handlePostComment(recipeId) {
    if (!commentText.trim() || !userRecipes) return;
    const newComment = await userRecipes.addComment(recipeId, commentText.trim(), displayName || '');
    if (newComment) setCreationComments(prev => [newComment, ...prev]);
    setCommentText('');
  }

  async function handleLikeComment(recipeId, commentId, likedBy) {
    if (!userRecipes) return;
    const { alreadyLiked, newLikedBy } = await userRecipes.likeComment(recipeId, commentId, likedBy);
    setCreationComments(prev => prev.map(c =>
      c.id === commentId ? { ...c, likes: alreadyLiked ? (c.likes || 1) - 1 : (c.likes || 0) + 1, likedBy: newLikedBy } : c
    ));
  }

  function fmtCommentDate(ts) {
    const d = ts?.toDate?.() || new Date();
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // Meal Plan state
  const [planTab, setPlanTab] = useState('personal');
  const [view, setView] = useState('list');
  const [calDay, setCalDay] = useState(0);
  const [picker, setPicker] = useState(null);

  const activePlan = planTab === 'household' && householdMealPlan ? householdMealPlan : mealPlan;
  const week = useMemo(() => activePlan?.getWeek?.() || [], [activePlan?.plan]);

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
          id: publicId, title: recipe.title, description: recipe.description || '',
          cookTime: recipe.cookTime || '', difficulty: recipe.difficulty || '', cuisine: recipe.cuisine || '',
          baseServings: recipe.baseServings || 2, ingredients: recipe.ingredients || [], steps: recipe.steps || [],
          authorUid: uid, authorName: currentUser.displayName || '',
          sharedAt: serverTimestamp(), rating: 0, ratingCount: 0, saveCount: 0,
          isCustom: !!recipe.isCustom, originalTitle: recipe.originalTitle || recipe.title,
        });
        await updateDoc(doc(db, 'saved_recipes', uid, 'recipes', recipe.id), {
          sharedToPublic: true, publicRecipeId: publicId,
        });
        toast.show('Recipe shared with community', 'success');
        trackEvent('recipe_share', { title: recipe.title }, uid);
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

  // Meal Plan helpers
  function handlePlanSelect(recipe) {
    if (!picker) return;
    if (planTab === 'household' && householdMealPlan) {
      householdMealPlan.assignMeal(picker.date, picker.slot, recipe, displayName);
    } else {
      mealPlan?.assignMeal(picker.date, picker.slot, recipe);
    }
  }

  function handleRemoveMeal(date, slot) {
    if (planTab === 'household' && householdMealPlan) householdMealPlan.removeMeal(date, slot);
    else mealPlan?.removeMeal(date, slot);
  }

  function addMissingToGrocery() {
    const missing = activePlan?.getWeekMissing?.() || [];
    if (missing.length === 0) { toast.show('No missing ingredients this week', 'info'); return; }
    const added = grocery?.addItems(missing.map(name => ({ name, quantity: 1, unit: 'item', source: 'meal_plan' })));
    if (added > 0) toast.show(`${added} ingredient${added > 1 ? 's' : ''} added to grocery list`, 'success');
    else toast.show('All items already in grocery list', 'info');
  }

  const assignedCount = week.reduce((sum, day) => sum + SLOTS.filter(s => day[s]).length, 0);

  const planTabStyle = (active) => ({
    flex: 1, height: 36, borderRadius: 8, border: 'none',
    background: active ? '#10b981' : '#f3f4f6',
    color: active ? '#fff' : '#6b7280',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  });

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, marginBottom: 4 }}>My Recipes</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
        {subTab === 'recipes' && (recipesTab === 'household' ? `${hh?.name || 'Household'} recipes` : 'Your saved recipe collection')}
        {subTab === 'creations' && `${userRecipes?.recipes?.length || 0} recipe${(userRecipes?.recipes?.length || 0) !== 1 ? 's' : ''} created`}
        {subTab === 'mealplan' && `${assignedCount} meal${assignedCount !== 1 ? 's' : ''} planned this week`}
        {subTab === 'history' && `${cookHistory?.history?.length || 0} meals cooked`}
      </p>

      {/* Sub-tab bar */}
      <div style={{ display: 'flex', borderBottom: '2px solid #f0f0f0', marginBottom: 16 }}>
        {[
          { key: 'recipes', label: '📖 My Recipes' },
          { key: 'creations', label: '✍️ My Creations' },
          { key: 'mealplan', label: '📅 Meal Plan' },
          { key: 'history', label: '🍳 Cook History' },
        ].map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)} style={{
            flex: 1, padding: '10px 2px', fontSize: 11, fontWeight: subTab === t.key ? 600 : 400,
            color: subTab === t.key ? '#10b981' : '#6b7280',
            background: 'none', border: 'none',
            borderBottom: `2px solid ${subTab === t.key ? '#10b981' : 'transparent'}`,
            marginBottom: -2, cursor: 'pointer', fontFamily: 'inherit',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── MY RECIPES TAB ── */}
      {subTab === 'recipes' && (
        <>
          {/* Food / Drinks toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
            <button onClick={() => setRecipeTypeTab('food')} style={{ flex: 1, height: 34, borderRadius: 8, border: 'none', background: recipeTypeTab === 'food' ? '#10b981' : 'transparent', color: recipeTypeTab === 'food' ? '#fff' : '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>🍽 Food</button>
            <button onClick={() => setRecipeTypeTab('drinks')} style={{ flex: 1, height: 34, borderRadius: 8, border: 'none', background: recipeTypeTab === 'drinks' ? '#10b981' : 'transparent', color: recipeTypeTab === 'drinks' ? '#fff' : '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              🥤 Drinks{savedDrinks?.items?.length > 0 ? ` (${savedDrinks.items.length})` : ''}
            </button>
          </div>

          {/* Saved drinks list */}
          {recipeTypeTab === 'drinks' && (
            savedDrinks?.items?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🥤</div>
                <div style={{ fontSize: 14, marginBottom: 16 }}>No saved drinks yet. Find drinks on the Discover tab and tap the bookmark to save them.</div>
                <button onClick={() => onSwitchTab('discover')} style={{ fontSize: 14, fontWeight: 600, padding: '10px 24px', borderRadius: 10, background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Go to Discover</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(savedDrinks?.items || []).map(d => (
                  <RecipeCard key={d.id} recipe={d} pantryItems={pantry.items}
                    collapsed={expandedId !== d.id} onToggleCollapse={() => setExpandedId(prev => prev === d.id ? null : d.id)}
                    isSaved={true} onUnsave={() => { savedDrinks.unsave(d.id); toast.show('Drink removed', 'info'); }}
                    mode="saved-drink" settings={settings}
                  />
                ))}
              </div>
            )
          )}

          {recipeTypeTab === 'food' && hh && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
              <button onClick={() => setRecipesTab('personal')} style={{ flex: 1, height: 36, borderRadius: 8, border: 'none', background: recipesTab === 'personal' ? '#10b981' : 'transparent', color: recipesTab === 'personal' ? '#fff' : '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>👤 My Recipes</button>
              <button onClick={() => setRecipesTab('household')} style={{ flex: 1, height: 36, borderRadius: 8, border: 'none', background: recipesTab === 'household' ? '#10b981' : 'transparent', color: recipesTab === 'household' ? '#fff' : '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>🏠 Household</button>
            </div>
          )}

          {recipeTypeTab === 'food' && (recipesTab === 'household' && hh && householdRecipes ? (
            <div>
              {householdRecipes.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🏠</div>
                  <div style={{ fontSize: 14 }}>No household recipes yet. Save recipes from Discover to share with your household.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {householdRecipes.items.map(r => (
                    <RecipeCard key={r.id} recipe={r} pantryItems={pantry.items} ratings={{}}
                      onRate={(title, stars) => householdRecipes.updateRating(title, stars)}
                      collapsed={expandedId !== r.id} onToggleCollapse={() => setExpandedId(prev => prev === r.id ? null : r.id)}
                      isSaved={true} onUnsave={() => { householdRecipes.unsave(r.id); toast.show('Recipe removed from household', 'info'); }}
                      mode="saved" settings={settings} />
                  ))}
                </div>
              )}
            </div>
          ) : saved.items.length === 0 ? (
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
              <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', paddingBottom: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>Sort:</span>
                  <select value={sort} onChange={e => setSort(e.target.value)} style={{
                    height: 32, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 8px', fontSize: 12, fontFamily: 'inherit', background: '#fff',
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
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>No recipes match your filters.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filtered.map(r => (
                  <RecipeCard key={r.id} recipe={r} pantryItems={pantry.items} ratings={saved.ratings}
                    onRate={(title, stars) => saved.updateRating(title, stars)}
                    collapsed={expandedId !== r.id} onToggleCollapse={() => setExpandedId(prev => prev === r.id ? null : r.id)}
                    isSaved={true} onUnsave={() => { saved.unsave(r.id); toast.show('Recipe removed', 'info'); }}
                    onMadeIt={(recipe, portions) => { setMadeItRecipe(recipe); setMadeItPortions(portions); }}
                    onCustomize={(recipe) => setCustomizeRecipe(recipe)}
                    onShareToggle={handleShareToggle}
                    mode="saved" settings={settings}
                    onAddToPantry={(name) => { pantry.add([{ name, quantity: 1, unit: 'item' }]); toast.show(`✓ ${name} added to pantry`, 'success'); }}
                    onAddToGrocery={(name) => { grocery?.addItem({ name, quantity: 1, unit: 'item', source: 'recipe_missing' }); toast.show(`🛒 ${name} added to grocery list`, 'success'); }}
                  />
                ))}
              </div>
            </>
          ))}
        </>
      )}

      {/* ── MY CREATIONS TAB ── */}
      {subTab === 'creations' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
              My Recipes
              {userRecipes?.recipes?.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, background: '#f3f4f6', color: '#6b7280', padding: '2px 8px', borderRadius: 20 }}>
                  {userRecipes.recipes.length}
                </span>
              )}
            </div>
            <button onClick={() => { setEditingCreation(null); setShowCreateSheet(true); }} style={{
              height: 36, padding: '0 14px', borderRadius: 10, border: 'none',
              background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>+ Create Recipe</button>
          </div>

          {(!userRecipes?.recipes?.length) ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✍️</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>You haven't created any recipes yet.</div>
              <div style={{ fontSize: 13, marginBottom: 20 }}>Share your cooking with the world.</div>
              <button onClick={() => { setEditingCreation(null); setShowCreateSheet(true); }} style={{
                fontSize: 14, fontWeight: 600, padding: '10px 24px', borderRadius: 10,
                background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}>+ Create Your First Recipe</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {userRecipes.recipes.map(recipe => {
                const isExpanded = expandedCreationId === recipe.id;
                const scale = creationServings && recipe.baseServings ? creationServings / recipe.baseServings : 1;
                const isDeleting = deletingCreationId === recipe.id;
                const isChangingVis = changingVisId === recipe.id;

                return (
                  <div key={recipe.id} style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 14, overflow: 'hidden' }}>
                    {/* Collapsed header */}
                    <div onClick={() => {
                      setExpandedCreationId(prev => prev === recipe.id ? null : recipe.id);
                      setDeletingCreationId(null);
                      setChangingVisId(null);
                    }} style={{ padding: '12px 14px', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', flex: 1, marginRight: 8 }}>{recipe.title}</div>
                        <VisibilityBadge v={recipe.visibility} />
                      </div>
                      {recipe.dietaryTags?.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                          {recipe.dietaryTags.slice(0, 3).map(tag => (
                            <span key={tag} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#f0fdf4', color: '#065f46' }}>{tag}</span>
                          ))}
                          {recipe.dietaryTags.length > 3 && (
                            <span style={{ fontSize: 10, color: '#9ca3af' }}>+{recipe.dietaryTags.length - 3}</span>
                          )}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#6b7280', flexWrap: 'wrap' }}>
                        {recipe.cookTime && <span>⏱ {recipe.cookTime}</span>}
                        {recipe.difficulty && <span style={{ color: recipe.difficulty === 'Easy' ? '#10b981' : recipe.difficulty === 'Medium' ? '#f59e0b' : '#ef4444' }}>{recipe.difficulty}</span>}
                        <span>❤️ {recipe.savedCount || 0}</span>
                        <span>👨‍🍳 {recipe.madeCount || 0}</span>
                        {recipe.ratingCount > 0 && <span>⭐ {(recipe.avgRating || 0).toFixed(1)}</span>}
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #f0f0f0', padding: '14px 14px' }}>
                        {/* Photo */}
                        {recipe.photo && (
                          <img src={recipe.photo} alt={recipe.title} style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, marginBottom: 14, display: 'block' }} />
                        )}

                        {/* Description */}
                        {recipe.description && (
                          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, lineHeight: 1.5 }}>{recipe.description}</p>
                        )}

                        {/* Portion scaler */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, background: '#f9fafb', borderRadius: 10, padding: '8px 12px' }}>
                          <span style={{ fontSize: 12, color: '#6b7280', flex: 1 }}>Servings</span>
                          <button onClick={() => setCreationServings(s => Math.max(1, (s || recipe.baseServings) - 1))} style={{
                            width: 28, height: 28, borderRadius: 8, border: '1px solid #e5e7eb',
                            background: '#fff', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit',
                          }}>−</button>
                          <span style={{ fontSize: 14, fontWeight: 600, minWidth: 24, textAlign: 'center' }}>{creationServings || recipe.baseServings}</span>
                          <button onClick={() => setCreationServings(s => (s || recipe.baseServings) + 1)} style={{
                            width: 28, height: 28, borderRadius: 8, border: '1px solid #e5e7eb',
                            background: '#fff', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit',
                          }}>+</button>
                        </div>

                        {/* Ingredients */}
                        {recipe.ingredients?.length > 0 && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>INGREDIENTS</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {recipe.ingredients.map((ing, i) => (
                                <div key={i} style={{ fontSize: 13, color: '#374151', display: 'flex', gap: 6 }}>
                                  <span style={{ color: '#9ca3af', minWidth: 60 }}>{fmtAmount(ing.amount * scale)} {ing.unit}</span>
                                  <span>{ing.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Steps */}
                        {recipe.steps?.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>INSTRUCTIONS</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {recipe.steps.map((step, i) => (
                                <div key={i} style={{ display: 'flex', gap: 8 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981', minWidth: 20 }}>{i + 1}.</span>
                                  <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{step}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Creator controls */}
                        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginBottom: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>CREATOR CONTROLS</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button onClick={() => { setEditingCreation(recipe); setShowCreateSheet(true); }} style={{
                              fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8,
                              border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}>✏️ Edit Recipe</button>
                            <button onClick={() => { setChangingVisId(isChangingVis ? null : recipe.id); setDeletingCreationId(null); }} style={{
                              fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8,
                              border: '1px solid #e5e7eb', background: isChangingVis ? '#f0fdf4' : '#fff', color: '#374151',
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}>🔄 Change Visibility</button>
                            <button onClick={() => { setDeletingCreationId(isDeleting ? null : recipe.id); setChangingVisId(null); }} style={{
                              fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8,
                              border: '1px solid #fecaca', background: '#fff', color: '#ef4444',
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}>🗑 Delete</button>
                          </div>

                          {isChangingVis && (
                            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {[
                                { key: 'private', label: '🔒 Private' },
                                ...(hh ? [{ key: 'household', label: '🏠 Household' }] : []),
                                { key: 'community', label: '🌍 Community' },
                              ].map(opt => (
                                <button key={opt.key} onClick={async () => {
                                  await userRecipes.toggleVisibility(recipe.id, opt.key);
                                  setChangingVisId(null);
                                  toast.show(`Visibility changed to ${opt.key}`, 'success');
                                }} style={{
                                  fontSize: 12, fontWeight: recipe.visibility === opt.key ? 700 : 400,
                                  padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                                  border: `1px solid ${recipe.visibility === opt.key ? '#10b981' : '#e5e7eb'}`,
                                  background: recipe.visibility === opt.key ? '#f0fdf4' : '#fff',
                                  color: recipe.visibility === opt.key ? '#065f46' : '#374151',
                                }}>{opt.label}</button>
                              ))}
                            </div>
                          )}

                          {isDeleting && (
                            <div style={{ marginTop: 10, padding: '10px 12px', background: '#fef2f2', borderRadius: 10 }}>
                              <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>Delete "{recipe.title}"? This cannot be undone.</div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => setDeletingCreationId(null)} style={{
                                  flex: 1, height: 36, borderRadius: 8, border: '1px solid #e5e7eb',
                                  background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                                }}>Cancel</button>
                                <button onClick={async () => {
                                  await userRecipes.deleteRecipe(recipe.id);
                                  setDeletingCreationId(null);
                                  setExpandedCreationId(null);
                                  toast.show('Recipe deleted', 'info');
                                }} style={{
                                  flex: 1, height: 36, borderRadius: 8, border: 'none',
                                  background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                }}>Delete</button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Comments section */}
                        {recipe.allowComments && recipe.visibility !== 'private' && (
                          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginBottom: 14 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                              COMMENTS {creationComments.length > 0 && `(${creationComments.length})`}
                            </div>
                            {commentsLoading ? (
                              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}><Spinner size={20} /></div>
                            ) : (
                              <>
                                {creationComments.length === 0 && (
                                  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>No comments yet. Be the first!</div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                                  {creationComments.map(c => (
                                    <div key={c.id} style={{ background: '#f9fafb', borderRadius: 10, padding: '8px 10px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {(c.authorName || 'A').charAt(0).toUpperCase()}
                                          </div>
                                          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{c.authorName || 'Anonymous'}</span>
                                          <span style={{ fontSize: 11, color: '#9ca3af' }}>{fmtCommentDate(c.createdAt)}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                          <button onClick={() => handleLikeComment(recipe.id, c.id, c.likedBy || [])} style={{
                                            fontSize: 11, color: (c.likedBy || []).includes(uid) ? '#ef4444' : '#9ca3af',
                                            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0 2px',
                                          }}>♥ {c.likes || 0}</button>
                                          {c.authorUid === uid && (
                                            <button onClick={async () => {
                                              await userRecipes.deleteComment(recipe.id, c.id);
                                              setCreationComments(prev => prev.filter(x => x.id !== c.id));
                                            }} style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0 2px' }}>
                                              Delete
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>{c.text}</div>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <input value={commentText} onChange={e => setCommentText(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handlePostComment(recipe.id)}
                                    placeholder="Add a comment..."
                                    style={{ flex: 1, height: 36, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                                  <button onClick={() => handlePostComment(recipe.id)} disabled={!commentText.trim()} style={{
                                    height: 36, padding: '0 12px', borderRadius: 8, border: 'none',
                                    background: commentText.trim() ? '#10b981' : '#d1d5db', color: '#fff',
                                    fontSize: 13, fontWeight: 600, cursor: commentText.trim() ? 'pointer' : 'default', fontFamily: 'inherit',
                                  }}>Post</button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        {recipe.allowComments === false && recipe.visibility !== 'private' && (
                          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginBottom: 14 }}>
                            <div style={{ fontSize: 12, color: '#9ca3af' }}>
                              Comments are turned off for this recipe.{' '}
                              <button onClick={() => userRecipes.updateRecipe(recipe.id, { allowComments: true }).then(() => toast.show('Comments enabled', 'success'))} style={{
                                fontSize: 12, color: '#10b981', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                              }}>Turn On Comments</button>
                            </div>
                          </div>
                        )}

                        {/* Stats */}
                        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, display: 'flex', gap: 16 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{recipe.madeCount || 0}</div>
                            <div style={{ fontSize: 10, color: '#9ca3af' }}>Made It</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{recipe.savedCount || 0}</div>
                            <div style={{ fontSize: 10, color: '#9ca3af' }}>Saved</div>
                          </div>
                          {recipe.ratingCount > 0 && (
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>⭐ {(recipe.avgRating || 0).toFixed(1)}</div>
                              <div style={{ fontSize: 10, color: '#9ca3af' }}>{recipe.ratingCount} rating{recipe.ratingCount !== 1 ? 's' : ''}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {showCreateSheet && (
            <CreateRecipeSheet
              onClose={() => { setShowCreateSheet(false); setEditingCreation(null); }}
              onSave={handleCreationSave}
              editRecipe={editingCreation}
              toast={toast}
              household={household}
            />
          )}
        </>
      )}

      {/* ── MEAL PLAN TAB ── */}
      {subTab === 'mealplan' && mealPlan && (
        <>
          {hh && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
              <button onClick={() => setPlanTab('personal')} style={planTabStyle(planTab === 'personal')}>👤 My Plan</button>
              <button onClick={() => setPlanTab('household')} style={planTabStyle(planTab === 'household')}>🏠 Household</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
            <button onClick={() => setView('list')} style={planTabStyle(view === 'list')}>📋 List View</button>
            <button onClick={() => setView('calendar')} style={planTabStyle(view === 'calendar')}>📅 Calendar</button>
          </div>

          {view === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {week.map((day, i) => (
                <div key={day.date} style={{ border: '1px solid #f0f0f0', borderRadius: 12, padding: 14, background: '#fff' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2 }}>{fmtDayLabel(day.date, i)}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>{fmtDateShort(day.date)}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {SLOTS.map(slot => (
                      <div key={slot}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginBottom: 4 }}>{SLOT_LABELS[slot]}</div>
                        <MealSlot meal={day[slot]} onAdd={() => setPicker({ date: day.date, slot })} onRemove={() => handleRemoveMeal(day.date, slot)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === 'calendar' && (
            <>
              <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
                {week.map((day, i) => {
                  const d = new Date(day.date + 'T12:00:00');
                  const sel = calDay === i;
                  const hasMeals = SLOTS.some(s => day[s]);
                  return (
                    <button key={day.date} onClick={() => setCalDay(i)} style={{
                      flex: 1, minWidth: 48, padding: '8px 4px', borderRadius: 10,
                      border: sel ? '2px solid #10b981' : '1px solid #f0f0f0',
                      background: sel ? '#f0fdf4' : '#fff', cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}>
                      <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>{DAY_NAMES[d.getDay()].slice(0, 3)}</span>
                      <span style={{ fontSize: 16, fontWeight: sel ? 700 : 500, color: sel ? '#10b981' : '#374151' }}>{d.getDate()}</span>
                      {hasMeals && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />}
                    </button>
                  );
                })}
              </div>
              {week[calDay] && (
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 12, padding: 14, background: '#fff' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2 }}>{fmtDayLabel(week[calDay].date, calDay)}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>{fmtDateShort(week[calDay].date)}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {SLOTS.map(slot => (
                      <div key={slot}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginBottom: 4 }}>{SLOT_LABELS[slot]}</div>
                        <MealSlot meal={week[calDay][slot]} onAdd={() => setPicker({ date: week[calDay].date, slot })} onRemove={() => handleRemoveMeal(week[calDay].date, slot)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <button onClick={addMissingToGrocery} style={{
            width: '100%', height: 44, borderRadius: 10, border: '1px solid #e5e7eb',
            background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit', marginTop: 16,
          }}>🛒 Add missing ingredients to Grocery List</button>

          {picker && (
            <RecipePicker
              targetDate={picker.date} targetSlot={picker.slot}
              savedRecipes={saved.items} pantryItems={pantry.items} toast={toast}
              onSelect={handlePlanSelect} onClose={() => setPicker(null)}
            />
          )}
        </>
      )}

      {/* ── COOK HISTORY TAB ── */}
      {subTab === 'history' && (
        <>
          {cookHistory && cookHistory.history.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cookHistory.getHistory().map(entry => (
                <div key={entry.id} style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, padding: 12 }}>
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
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🍳</div>
              <div style={{ fontSize: 14 }}>No cook history yet. Cook a recipe and tap "Made It!" to track it.</div>
            </div>
          )}

          {cookHistory && cookHistory.substitutions.length > 0 && (
            <div style={{ marginTop: 24, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 12 }}>My Substitutions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cookHistory.getSubstitutions().map(sub => (
                  <div key={sub.id} style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 10, padding: '10px 12px' }}>
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
            </div>
          )}
        </>
      )}

      {madeItRecipe && (
        <MadeItSheet recipe={madeItRecipe} portionSize={madeItPortions} pantry={pantry}
          onClose={() => setMadeItRecipe(null)} toast={toast} cookHistory={cookHistory} />
      )}
      {customizeRecipe && (
        <CustomizeRecipeSheet recipe={customizeRecipe} onClose={() => setCustomizeRecipe(null)} toast={toast} saved={saved} />
      )}
    </div>
  );
}
