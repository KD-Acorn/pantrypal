import { useState, useMemo } from 'react';
import Spinner from '../components/Spinner';

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

// ── Recipe Picker Sheet ──────────────────────────────────────────────────────
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
        body: JSON.stringify({
          ingredients: formatted,
          cuisineHint: 'Any',
          mealTypeHint: SLOT_HINTS[targetSlot] || '',
        }),
      });
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setAiRecipes(data.recipes || []);
    } catch {
      toast.show('Failed to get suggestions', 'error');
    } finally {
      setLoading(false);
    }
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
                  background: '#fff', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6,
                  textAlign: 'left',
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
                fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginBottom: 12,
              }}>
                {loading ? <><Spinner size={16} /> Generating...</> : `Suggest ${SLOT_LABELS[targetSlot]?.slice(2) || ''} recipes`}
              </button>
              {aiRecipes.map((r, i) => (
                <button key={i} onClick={() => { onSelect(r); onClose(); }} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', border: '1px solid #f0f0f0', borderRadius: 10,
                  background: '#fff', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6,
                  textAlign: 'left',
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

// ── Main Page ────────────────────────────────────────────────────────────────
export default function MealPlanPage({ mealPlan, saved, pantry, grocery, toast }) {
  const [view, setView] = useState('list');
  const [calDay, setCalDay] = useState(0);
  const [picker, setPicker] = useState(null);

  const week = useMemo(() => mealPlan.getWeek(), [mealPlan.plan]);

  function openPicker(date, slot) {
    setPicker({ date, slot });
  }

  function handleSelect(recipe) {
    if (picker) mealPlan.assignMeal(picker.date, picker.slot, recipe);
  }

  function addMissingToGrocery() {
    const missing = mealPlan.getWeekMissing();
    if (missing.length === 0) { toast.show('No missing ingredients this week', 'info'); return; }
    const added = grocery.addItems(missing.map(name => ({ name, quantity: 1, unit: 'item', source: 'meal_plan' })));
    if (added > 0) toast.show(`${added} ingredient${added > 1 ? 's' : ''} added to grocery list`, 'success');
    else toast.show('All items already in grocery list', 'info');
  }

  const tabStyle = (active) => ({
    flex: 1, height: 36, borderRadius: 8, border: 'none',
    background: active ? '#10b981' : '#f3f4f6',
    color: active ? '#fff' : '#6b7280',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  });

  const assignedCount = week.reduce((sum, day) => sum + SLOTS.filter(s => day[s]).length, 0);

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Meal Plan</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        {assignedCount} meal{assignedCount !== 1 ? 's' : ''} planned this week
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
        <button onClick={() => setView('list')} style={tabStyle(view === 'list')}>📋 List View</button>
        <button onClick={() => setView('calendar')} style={tabStyle(view === 'calendar')}>📅 Calendar</button>
      </div>

      {/* ── List View ── */}
      {view === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {week.map((day, i) => (
            <div key={day.date} style={{
              border: '1px solid #f0f0f0', borderRadius: 12, padding: 14,
              background: '#fff',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2 }}>
                {fmtDayLabel(day.date, i)}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
                {fmtDateShort(day.date)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {SLOTS.map(slot => (
                  <div key={slot}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginBottom: 4 }}>
                      {SLOT_LABELS[slot]}
                    </div>
                    <MealSlot
                      meal={day[slot]}
                      onAdd={() => openPicker(day.date, slot)}
                      onRemove={() => mealPlan.removeMeal(day.date, slot)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Calendar View ── */}
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
                  background: sel ? '#f0fdf4' : '#fff', cursor: 'pointer',
                  fontFamily: 'inherit', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 2,
                }}>
                  <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>
                    {DAY_NAMES[d.getDay()].slice(0, 3)}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: sel ? 700 : 500, color: sel ? '#10b981' : '#374151' }}>
                    {d.getDate()}
                  </span>
                  {hasMeals && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />}
                </button>
              );
            })}
          </div>

          {week[calDay] && (
            <div style={{
              border: '1px solid #f0f0f0', borderRadius: 12, padding: 14, background: '#fff',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2 }}>
                {fmtDayLabel(week[calDay].date, calDay)}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
                {fmtDateShort(week[calDay].date)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {SLOTS.map(slot => (
                  <div key={slot}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginBottom: 4 }}>
                      {SLOT_LABELS[slot]}
                    </div>
                    <MealSlot
                      meal={week[calDay][slot]}
                      onAdd={() => openPicker(week[calDay].date, slot)}
                      onRemove={() => mealPlan.removeMeal(week[calDay].date, slot)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Grocery integration */}
      <button onClick={addMissingToGrocery} style={{
        width: '100%', height: 44, borderRadius: 10, border: '1px solid #e5e7eb',
        background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit', marginTop: 16,
      }}>🛒 Add missing ingredients to Grocery List</button>

      {/* Picker sheet */}
      {picker && (
        <RecipePicker
          targetDate={picker.date}
          targetSlot={picker.slot}
          savedRecipes={saved.items}
          pantryItems={pantry.items}
          toast={toast}
          onSelect={handleSelect}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
