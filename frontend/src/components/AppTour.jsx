import { useState, useEffect } from 'react';

const TOUR_STEPS = [
  { tab: 'scan', title: 'Scan Your Kitchen', body: 'Point your camera at your fridge, pantry, or groceries — AI identifies every ingredient instantly.' },
  { tab: 'scan', title: 'Three Ways to Scan', body: 'Use food photos, receipt scanning, or barcode scanning to add items. Switch between modes with the tabs at the top.' },
  { tab: 'scan', title: 'Type It In', body: 'No camera? No problem. Use Type / Paste mode to add ingredients manually, separated by commas.' },
  { tab: 'pantry', title: 'Your Smart Pantry', body: 'Everything you\'ve scanned or added appears here. Track quantities, units, and expiry dates for each item.' },
  { tab: 'pantry', title: 'Expiry Tracking', body: 'Set "best by" dates on items. Expiring items surface at the top so nothing goes to waste.' },
  { tab: 'recipes', title: 'Saved Recipes', body: 'Recipes you bookmark from Discover land here. Filter by cuisine, difficulty, or cook time.' },
  { tab: 'recipes', title: 'Cook History', body: 'After cooking, tap "Made It" to log what you made. Track your substitutions and cooking history over time.' },
  { tab: 'recipes', title: 'Share to Community', body: 'Love a recipe? Share it with the community so others can discover it too.' },
  { tab: 'grocery', title: 'Grocery List', body: 'Your shopping list — add items manually or sync missing ingredients from your saved recipes.' },
  { tab: 'grocery', title: 'Smart Checkout', body: 'Check items off as you shop. Then tap "Add checked to Pantry" to move purchased items straight into your pantry.' },
  { tab: 'mealplan', title: 'Meal Planning', body: 'Plan your week by dragging saved recipes into meal slots. See what you need to buy at a glance.' },
  { tab: 'discover', title: 'AI Recipe Discovery', body: 'Tap "Find Recipes" to get personalized suggestions based on what\'s actually in your pantry.' },
  { tab: 'discover', title: 'Dietary Filters', body: 'Your dietary restrictions from setup are applied automatically. Add quick filters for cuisine, time, or difficulty.' },
  { tab: 'discover', title: 'Community Recipes', body: 'Switch to the Community tab to browse recipes shared by other users. Save your favorites.' },
  { tab: 'discover', title: 'Shuffle & Learn', body: 'Hit Shuffle to cycle through cuisines. The app learns your preferences and suggests more of what you like.' },
  { tab: 'pantry', title: 'You\'re Ready!', body: 'That\'s the tour! Start by scanning your fridge or adding a few ingredients to your pantry. Happy cooking!' },
];

export default function AppTour({ show, onComplete, onSwitchTab }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!show) return;
    const s = TOUR_STEPS[step];
    if (s?.tab) onSwitchTab(s.tab);
  }, [step, show]);

  if (!show) return null;

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 250 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: '#fff', borderRadius: '20px 20px 0 0',
        padding: '24px 20px env(safe-area-inset-bottom, 20px)',
        maxWidth: 480, margin: '0 auto',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>
            {step + 1} of {TOUR_STEPS.length}
          </span>
          <div style={{ display: 'flex', gap: 3 }}>
            {TOUR_STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 16 : 6, height: 6, borderRadius: 3,
                background: i <= step ? '#10b981' : '#e5e7eb',
                transition: 'all 0.2s',
              }} />
            ))}
          </div>
        </div>

        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{current.title}</h3>
        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>{current.body}</p>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={onComplete} style={{
            background: 'none', border: 'none', color: '#9ca3af', fontSize: 14,
            cursor: 'pointer', fontFamily: 'inherit', padding: '10px 0',
          }}>Skip Tour</button>

          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} style={{
                height: 40, padding: '0 18px', borderRadius: 10, border: '1px solid #e5e7eb',
                background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Back</button>
            )}
            <button onClick={() => isLast ? onComplete() : setStep(s => s + 1)} style={{
              height: 40, padding: '0 22px', borderRadius: 10, border: 'none',
              background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>{isLast ? 'Done!' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
