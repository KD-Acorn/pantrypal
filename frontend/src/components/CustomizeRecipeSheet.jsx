import { useState, useRef } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

const UNITS = ['cup','tbsp','tsp','oz','lb','g','ml','l','whole','item','pinch','clove','slice','can','bag','box','bottle','jar','bunch','pack'];

export default function CustomizeRecipeSheet({ recipe, onClose, toast, saved }) {
  const { currentUser } = useAuth();
  const keyRef = useRef(200);
  const nextKey = () => keyRef.current++;

  const [title, setTitle] = useState(recipe.title + ' (My Version)');
  const [baseServings, setBaseServings] = useState(recipe.baseServings || 2);
  const [ingredients, setIngredients] = useState(() =>
    (recipe.ingredients || []).map((ing, i) => ({ ...ing, key: i }))
  );
  const [steps, setSteps] = useState(() =>
    (recipe.steps || []).map((s, i) => ({ text: s, key: i }))
  );
  const [showVisibility, setShowVisibility] = useState(false);
  const [saving, setSaving] = useState(false);

  function updateIng(key, field, value) {
    setIngredients(prev => prev.map(ing =>
      ing.key === key ? { ...ing, [field]: value } : ing
    ));
  }
  function removeIng(key) {
    setIngredients(prev => prev.filter(ing => ing.key !== key));
  }
  function addIng() {
    setIngredients(prev => [...prev, { amount: 1, unit: 'item', name: '', key: nextKey() }]);
  }
  function updateStep(key, text) {
    setSteps(prev => prev.map(s => s.key === key ? { ...s, text } : s));
  }
  function removeStep(key) {
    setSteps(prev => prev.filter(s => s.key !== key));
  }
  function addStep() {
    setSteps(prev => [...prev, { text: '', key: nextKey() }]);
  }

  function buildRecipe() {
    return {
      title: title.trim(),
      description: recipe.description || '',
      cookTime: recipe.cookTime || '',
      difficulty: recipe.difficulty || '',
      cuisine: recipe.cuisine || '',
      baseServings,
      ingredients: ingredients
        .filter(ing => ing.name.trim())
        .map(({ key, ...ing }) => ({ ...ing, amount: parseFloat(ing.amount) || 1 })),
      steps: steps.map(s => s.text.trim()).filter(Boolean),
      matchScore: recipe.matchScore,
      missingIngredients: [],
      isCustom: true,
      originalTitle: recipe.originalTitle || recipe.title,
    };
  }

  function handleSaveJustMe() {
    const r = buildRecipe();
    if (!r.title) { toast.show('Recipe needs a name', 'error'); return; }
    saved.save(r);
    toast.show('Custom recipe saved', 'success');
    onClose();
  }

  async function handleSavePublic() {
    const r = buildRecipe();
    if (!r.title) { toast.show('Recipe needs a name', 'error'); return; }
    setSaving(true);
    try {
      const publicId = `pub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      saved.save({ ...r, sharedToPublic: true, publicRecipeId: publicId });
      await setDoc(doc(db, 'public_recipes', publicId), {
        id: publicId,
        title: r.title,
        description: r.description,
        cookTime: r.cookTime,
        difficulty: r.difficulty,
        cuisine: r.cuisine,
        baseServings: r.baseServings,
        ingredients: r.ingredients,
        steps: r.steps,
        authorUid: currentUser.uid,
        authorName: currentUser.displayName || '',
        sharedAt: serverTimestamp(),
        rating: 0,
        ratingCount: 0,
        saveCount: 0,
        isCustom: true,
        originalTitle: r.originalTitle,
      });
      toast.show('Recipe shared with community', 'success');
      onClose();
    } catch (err) {
      console.error('Share error:', err);
      toast.show('Failed to share — recipe saved privately', 'error');
    } finally {
      setSaving(false);
    }
  }

  const inputSm = {
    height: 34, border: '1px solid #e5e7eb', borderRadius: 8,
    padding: '0 8px', fontSize: 12, fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      animation: 'crsOverlayIn 0.2s ease-out',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
        maxHeight: '90dvh', overflow: 'auto', padding: '20px 16px',
        animation: 'crsSlideUp 0.3s ease-out',
      }}>
        {!showVisibility ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 2 }}>
                Customize Recipe
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>Based on: {recipe.title}</div>
            </div>

            {/* Recipe Name */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>RECIPE NAME</div>
              <input value={title} onChange={e => setTitle(e.target.value)}
                style={{ ...inputSm, width: '100%', height: 40, fontSize: 14 }} />
            </div>

            {/* Servings */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>SERVINGS</div>
              <input type="number" min="1" max="99" value={baseServings}
                onChange={e => setBaseServings(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ ...inputSm, width: 70, textAlign: 'center' }} />
            </div>

            {/* Ingredients */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>INGREDIENTS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ingredients.map(ing => (
                  <div key={ing.key} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="number" min="0" step="0.25" value={ing.amount}
                      onChange={e => updateIng(ing.key, 'amount', e.target.value)}
                      style={{ ...inputSm, width: 52, textAlign: 'center' }} />
                    <select value={ing.unit} onChange={e => updateIng(ing.key, 'unit', e.target.value)}
                      style={{ ...inputSm, padding: '0 4px', fontSize: 11, width: 62 }}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <input value={ing.name} onChange={e => updateIng(ing.key, 'name', e.target.value)}
                      placeholder="Ingredient" style={{ ...inputSm, flex: 1, minWidth: 0 }} />
                    <button onClick={() => removeIng(ing.key)} style={{
                      width: 28, height: 28, borderRadius: 6, border: 'none',
                      background: '#fef2f2', color: '#ef4444', fontSize: 14,
                      cursor: 'pointer', flexShrink: 0, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}>×</button>
                  </div>
                ))}
              </div>
              <button onClick={addIng} style={{
                marginTop: 8, fontSize: 12, fontWeight: 500, color: '#10b981',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              }}>+ Add Ingredient</button>
            </div>

            {/* Steps */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>STEPS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {steps.map((step, idx) => (
                  <div key={step.key} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: '#9ca3af', paddingTop: 8,
                      width: 20, textAlign: 'right', flexShrink: 0,
                    }}>{idx + 1}.</span>
                    <textarea value={step.text} onChange={e => updateStep(step.key, e.target.value)}
                      rows={2} style={{
                        ...inputSm, flex: 1, minWidth: 0, height: 'auto', minHeight: 60,
                        padding: '8px', resize: 'vertical', lineHeight: 1.5,
                      }} />
                    <button onClick={() => removeStep(step.key)} style={{
                      width: 28, height: 28, borderRadius: 6, border: 'none',
                      background: '#fef2f2', color: '#ef4444', fontSize: 14,
                      cursor: 'pointer', flexShrink: 0, marginTop: 2, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}>×</button>
                  </div>
                ))}
              </div>
              <button onClick={addStep} style={{
                marginTop: 8, fontSize: 12, fontWeight: 500, color: '#10b981',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              }}>+ Add Step</button>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{
                flex: 1, height: 44, borderRadius: 10, border: '1px solid #e5e7eb',
                background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancel</button>
              <button onClick={() => setShowVisibility(true)} style={{
                flex: 1, height: 44, borderRadius: 10, border: 'none',
                background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Save Recipe</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
                Who can see this recipe?
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <button onClick={handleSaveJustMe} disabled={saving} style={{
                padding: 16, borderRadius: 14, border: '2px solid #e5e7eb',
                background: '#fff', cursor: saving ? 'default' : 'pointer',
                textAlign: 'left', fontFamily: 'inherit',
              }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>🔒</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Just Me</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Saves to My Recipes privately</div>
              </button>

              <button onClick={handleSavePublic} disabled={saving} style={{
                padding: 16, borderRadius: 14, border: '2px solid #e5e7eb',
                background: '#fff', cursor: saving ? 'default' : 'pointer',
                textAlign: 'left', fontFamily: 'inherit',
              }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>🌍</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Share with Community</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Saves to My Recipes AND shares publicly</div>
              </button>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button onClick={() => setShowVisibility(false)} style={{
                background: 'none', border: 'none', color: '#6b7280', fontSize: 13,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancel</button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes crsSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes crsOverlayIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
