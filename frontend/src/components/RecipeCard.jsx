import { useState, useMemo } from 'react';
import SHOPPING_PARTNERS from '../config/shoppingPartners';
import Spinner from './Spinner';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3003';
// Key kept as "pantrypal_*" for backward compatibility
const CLICKS_KEY = 'pantrypal_affiliate_clicks';

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

function logAffiliateClick(partnerId, ingredientName, recipeTitle) {
  try {
    const all = JSON.parse(localStorage.getItem(CLICKS_KEY) || '[]');
    all.push({ partnerId, ingredientName, recipeTitle, clickedAt: new Date().toISOString() });
    localStorage.setItem(CLICKS_KEY, JSON.stringify(all));
  } catch {}
}

function buildShopUrl(partner, ingredient) {
  return partner.urlTemplate.replace('{ingredient}', encodeURIComponent(ingredient));
}

const diffColor = d => d === 'Easy' ? '#10b981' : d === 'Medium' ? '#f59e0b' : '#ef4444';

function MatchBadge({ score }) {
  if (score == null) return null;
  return (
    <span style={{
      fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
      background: score >= 80 ? '#ecfdf5' : score >= 50 ? '#fffbeb' : '#fef2f2',
      color: score >= 80 ? '#065f46' : score >= 50 ? '#92400e' : '#991b1b',
      whiteSpace: 'nowrap',
    }}>{score}% match</span>
  );
}

