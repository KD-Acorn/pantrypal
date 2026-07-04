import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import RecipeCard from '../components/RecipeCard';
import Spinner from '../components/Spinner';
import useSeenDrinks from '../hooks/useSeenDrinks';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3003';

const CATEGORIES = [
  { key: 'smoothie', label: '🥤 Smoothies' },
  { key: 'juice', label: '🍹 Juices' },
  { key: 'milkshake', label: '🍦 Milkshakes' },
  { key: 'cocktail', label: '🍸 Cocktails' },
];

const RECHECK_DAYS = 30;

// ── Age Verification ──────────────────────────────────────────────────────────
function AgeVerificationScreen({ onVerified, onMocktailMode, onBack }) {
  const [step, setStep] = useState(1);
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 80 }, (_, i) => currentYear - 21 - i);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  async function handleConfirm() {
    if (!month || !day || !year) { setError('Please fill in all fields'); return; }
    const dob = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    if (age < 21) { setError('You must be 21 or older to access this content'); return; }
    setSaving(true);
    try { await onVerified(); }
    catch { setError('Something went wrong — please try again'); setSaving(false); }
  }

  if (step === 1) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🍸</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Cocktail Recipes</div>
        <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, marginBottom: 8 }}>
          This section contains alcoholic cocktail recipes.
        </div>
        <div style={{ fontSize: 14, color: '#374151', fontWeight: 500, marginBottom: 28 }}>
          You must be 21 or older to continue.
        </div>
        <button onClick={() => setStep(2)} style={{
          width: '100%', height: 48, borderRadius: 12, border: 'none',
          background: '#10b981', color: '#fff', fontSize: 15, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12,
        }}>I'm 21 or older</button>
        <button onClick={onMocktailMode} style={{
          width: '100%', height: 44, borderRadius: 12, border: '1px solid #e5e7eb',
          background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16,
        }}>View Mocktails Instead</button>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: '#9ca3af', fontSize: 13,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>Go Back</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 16px' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Enter your date of birth</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
        We won't store your date of birth — only your verified status.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <select value={month} onChange={e => setMonth(e.target.value)} style={selStyle}>
          <option value="">Month</option>
          {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={day} onChange={e => setDay(e.target.value)} style={{ ...selStyle, flex: 0.6 }}>
          <option value="">Day</option>
          {days.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)} style={selStyle}>
          <option value="">Year</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#991b1b', marginBottom: 16 }}>
          {error}
        </div>
      )}
      <button onClick={handleConfirm} disabled={saving} style={{
        width: '100%', height: 48, borderRadius: 12, border: 'none',
        background: saving ? '#d1d5db' : '#10b981', color: '#fff', fontSize: 15, fontWeight: 700,
        cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', marginBottom: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>{saving ? <><Spinner size={18} /> Confirming...</> : 'Confirm My Age'}</button>
      <button onClick={() => { setStep(1); setError(''); }} style={{
        background: 'none', border: 'none', color: '#9ca3af', fontSize: 13,
        cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'center',
      }}>← Back</button>
    </div>
  );
}

const selStyle = {
  flex: 1, height: 44, border: '1px solid #e5e7eb', borderRadius: 10,
  padding: '0 8px', fontSize: 13, fontFamily: 'inherit', background: '#fff',
  outline: 'none', appearance: 'auto',
};

