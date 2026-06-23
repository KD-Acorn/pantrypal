import { useState, useMemo } from 'react';

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

export default function RecipeCard({
  recipe,
  pantryItems = [],
  ratings = {},
  onRate,
  collapsed = false,
  onToggleCollapse,
  isSaved = false,
  onSave,
  onUnsave,
  mode = 'discover',
}) {
  const [showFull, setShowFull] = useState(false);
  const [servings, setServings] = useState(recipe.baseServings || 2);
  const [nutritionTip, setNutritionTip] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

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
      <div style={{ padding: collapsed ? '14px 20px' : 20 }}>
        {/* Title row: title + match badge + save button */}
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

        {/* Summary content — visible when not collapsed */}
        <div style={{
          maxHeight: summaryVisible ? 1000 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}>
          <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: 10, marginTop: 8 }}>{recipe.description}</p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {recipe.cuisine && <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#f3f4f6', color: '#374151' }}>{recipe.cuisine}</span>}
            {recipe.cookTime && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f3f4f6', color: '#6b7280' }}>⏱ {recipe.cookTime}</span>}
            {recipe.difficulty && <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#f3f4f6', color: diffColor(recipe.difficulty) }}>{recipe.difficulty}</span>}
          </div>

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

          <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
            {[1,2,3,4,5].map(star => (
              <button key={star} onClick={(e) => { e.stopPropagation(); onRate?.(recipe.title, star); }} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 20,
                color: (ratings[recipe.title] || 0) >= star ? '#f59e0b' : '#e5e7eb',
                padding: '2px', lineHeight: 1,
              }}>★</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={(e) => { e.stopPropagation(); setShowFull(v => !v); }} style={{
              flex: 1, height: 38, borderRadius: 8, border: '1px solid #e5e7eb',
              background: showFull ? '#f0fdf4' : '#fff', color: showFull ? '#059669' : '#374151',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Full Recipe {showFull ? '▴' : '▾'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setNutritionTip(true); }}
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
                  fontSize: 11, padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap', zIndex: 10,
                }}>Nutritional facts coming in v2</span>
              )}
            </button>
          </div>

          {/* Remove from saved — only in saved mode */}
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
                  style={{ fontSize: 12, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Remove from saved
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full recipe detail — ingredients + steps */}
      <div style={{
        maxHeight: fullVisible ? 2000 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.35s ease',
      }}>
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid #f0f0f0' }}>
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
                  <input type="number" min="1" max="99" value={servings}
                    onChange={e => handleServingsInput(e.target.value)}
                    style={{
                      width: 40, height: 28, border: '1px solid #e5e7eb', borderRadius: 6,
                      textAlign: 'center', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                    }} />
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
                      <span style={{ fontSize: 13, color: inPantry ? '#059669' : isMissing ? '#9ca3af' : '#374151' }}>
                        • {formatAmount(ing.scaledAmount)} {ing.unit} {ing.name}
                      </span>
                      {inPantry && <span style={{ fontSize: 10, fontWeight: 500, color: '#059669', background: '#ecfdf5', padding: '1px 6px', borderRadius: 10 }}>✓ in pantry</span>}
                      {!inPantry && isMissing && <span style={{ fontSize: 10, fontWeight: 500, color: '#9ca3af', background: '#f3f4f6', padding: '1px 6px', borderRadius: 10 }}>shopping list</span>}
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