// ── Missing Ingredient Pill with shopping link ───────────────────────────────
function MissingPill({ name, recipeTitle, enabledPartners, onAddToPantry, onAddToGrocery }) {
  const [open, setOpen] = useState(false);

  function handleClick(e) {
    e.stopPropagation();
    e.preventDefault();
    setOpen(v => !v);
  }

  const dropdownBtn = (label, onClick) => (
    <button onClick={(e) => { e.stopPropagation(); onClick(); setOpen(false); }} style={{
      fontSize: 12, padding: '8px 10px', borderRadius: 6, border: 'none',
      background: '#f9fafb', color: '#374151', cursor: 'pointer',
      fontFamily: 'inherit', textAlign: 'left', fontWeight: 500,
      width: '100%', minHeight: 32,
    }}>{label}</button>
  );

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={handleClick} style={{
        fontSize: 12, padding: '4px 10px', borderRadius: 20, background: '#fef2f2',
        color: '#991b1b', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        display: 'inline-flex', alignItems: 'center', gap: 3, minHeight: 32,
        transition: 'background 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.background = '#fde8e8'}
        onMouseLeave={e => e.currentTarget.style.background = '#fef2f2'}
      >
        {name} ▾
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20,
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 6,
            display: 'flex', flexDirection: 'column', gap: 3, minWidth: 180,
          }}>
            {onAddToPantry && dropdownBtn('+ Add to Pantry', () => onAddToPantry(name))}
            {onAddToGrocery && dropdownBtn('🛒 Add to Grocery List', () => onAddToGrocery(name))}
            {enabledPartners.length > 0 && (onAddToPantry || onAddToGrocery) && (
              <div style={{ height: 1, background: '#f0f0f0', margin: '2px 0' }} />
            )}
            {enabledPartners.map(p => (
              <button key={p.id} onClick={(e) => {
                e.stopPropagation();
                logAffiliateClick(p.id, name, recipeTitle);
                window.open(buildShopUrl(p, name), '_blank', 'noopener');
                setOpen(false);
              }} style={{
                fontSize: 12, padding: '8px 10px', borderRadius: 6, border: 'none',
                background: '#f9fafb', color: '#374151', cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left', fontWeight: 500,
                width: '100%', minHeight: 32,
              }}>{p.icon} {p.name}</button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

// ── Substitution inline dropdown ─────────────────────────────────────────────
function SubSuggest({ ingredient, recipeTitle, pantry, rateLimit }) {
  const [subs, setSubs] = useState(null);
  const [loading, setLoading] = useState(false);

  async function fetchSubs() {
    if (subs) return;
    if (rateLimit && !rateLimit.canUse('substitution_suggest')) {
      rateLimit.showLimitModal('substitution_suggest');
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(`${API}/api/substitutions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredient, recipeTitle }),
      });
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setSubs(data.substitutions || []);
      if (rateLimit) rateLimit.increment('substitution_suggest');
    } catch {
      setSubs([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'inline' }}>
      <button onClick={fetchSubs} style={{
        fontSize: 10, color: '#6b7280', background: 'none', border: 'none',
        cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
        marginLeft: 4,
      }}>
        {loading ? '...' : 'Sub?'}
      </button>
      {subs && subs.length > 0 && (
        <div style={{
          marginTop: 4, padding: 8, background: '#fefce8', border: '1px solid #fde68a',
          borderRadius: 8, fontSize: 12,
        }}>
          {subs.map((s, i) => (
            <div key={i} style={{ marginBottom: i < subs.length - 1 ? 8 : 0 }}>
              <div style={{ fontWeight: 600, color: '#374151' }}>
                {s.name} <span style={{ fontWeight: 400, color: '#6b7280' }}>({s.ratio})</span>
              </div>
              <div style={{ color: '#6b7280', marginBottom: 3 }}>{s.notes}</div>
              {pantry && (
                <button onClick={() => pantry.add([{ name: s.name, quantity: 1, unit: 'item' }])} style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                  background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}>+ Add to Pantry</button>
              )}
            </div>
          ))}
        </div>
      )}
      {subs && subs.length === 0 && (
        <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>No subs found</span>
      )}
    </div>
  );
}

// ── Main RecipeCard ──────────────────────────────────────────────────────────
export default function RecipeCard({
  recipe,
  pantryItems = [],
  pantry,
  ratings = {},
  onRate,
  ratingKey,
  collapsed = false,
  onToggleCollapse,
  isSaved = false,
  onSave,
  onUnsave,
  onMadeIt,
  onCustomize,
  onShareToggle,
  mode = 'discover',
  settings,
  rateLimit,
  cookHistory,
  onAddToPantry,
  onAddToGrocery,
}) {
  const isCommunity = mode === 'community';
  const [showFull, setShowFull] = useState(false);
  const [servings, setServings] = useState(recipe.baseServings || 2);
  const [nutritionTip, setNutritionTip] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [imgError, setImgError] = useState(false);

  const enabledPartners = useMemo(() => {
    const ids = settings?.shoppingPartners || [];
    return SHOPPING_PARTNERS.filter(p => ids.includes(p.id));
  }, [settings?.shoppingPartners]);

  const scaleFactor = (recipe.baseServings && recipe.baseServings > 0)
    ? servings / recipe.baseServings : 1;

  const scaledIngredients = useMemo(() => {
    if (!recipe.ingredients?.length) return [];
    return recipe.ingredients.map(ing => ({
      ...ing,
      scaledAmount: ing.amount * scaleFactor,
    }));
  }, [recipe.ingredients, scaleFactor]);

  const pastSubs = useMemo(() => {
    if (!cookHistory?.substitutions) return {};
    const map = {};
    cookHistory.substitutions
      .filter(s => s.recipeTitle === recipe.title)
      .forEach(s => { if (s.original?.name) map[s.original.name.toLowerCase()] = s.substituted; });
    return map;
  }, [cookHistory?.substitutions, recipe.title]);

  function adjustServings(delta) {
    setServings(s => Math.max(1, Math.min(99, s + delta)));
  }
  function handleServingsInput(val) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1 && n <= 99) setServings(n);
  }

  function handleSaveToggle(e) {
    e.stopPropagation();
    if (isSaved) { onUnsave?.(recipe); }
    else { onSave?.(recipe); }
  }

  const summaryVisible = !collapsed;
  const fullVisible = showFull && summaryVisible;

  return (
    <div style={{
      background: '#fff', border: '1px solid #f0f0f0', borderRadius: 16,
      boxShadow: '0 1px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
      cursor: collapsed ? 'pointer' : 'default',
    }}
      onClick={collapsed ? onToggleCollapse : undefined}
    >
      {recipe.thumbnail && !imgError && (
        <img
          src={recipe.thumbnail}
          alt={recipe.title}
          loading="lazy"
          onError={() => setImgError(true)}
          style={{ width: '100%', height: 180, objectFit: 'cover', objectPosition: 'center', display: 'block' }}
        />
      )}
      <div style={{ padding: collapsed ? '14px 20px' : 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <h3 style={{
            fontSize: collapsed ? 14 : 16, fontWeight: 600, color: '#111827',
            margin: 0, flex: 1, lineHeight: 1.4,
          }}>{recipe.title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <MatchBadge score={recipe.matchScore} />
            {(onSave || onUnsave) && (
              <button onClick={handleSaveToggle} title={isSaved ? 'Remove from saved' : 'Save recipe'} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 20,
                color: isSaved ? '#f59e0b' : '#d1d5db', padding: 0, lineHeight: 1,
              }}>{isSaved ? '★' : '☆'}</button>
            )}
          </div>
        </div>

        {/* Source badges */}
        {recipe.source === 'ai' && (
          <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: '#ede9fe', color: '#6d28d9', display: 'inline-block', marginTop: 4 }}>✨ AI</span>
        )}
        {recipe.source === 'sponsored' && recipe.sponsoredBy && (
          <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: '#fffbeb', color: '#92400e', display: 'inline-block', marginTop: 4 }}>⭐ {recipe.sponsoredBy}</span>
        )}

        <div style={{
          maxHeight: summaryVisible ? 2000 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}>
          {isCommunity && recipe.authorName && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>By {recipe.authorName}</div>
          )}

          <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: 10, marginTop: 8 }}>{recipe.description}</p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {isCommunity && <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#ecfdf5', color: '#065f46' }}>{recipe.isUserSubmitted ? 'Original Recipe' : 'Community Recipe'}</span>}
            {recipe.cuisine && <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#f3f4f6', color: '#374151' }}>{recipe.cuisine}</span>}
            {recipe.cookTime && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f3f4f6', color: '#6b7280' }}>⏱ {recipe.cookTime}</span>}
            {recipe.difficulty && <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#f3f4f6', color: diffColor(recipe.difficulty) }}>{recipe.difficulty}</span>}
            {isCommunity && recipe.ratingCount > 0 && (
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#fffbeb', color: '#92400e' }}>★ {(recipe.rating || 0).toFixed(1)} ({recipe.ratingCount})</span>
            )}
            {isCommunity && recipe.saveCount > 0 && (
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f3f4f6', color: '#6b7280' }}>{recipe.saveCount} saved</span>
            )}
          </div>

          {/* Missing ingredients with shopping links */}
          {recipe.missingIngredients?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#9ca3af', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                MISSING
                {enabledPartners.length === 0 && (
                  <button onClick={(e) => { e.stopPropagation(); settings?.onOpenSettings?.(); }} style={{
                    fontSize: 10, color: '#10b981', background: 'none', border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>Shop for ingredients</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {recipe.missingIngredients.map(m => (
                  <MissingPill key={m} name={m} recipeTitle={recipe.title} enabledPartners={enabledPartners} onAddToPantry={onAddToPantry} onAddToGrocery={onAddToGrocery} />
                ))}
              </div>
            </div>
          )}

          {(() => {
            const rKey = ratingKey || recipe.title;
            const currentRating = ratings[rKey] || 0;
            const isLocked = isCommunity && currentRating > 0;
            return (
              <div style={{ display: 'flex', gap: 2, marginBottom: 12, alignItems: 'center' }}>
                {[1,2,3,4,5].map(star => (
                  <button key={star} onClick={(e) => { e.stopPropagation(); if (!isLocked) onRate?.(recipe.title, star); }}
                    title={isLocked ? 'You already rated this recipe' : `Rate ${star} star${star > 1 ? 's' : ''}`}
                    style={{
                      background: 'none', border: 'none', cursor: isLocked ? 'default' : 'pointer', fontSize: 20,
                      color: currentRating >= star ? '#f59e0b' : '#e5e7eb',
                      padding: '2px', lineHeight: 1, opacity: isLocked ? 0.8 : 1,
                    }}>★</button>
                ))}
                {isLocked && <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>Rated</span>}
              </div>
            );
          })()}

          {onMadeIt && !isCommunity && (
            <button onClick={(e) => { e.stopPropagation(); onMadeIt(recipe, servings); }} style={{
              width: '100%', height: 38, borderRadius: 8, border: 'none',
              background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8,
            }}>✅ Made It</button>
          )}

          {onCustomize && !isCommunity && (
            <button onClick={(e) => { e.stopPropagation(); onCustomize(recipe); }} style={{
              width: '100%', height: 38, borderRadius: 8, border: '1px solid #e5e7eb',
              background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8,
            }}>✏️ Customize</button>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={(e) => { e.stopPropagation(); setShowFull(v => !v); }} style={{
              flex: 1, height: 38, borderRadius: 8, border: '1px solid #e5e7eb',
              background: showFull ? '#f0fdf4' : '#fff', color: showFull ? '#059669' : '#374151',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
            }}>Full Recipe {showFull ? '▴' : '▾'}</button>
            {recipe.nutrition?.calories > 0 ? (
              <button onClick={(e) => { e.stopPropagation(); setShowNutrition(v => !v); }} style={{
                flex: 1, height: 38, borderRadius: 8, border: '1px solid #e5e7eb',
                background: showNutrition ? '#fffbeb' : '#fff', color: showNutrition ? '#92400e' : '#374151',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              }}>Nutrition {showNutrition ? '▴' : '▾'}</button>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); setNutritionTip(true); }} onMouseLeave={() => setNutritionTip(false)}
                style={{ flex: 1, height: 38, borderRadius: 8, border: '1px solid #f0f0f0', background: '#fafafa', color: '#c0c0c0', fontSize: 13, fontWeight: 500, cursor: 'default', fontFamily: 'inherit', position: 'relative' }}>
                Nutrition ▾
                {nutritionTip && <span style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', background: '#1f2937', color: '#fff', fontSize: 11, padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap', zIndex: 10 }}>Nutritional facts coming in v2</span>}
              </button>
            )}
          </div>

          {showNutrition && recipe.nutrition?.calories > 0 && (() => {
            const base = recipe.baseServings || 2;
            const scale = servings / base;
            const scaled = scale !== 1;
            const n = {
              calories: Math.round(recipe.nutrition.calories * scale),
              protein: Math.round((recipe.nutrition.protein || 0) * scale),
              carbs: Math.round((recipe.nutrition.carbs || 0) * scale),
              fat: Math.round((recipe.nutrition.fat || 0) * scale),
              fiber: Math.round((recipe.nutrition.fiber || 0) * scale),
            };
            const box = (icon, value, unit, label) => (
              <div style={{ flex: 1, background: '#fffbeb', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, marginBottom: 2 }}>{icon}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{value}<span style={{ fontSize: 12, fontWeight: 400, color: '#6b7280' }}>{unit}</span></div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{label}</div>
              </div>
            );
            return (
              <div style={{ marginTop: 10, padding: 12, background: '#fefce8', borderRadius: 10, border: '1px solid #fde68a' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 10 }}>
                  Nutrition per serving{scaled ? ' (scaled)' : ''}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {box('🔥', n.calories, 'kcal', 'Calories')}
                  {box('💪', n.protein, 'g', 'Protein')}
                  {box('🌾', n.carbs, 'g', 'Carbs')}
                  {box('🥑', n.fat, 'g', 'Fat')}
                </div>
                {n.fiber > 0 && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Fiber: {n.fiber}g per serving</div>
                )}
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
                  Estimates based on {base} servings
                </div>
              </div>
            );
          })()}

          {mode === 'saved' && onShareToggle && (
            <button onClick={(e) => { e.stopPropagation(); onShareToggle(recipe); }} style={{
              width: '100%', height: 34, borderRadius: 8, border: '1px solid #e5e7eb',
              background: recipe.sharedToPublic ? '#eff6ff' : '#fff',
              color: recipe.sharedToPublic ? '#1d4ed8' : '#6b7280',
              fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8,
            }}>{recipe.sharedToPublic ? '🌍 Shared with Community' : '🌍 Share to Community'}</button>
          )}

          {mode === 'saved' && (
            <div style={{ marginTop: 10, textAlign: 'center' }}>
              {confirmRemove ? (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>Remove this recipe?</span>
                  <button onClick={(e) => { e.stopPropagation(); onUnsave?.(recipe); setConfirmRemove(false); }}
                    style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Yes</button>
                  <button onClick={(e) => { e.stopPropagation(); setConfirmRemove(false); }}
                    style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                </div>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); setConfirmRemove(true); }}
                  style={{ fontSize: 12, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Remove from saved</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full recipe detail — ingredients + steps */}
      <div style={{
        maxHeight: fullVisible ? 3000 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.35s ease',
      }}>
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid #f0f0f0' }}>
          {scaledIngredients.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Ingredients</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => adjustServings(-1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', lineHeight: 1 }}>−</button>
                  <input type="number" min="1" max="99" value={servings} onChange={e => handleServingsInput(e.target.value)}
                    style={{ width: 40, height: 28, border: '1px solid #e5e7eb', borderRadius: 6, textAlign: 'center', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                  <button onClick={() => adjustServings(1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', lineHeight: 1 }}>+</button>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>servings</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {scaledIngredients.map((ing, j) => {
                  const inPantry = pantryHasIngredient(pantryItems, ing.name);
                  const isMissing = recipe.missingIngredients?.some(m =>
                    m.toLowerCase().includes(ing.name.toLowerCase()) || ing.name.toLowerCase().includes(m.toLowerCase())
                  );
                  const pastSub = pastSubs[ing.name.toLowerCase()];
                  return (
                    <div key={j}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 10px', borderRadius: 8,
                        background: inPantry ? '#f0fdf4' : isMissing ? '#fafafa' : '#fff',
                      }}>
                        <span style={{ fontSize: 13, color: inPantry ? '#059669' : isMissing ? '#9ca3af' : '#374151', flex: 1 }}>
                          • {formatAmount(ing.scaledAmount)} {ing.unit} {ing.name}
                          {isMissing && !inPantry && (
                            <SubSuggest ingredient={ing.name} recipeTitle={recipe.title} pantry={pantry} rateLimit={rateLimit} />
                          )}
                        </span>
                        {inPantry && <span style={{ fontSize: 10, fontWeight: 500, color: '#059669', background: '#ecfdf5', padding: '1px 6px', borderRadius: 10 }}>✓ in pantry</span>}
                        {!inPantry && isMissing && enabledPartners.length > 0 && (
                          <MissingPill name={ing.name} recipeTitle={recipe.title} enabledPartners={enabledPartners} onAddToPantry={onAddToPantry} onAddToGrocery={onAddToGrocery} />
                        )}
                        {!inPantry && isMissing && enabledPartners.length === 0 && (
                          <span style={{ fontSize: 10, fontWeight: 500, color: '#9ca3af', background: '#f3f4f6', padding: '1px 6px', borderRadius: 10 }}>shopping list</span>
                        )}
                      </div>
                      {pastSub && (
                        <div style={{ marginLeft: 26, fontSize: 11, color: '#6b7280', fontStyle: 'italic', padding: '2px 0' }}>
                          Last time you used {pastSub.name} instead
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {recipe.steps?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>Instructions</div>
              <ol style={{ margin: 0, paddingLeft: 22, fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                {recipe.steps.map((s, j) => <li key={j} style={{ marginBottom: 10, paddingLeft: 4 }}>{s}</li>)}
              </ol>
            </div>
          )}
          {(!recipe.steps || recipe.steps.length === 0) && recipe.sourceUrl && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Instructions</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>View full recipe instructions:</div>
              <button onClick={(e) => { e.stopPropagation(); window.open(recipe.sourceUrl, '_blank', 'noopener'); }} style={{
                width: '100%', height: 40, borderRadius: 8, border: '1px solid #e5e7eb',
                background: '#fff', color: '#10b981', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>🔗 Open Original Recipe</button>
            </div>
          )}
          {(!recipe.ingredients || recipe.ingredients.length === 0) && recipe.steps?.length > 0 && (
            <div style={{ marginTop: 16, fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
              Structured ingredients not available for this recipe. Try shuffling for new results.
            </div>
          )}
          {onMadeIt && !isCommunity && recipe.ingredients?.length > 0 && (
            <button onClick={(e) => { e.stopPropagation(); onMadeIt(recipe, servings); }} style={{
              width: '100%', height: 42, borderRadius: 10, border: 'none',
              background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', marginTop: 20,
            }}>✅ Made It</button>
          )}
        </div>
      </div>
    </div>
  );
}