// ── Drink content for a category ──────────────────────────────────────────────
function DrinkContent({ category, pantry, toast, savedDrinks, mocktailOnly }) {
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const seenDrinks = useSeenDrinks();

  async function fetchDrinks() {
    if (pantry.items.length === 0) { toast.show('Add ingredients to your pantry first', 'info'); return; }
    setLoading(true);
    try {
      const formatted = pantry.items.map(i => typeof i === 'string' ? i : `${i.quantity} ${i.unit} ${i.name}`);
      const resp = await fetch(`${API}/api/drinks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: formatted, category, dietaryFilters: [], seenDrinkIds: seenDrinks.getSeenIds() }),
      });
      if (!resp.ok) throw new Error('Drink fetch failed');
      const data = await resp.json();
      let results = data.drinks || [];
      if (mocktailOnly) results = results.filter(d => !d.isAlcoholic);
      setDrinks(results);
      seenDrinks.markSeen(results);
      if (!results.length) toast.show('No drinks found — try adding more ingredients', 'info');
    } catch {
      toast.show('Failed to load drinks — please try again', 'error');
    } finally { setLoading(false); }
  }

  const label = category === 'cocktail'
    ? (mocktailOnly ? 'Find Mocktails' : 'Find Cocktails')
    : `Find ${CATEGORIES.find(c => c.key === category)?.label.replace(/^\S+ /, '') || 'Drinks'}`;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button onClick={fetchDrinks} disabled={loading} style={{
          flex: 1, height: 44, borderRadius: 10, border: 'none',
          background: loading ? '#d1d5db' : '#10b981', color: '#fff',
          fontSize: 15, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {loading ? <><Spinner size={18} /> Finding...</> : label}
        </button>
        {drinks.length > 0 && (
          <button onClick={() => { seenDrinks.incrementShuffle(); fetchDrinks(); }} disabled={loading} style={{
            height: 44, padding: '0 18px', borderRadius: 10, border: '1px solid #e5e7eb',
            background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
            cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>🔀 Shuffle</button>
        )}
      </div>

      {drinks.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>
            {category === 'smoothie' ? '🥤' : category === 'juice' ? '🍹' : category === 'milkshake' ? '🍦' : '🍸'}
          </div>
          <div style={{ fontSize: 14 }}>Hit "{label}" to get started</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {drinks.map((d, i) => (
          <RecipeCard
            key={i}
            recipe={d}
            pantryItems={pantry.items}
            pantry={pantry}
            ratings={{}}
            onRate={() => {}}
            isSaved={savedDrinks?.isSaved(d.title)}
            onSave={(drink) => { savedDrinks?.save(drink); toast.show('Drink saved', 'success'); }}
            onUnsave={(drink) => {
              const match = savedDrinks?.items.find(s => s.title === drink.title);
              if (match) { savedDrinks?.unsave(match.id); toast.show('Drink removed', 'info'); }
            }}
            mode="drink"
          />
        ))}
      </div>
    </>
  );
}

// ── Re-verification prompt ────────────────────────────────────────────────────
function ReVerifyBanner({ onConfirm }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
      <div style={{ fontSize: 14, color: '#92400e', fontWeight: 500, marginBottom: 10 }}>
        It's been a while — please confirm you're still 21+ to continue.
      </div>
      <button onClick={async () => { setConfirming(true); await onConfirm(); setConfirming(false); }}
        disabled={confirming} style={{
          height: 36, padding: '0 20px', borderRadius: 8, border: 'none',
          background: confirming ? '#d1d5db' : '#f59e0b', color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: confirming ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>{confirming ? 'Confirming...' : 'Confirm — I\'m still 21+'}</button>
    </div>
  );
}

// ── Main DrinkDiscoverPage ────────────────────────────────────────────────────
export default function DrinkDiscoverPage({ pantry, toast, savedDrinks }) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid || null;
  const [drinkCat, setDrinkCat] = useState('smoothie');
  const [cocktailState, setCocktailState] = useState('unknown'); // unknown|verifying|verified|mocktail-only|recheck
  const [mocktailOnly, setMocktailOnly] = useState(false);

  // Check verification status on mount or when switching to cocktail tab
  useEffect(() => {
    if (drinkCat !== 'cocktail' || !uid) return;
    if (cocktailState !== 'unknown') return;
    checkVerification();
  }, [drinkCat, uid]);

  async function checkVerification() {
    if (!uid) { setCocktailState('verifying'); return; }
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) { setCocktailState('verifying'); return; }
      const data = snap.data();
      if (!data.cocktailVerified) { setCocktailState('verifying'); return; }
      const verifiedAt = data.cocktailVerifiedAt?.toDate?.() || null;
      if (!verifiedAt) { setCocktailState('verifying'); return; }
      const daysSince = (Date.now() - verifiedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > RECHECK_DAYS) { setCocktailState('recheck'); return; }
      setCocktailState('verified');
    } catch { setCocktailState('verifying'); }
  }

  async function handleVerified() {
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid), {
      cocktailVerified: true,
      cocktailVerifiedAt: serverTimestamp(),
    });
    setCocktailState('verified');
  }

  async function handleRecheck() {
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid), { cocktailVerifiedAt: serverTimestamp() });
    setCocktailState('verified');
  }

  function handleMocktailMode() {
    setMocktailOnly(true);
    setCocktailState('verified');
  }

  function handleBack() {
    setDrinkCat('smoothie');
    setCocktailState('unknown');
  }

  const tabStyle = (active) => ({
    flex: 1, height: 36, borderRadius: 8, border: 'none', fontSize: 12, fontWeight: active ? 700 : 400,
    background: active ? '#10b981' : 'transparent', color: active ? '#fff' : '#6b7280',
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', padding: '0 4px',
    transition: 'background 0.15s',
  });

  function handleCatChange(key) {
    setDrinkCat(key);
    if (key === 'cocktail' && cocktailState === 'unknown') {
      // will trigger useEffect
    }
    if (key !== 'cocktail') {
      setMocktailOnly(false);
    }
  }

  const showCocktailGate = drinkCat === 'cocktail' && (cocktailState === 'unknown' || cocktailState === 'verifying');

  return (
    <div style={{ paddingTop: 4 }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f3f4f6', borderRadius: 12, padding: 4 }}>
        {CATEGORIES.map(c => (
          <button key={c.key} onClick={() => handleCatChange(c.key)} style={tabStyle(drinkCat === c.key)}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Mocktail mode banner */}
      {drinkCat === 'cocktail' && mocktailOnly && cocktailState === 'verified' && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#065f46', fontWeight: 500 }}>🍹 Showing non-alcoholic mocktails</span>
          <button onClick={() => { setMocktailOnly(false); setCocktailState('verifying'); }} style={{ fontSize: 12, color: '#10b981', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Switch to cocktails</button>
        </div>
      )}

      {/* Age gate */}
      {showCocktailGate && (
        <AgeVerificationScreen
          onVerified={handleVerified}
          onMocktailMode={handleMocktailMode}
          onBack={handleBack}
        />
      )}

      {/* Re-verification after 30 days */}
      {drinkCat === 'cocktail' && cocktailState === 'recheck' && (
        <>
          <ReVerifyBanner onConfirm={handleRecheck} />
          <DrinkContent category="cocktail" pantry={pantry} toast={toast} savedDrinks={savedDrinks} mocktailOnly={false} />
        </>
      )}

      {/* Verified cocktail content */}
      {drinkCat === 'cocktail' && cocktailState === 'verified' && (
        <DrinkContent category="cocktail" pantry={pantry} toast={toast} savedDrinks={savedDrinks} mocktailOnly={mocktailOnly} />
      )}

      {/* Non-cocktail categories */}
      {drinkCat !== 'cocktail' && (
        <DrinkContent category={drinkCat} pantry={pantry} toast={toast} savedDrinks={savedDrinks} mocktailOnly={false} />
      )}
    </div>
  );
}
