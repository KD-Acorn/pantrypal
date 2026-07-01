import { useState, useRef } from 'react';

const UNITS = ['cup','tbsp','tsp','oz','lb','g','ml','l','whole','item','pinch','clove','slice','can','bag','box','bottle','jar','bunch','pack'];
const CUISINES = ['Italian', 'Asian', 'Mexican', 'Quick & Easy', 'Mediterranean', 'Other'];
const DIETARY_TAGS = [
  'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Nut-Free',
  'No Pork', 'No Beef', 'Halal', 'Kosher', 'Keto', 'Paleo', 'Low Sodium', 'No Spicy',
];

export default function CreateRecipeSheet({ onClose, onSave, editRecipe = null, toast, household }) {
  const keyRef = useRef(100);
  const nextKey = () => ++keyRef.current;
  const photoRef = useRef(null);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Step 1
  const [title, setTitle] = useState(editRecipe?.title || '');
  const [description, setDescription] = useState(editRecipe?.description || '');
  const [cuisine, setCuisine] = useState(editRecipe?.cuisine || '');
  const [cookTime, setCookTime] = useState(editRecipe?.cookTime || '');
  const [difficulty, setDifficulty] = useState(editRecipe?.difficulty || 'Medium');
  const [servings, setServings] = useState(editRecipe?.baseServings || 4);
  const [dietaryTags, setDietaryTags] = useState(editRecipe?.dietaryTags || []);

  // Step 2
  const [ingredients, setIngredients] = useState(() =>
    editRecipe?.ingredients?.length
      ? editRecipe.ingredients.map((ing, i) => ({ ...ing, key: i }))
      : [{ amount: 1, unit: 'item', name: '', key: 0 }]
  );

  // Step 3
  const [steps, setSteps] = useState(() =>
    editRecipe?.steps?.length
      ? editRecipe.steps.map((s, i) => ({ text: s, key: i }))
      : [{ text: '', key: 0 }]
  );
  const [photo, setPhoto] = useState(editRecipe?.photo || null);
  const [visibility, setVisibility] = useState(editRecipe?.visibility || 'private');
  const [allowComments, setAllowComments] = useState(editRecipe?.allowComments !== false);

  function updateIng(key, field, value) {
    setIngredients(prev => prev.map(i => i.key === key ? { ...i, [field]: value } : i));
  }
  function removeIng(key) {
    setIngredients(prev => prev.filter(i => i.key !== key));
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
  function toggleTag(tag) {
    setDietaryTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { toast.show('Photo must be under 1MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = ev => setPhoto(ev.target.result);
    reader.readAsDataURL(file);
  }

  function validateStep1() {
    if (!title.trim()) { setErrors({ title: 'Recipe name is required' }); return false; }
    setErrors({});
    return true;
  }
  function validateStep2() {
    if (!ingredients.some(i => i.name.trim())) { setErrors({ ingredients: 'Add at least one ingredient' }); return false; }
    setErrors({});
    return true;
  }
  function validateStep3() {
    if (!steps.some(s => s.text.trim())) { setErrors({ steps: 'Add at least one step' }); return false; }
    setErrors({});
    return true;
  }

  function handleNext() {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep(s => s + 1);
  }

  async function handleSave() {
    if (!validateStep3()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        cuisine,
        cookTime: cookTime.trim(),
        difficulty,
        baseServings: servings,
        ingredients: ingredients
          .filter(i => i.name.trim())
          .map(({ key, ...i }) => ({ ...i, amount: parseFloat(i.amount) || 1 })),
        steps: steps.map(s => s.text.trim()).filter(Boolean),
        dietaryTags,
        photo: photo || null,
        visibility,
        allowComments: visibility !== 'private' ? allowComments : false,
      });
    } catch (err) {
      console.error('Save error:', err);
      toast.show('Failed to save recipe', 'error');
      setSaving(false);
    }
  }

  const inp = {
    border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 8px',
    fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };
  const err = (msg) => msg ? <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{msg}</div> : null;
  const stepLabels = ['Details', 'Ingredients', 'Steps & Share'];

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
        maxHeight: '92dvh', overflow: 'auto', padding: '20px 16px 36px',
        animation: 'crsSlideUp 0.3s ease-out',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
            {editRecipe ? 'Edit Recipe' : 'Create a Recipe'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', padding: '0 2px' }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>Step {step} of 3 — {stepLabels[step - 1]}</div>

        {/* Progress pills */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 20 }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: n <= step ? '#10b981' : '#f3f4f6',
                color: n <= step ? '#fff' : '#9ca3af',
                fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{n}</div>
              {n < 3 && <div style={{ width: 20, height: 2, background: n < step ? '#10b981' : '#e5e7eb' }} />}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Details ── */}
        {step === 1 && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>RECIPE NAME *</div>
              <input value={title} onChange={e => { setTitle(e.target.value); setErrors({}); }}
                placeholder="e.g. Grandma's Pasta Bake"
                style={{ ...inp, width: '100%', height: 40, fontSize: 14, padding: '0 12px', borderColor: errors.title ? '#ef4444' : '#e5e7eb' }} />
              {err(errors.title)}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>DESCRIPTION</div>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="What makes this special?" rows={2} style={{
                  width: '100%', border: '1px solid #e5e7eb', borderRadius: 8,
                  padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5,
                }} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>CUISINE</div>
                <select value={cuisine} onChange={e => setCuisine(e.target.value)}
                  style={{ ...inp, width: '100%', height: 40, fontSize: 13, padding: '0 8px' }}>
                  <option value="">Select...</option>
                  {CUISINES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>COOK TIME</div>
                <input value={cookTime} onChange={e => setCookTime(e.target.value)}
                  placeholder="e.g. 30 min"
                  style={{ ...inp, width: '100%', height: 40, fontSize: 13, padding: '0 8px' }} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>DIFFICULTY</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['Easy', 'Medium', 'Hard'].map(d => (
                  <button key={d} onClick={() => setDifficulty(d)} style={{
                    flex: 1, height: 36, borderRadius: 8, border: 'none',
                    background: difficulty === d ? '#10b981' : '#f3f4f6',
                    color: difficulty === d ? '#fff' : '#6b7280',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>{d}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>SERVINGS</div>
              <input type="number" min="1" max="99" value={servings}
                onChange={e => setServings(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ ...inp, width: 70, height: 40, textAlign: 'center', padding: '0 8px' }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>DIETARY TAGS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DIETARY_TAGS.map(tag => {
                  const active = dietaryTags.includes(tag);
                  return (
                    <button key={tag} onClick={() => toggleTag(tag)} style={{
                      padding: '5px 10px', borderRadius: 20, fontSize: 11, fontWeight: active ? 600 : 400,
                      border: active ? 'none' : '1px solid #e5e7eb', cursor: 'pointer', fontFamily: 'inherit',
                      background: active ? '#10b981' : '#fff', color: active ? '#fff' : '#6b7280',
                    }}>{tag}</button>
                  );
                })}
              </div>
            </div>

            <button onClick={handleNext} style={{
              width: '100%', height: 44, borderRadius: 10, border: 'none',
              background: '#10b981', color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Next →</button>
          </>
        )}

        {/* ── STEP 2: Ingredients ── */}
        {step === 2 && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>INGREDIENTS *</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ingredients.map(ing => (
                  <div key={ing.key} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="number" min="0" step="0.25" value={ing.amount}
                      onChange={e => updateIng(ing.key, 'amount', e.target.value)}
                      style={{ ...inp, height: 34, width: 52, textAlign: 'center' }} />
                    <select value={ing.unit} onChange={e => updateIng(ing.key, 'unit', e.target.value)}
                      style={{ ...inp, height: 34, padding: '0 4px', fontSize: 11, width: 62 }}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <input value={ing.name} onChange={e => updateIng(ing.key, 'name', e.target.value)}
                      placeholder="Ingredient" style={{ ...inp, height: 34, flex: 1, minWidth: 0 }} />
                    <button onClick={() => removeIng(ing.key)} style={{
                      width: 28, height: 28, borderRadius: 6, border: 'none',
                      background: '#fef2f2', color: '#ef4444', fontSize: 16,
                      cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>×</button>
                  </div>
                ))}
              </div>
              {err(errors.ingredients)}
              <button onClick={addIng} style={{
                marginTop: 8, fontSize: 12, fontWeight: 500, color: '#10b981',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              }}>+ Add Ingredient</button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep(1)} style={{
                flex: 1, height: 44, borderRadius: 10, border: '1px solid #e5e7eb',
                background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>← Back</button>
              <button onClick={handleNext} style={{
                flex: 1, height: 44, borderRadius: 10, border: 'none',
                background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Next →</button>
            </div>
          </>
        )}

        {/* ── STEP 3: Steps & Share ── */}
        {step === 3 && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>INSTRUCTIONS *</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {steps.map((s, idx) => (
                  <div key={s.key} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', paddingTop: 8, width: 20, textAlign: 'right', flexShrink: 0 }}>{idx + 1}.</span>
                    <textarea value={s.text} onChange={e => updateStep(s.key, e.target.value)}
                      placeholder={`Step ${idx + 1}...`} rows={2} style={{
                        flex: 1, minWidth: 0, border: '1px solid #e5e7eb', borderRadius: 8,
                        padding: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none',
                        resize: 'vertical', lineHeight: 1.5, minHeight: 56, boxSizing: 'border-box',
                      }} />
                    <button onClick={() => removeStep(s.key)} style={{
                      width: 28, height: 28, borderRadius: 6, border: 'none',
                      background: '#fef2f2', color: '#ef4444', fontSize: 16,
                      cursor: 'pointer', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>×</button>
                  </div>
                ))}
              </div>
              {err(errors.steps)}
              <button onClick={addStep} style={{
                marginTop: 8, fontSize: 12, fontWeight: 500, color: '#10b981',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              }}>+ Add Step</button>
            </div>

            {/* Photo */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>PHOTO (OPTIONAL)</div>
              {photo ? (
                <div style={{ position: 'relative' }}>
                  <img src={photo} alt="Recipe" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                  <button onClick={() => setPhoto(null)} style={{
                    position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', cursor: 'pointer',
                    fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>×</button>
                </div>
              ) : (
                <>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 16px',
                    borderRadius: 10, border: '1px dashed #d1d5db', cursor: 'pointer',
                    fontSize: 13, color: '#6b7280',
                  }}>
                    📷 Add a Photo
                    <input ref={photoRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
                  </label>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Keep photo under 1MB for best performance</div>
                </>
              )}
            </div>

            {/* Visibility */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>WHO CAN SEE THIS RECIPE?</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { key: 'private', icon: '🔒', label: 'Just Me', desc: 'Only visible to you' },
                  ...(household?.household ? [{ key: 'household', icon: '🏠', label: 'My Household', desc: `Visible to ${household.household.name}` }] : []),
                  { key: 'community', icon: '🌍', label: 'Community', desc: 'Visible to everyone in My Pantry Club' },
                ].map(opt => (
                  <button key={opt.key} onClick={() => setVisibility(opt.key)} style={{
                    padding: '12px 14px', borderRadius: 12, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer',
                    border: `2px solid ${visibility === opt.key ? '#10b981' : '#e5e7eb'}`,
                    background: visibility === opt.key ? '#f0fdf4' : '#fff',
                  }}>
                    <div style={{ fontSize: 20, marginBottom: 2 }}>{opt.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Comments toggle */}
            {visibility !== 'private' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, padding: '10px 14px', background: '#f9fafb', borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Allow comments on this recipe</div>
                <button onClick={() => setAllowComments(v => !v)} style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: allowComments ? '#10b981' : '#d1d5db', position: 'relative', flexShrink: 0,
                }}>
                  <span style={{
                    position: 'absolute', top: 2, left: allowComments ? 22 : 2,
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.15s',
                  }} />
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep(2)} style={{
                flex: 1, height: 44, borderRadius: 10, border: '1px solid #e5e7eb',
                background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>← Back</button>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 1, height: 44, borderRadius: 10, border: 'none',
                background: saving ? '#d1d5db' : '#10b981', color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
              }}>💾 {saving ? 'Saving...' : 'Save Recipe'}</button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes crsSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
}
