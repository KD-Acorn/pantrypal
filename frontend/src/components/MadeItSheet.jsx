import { useState, useMemo } from 'react';

const UNITS = ['item','box','can','bag','bottle','jar','cup','oz','lb','g','ml','l','bunch','clove','slice','pinch','pack'];

function formatAmount(n) {
  if (n >= 1) return Math.round(n * 10) / 10;
  if (n === 0.5) return '½';
  if (n === 0.25) return '¼';
  if (n === 0.75) return '¾';
  if (Math.abs(n - 0.33) < 0.02) return '⅓';
  if (Math.abs(n - 0.67) < 0.02) return '⅔';
  return Math.round(n * 100) / 100;
}

function findPantryItem(pantryItems, name) {
  const lower = name.toLowerCase();
  return pantryItems.find(p => {
    const pn = p.name.toLowerCase();
    return pn === lower || pn.includes(lower) || lower.includes(pn);
  });
}

export default function MadeItSheet({ recipe, portionSize, pantry, onClose, toast, cookHistory }) {
  const scaleFactor = (recipe.baseServings && recipe.baseServings > 0)
    ? portionSize / recipe.baseServings : 1;

  const ingredients = useMemo(() => {
    if (!recipe.ingredients?.length) return [];
    return recipe.ingredients.map((ing, idx) => ({
      ...ing,
      scaledAmount: ing.amount * scaleFactor,
      pantryItem: findPantryItem(pantry.items, ing.name),
      idx,
    }));
  }, [recipe.ingredients, scaleFactor, pantry.items]);

  const [checked, setChecked] = useState(() =>
    ingredients.map(ing => !!ing.pantryItem)
  );
  const [subs, setSubs] = useState({});
  const [subFormIdx, setSubFormIdx] = useState(null);
  const [subForm, setSubForm] = useState({ amount: 1, unit: 'item', name: '' });

  function toggleCheck(idx) {
    setChecked(prev => prev.map((c, i) => i === idx ? !c : c));
  }

  function openSubForm(idx) {
    setSubFormIdx(idx);
    setSubForm({ amount: 1, unit: 'item', name: '' });
  }

  function saveSub(idx) {
    setSubs(prev => ({ ...prev, [idx]: { ...subForm } }));
    setChecked(prev => prev.map((c, i) => i === idx ? false : c));
    setSubFormIdx(null);
  }

  function handleConfirm() {
    let belowZero = false;
    const ingredientsUsed = [];
    const cookSubs = [];

    // Aggregate subtractions per pantry item ID to handle duplicates
    const subtractions = {};

    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      if (checked[i] && ing.pantryItem) {
        const id = ing.pantryItem.id;
        subtractions[id] = (subtractions[id] || 0) + ing.scaledAmount;
        ingredientsUsed.push({ amount: ing.scaledAmount, unit: ing.unit, name: ing.name });
      }
    }

    for (const [idx, sub] of Object.entries(subs)) {
      const ing = ingredients[parseInt(idx)];
      const subPantryItem = findPantryItem(pantry.items, sub.name);
      if (subPantryItem) {
        const id = subPantryItem.id;
        subtractions[id] = (subtractions[id] || 0) + sub.amount;
      }
      ingredientsUsed.push({ amount: sub.amount, unit: sub.unit, name: sub.name });
      const subEntry = {
        original: { amount: ing.scaledAmount, unit: ing.unit, name: ing.name },
        substituted: { amount: sub.amount, unit: sub.unit, name: sub.name },
      };
      cookSubs.push(subEntry);
      cookHistory.logSubstitution({ recipeTitle: recipe.title, ...subEntry });
    }

    for (const [id, amount] of Object.entries(subtractions)) {
      const item = pantry.items.find(p => p.id === id);
      if (item) {
        const newQty = item.quantity - amount;
        if (newQty < 0) belowZero = true;
        pantry.update(id, { quantity: Math.max(0, newQty) });
      }
    }

    cookHistory.logCook({
      recipeTitle: recipe.title,
      cuisine: recipe.cuisine || '',
      cookTime: recipe.cookTime || '',
      difficulty: recipe.difficulty || '',
      portionSize,
      ingredientsUsed,
      substitutions: cookSubs,
    });

    if (belowZero) {
      toast.show('Pantry updated! Some quantities were set to 0.', 'success');
    } else {
      toast.show('Pantry updated! Great cooking 👨‍🍳', 'success');
    }
    onClose();
  }

  if (!recipe.ingredients?.length) {
    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
          padding: '24px 16px', textAlign: 'center', animation: 'madeItSlideUp 0.3s ease-out',
        }}>
          <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
            No structured ingredient data for this recipe.
          </div>
          <button onClick={onClose} style={{
            width: '100%', height: 44, borderRadius: 10, border: 'none',
            background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Close</button>
        </div>
        <style>{`@keyframes madeItSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      </div>
    );
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      animation: 'madeItFadeIn 0.2s ease-out',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
        maxHeight: '85dvh', overflow: 'auto', padding: '20px 16px',
        animation: 'madeItSlideUp 0.3s ease-out',
      }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
            Confirm Ingredients Used
          </div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            Uncheck anything you didn't use. Tap "Sub" to log a substitution.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {ingredients.map((ing, idx) => {
            const inPantry = !!ing.pantryItem;
            const hasSub = !!subs[idx];
            return (
              <div key={idx}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  borderRadius: 10, border: '1px solid #f0f0f0',
                  background: !inPantry && !hasSub ? '#f9fafb' : checked[idx] ? '#f0fdf4' : '#fff',
                  opacity: !inPantry && !hasSub ? 0.5 : 1,
                }}>
                  <input type="checkbox" checked={checked[idx]}
                    onChange={() => toggleCheck(idx)} disabled={!inPantry && !hasSub}
                    style={{ accentColor: '#10b981', width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>
                    {formatAmount(ing.scaledAmount)} {ing.unit} {ing.name}
                  </span>
                  {!inPantry && !hasSub && (
                    <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500, flexShrink: 0 }}>not in pantry</span>
                  )}
                  {hasSub && (
                    <span style={{ fontSize: 10, color: '#059669', fontWeight: 500, flexShrink: 0 }}>subbed</span>
                  )}
                  <button onClick={() => openSubForm(idx)} style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                    border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280',
                    cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                  }}>Sub</button>
                </div>

                {subFormIdx === idx && (
                  <div style={{
                    margin: '4px 0 0 26px', padding: 12, borderRadius: 10,
                    background: '#fafafa', border: '1px solid #f0f0f0',
                  }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                      I used this instead of {ing.name}:
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      <input type="number" min="0.1" step="0.1" value={subForm.amount}
                        onChange={e => setSubForm(s => ({ ...s, amount: parseFloat(e.target.value) || 1 }))}
                        style={{
                          width: 56, height: 32, border: '1px solid #e5e7eb', borderRadius: 8,
                          padding: '0 6px', fontSize: 12, fontFamily: 'inherit', textAlign: 'center',
                        }}
                      />
                      <select value={subForm.unit}
                        onChange={e => setSubForm(s => ({ ...s, unit: e.target.value }))}
                        style={{
                          height: 32, border: '1px solid #e5e7eb', borderRadius: 8,
                          padding: '0 6px', fontSize: 12, fontFamily: 'inherit', background: '#fff',
                        }}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <input placeholder="Ingredient name" value={subForm.name}
                        onChange={e => setSubForm(s => ({ ...s, name: e.target.value }))}
                        style={{
                          flex: 1, minWidth: 100, height: 32, border: '1px solid #e5e7eb',
                          borderRadius: 8, padding: '0 8px', fontSize: 12, fontFamily: 'inherit',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setSubFormIdx(null)} style={{
                        flex: 1, height: 30, borderRadius: 6, border: '1px solid #e5e7eb',
                        background: '#fff', color: '#374151', fontSize: 12, cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}>Cancel</button>
                      <button onClick={() => saveSub(idx)} disabled={!subForm.name.trim()} style={{
                        flex: 1, height: 30, borderRadius: 6, border: 'none',
                        background: subForm.name.trim() ? '#10b981' : '#d1d5db',
                        color: '#fff', fontSize: 12, fontWeight: 600,
                        cursor: subForm.name.trim() ? 'pointer' : 'default',
                        fontFamily: 'inherit',
                      }}>Save Sub</button>
                    </div>
                  </div>
                )}

                {hasSub && subFormIdx !== idx && (
                  <div style={{ margin: '4px 0 0 26px', padding: '6px 10px', borderRadius: 8, background: '#f0fdf4' }}>
                    <div style={{ fontSize: 12, color: '#059669' }}>
                      Using {formatAmount(subs[idx].amount)} {subs[idx].unit} {subs[idx].name} instead
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                      💡 Sub saved to My Substitutions
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, height: 44, borderRadius: 10, border: '1px solid #e5e7eb',
            background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={handleConfirm} style={{
            flex: 1, height: 44, borderRadius: 10, border: 'none',
            background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Confirm & Update Pantry</button>
        </div>
      </div>

      <style>{`
        @keyframes madeItSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes madeItFadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
