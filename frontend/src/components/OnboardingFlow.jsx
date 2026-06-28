import { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { auth, db } from '../firebase';
import SHOPPING_PARTNERS from '../config/shoppingPartners';

const PAGE_LABELS = ['Welcome', 'Profile', 'Diet', 'Shopping', 'Tour'];

const DIETARY_SECTIONS = [
  {
    title: 'Religious & Cultural',
    items: [
      { key: 'no-pork', label: 'No Pork' },
      { key: 'no-beef', label: 'No Beef' },
      { key: 'no-shellfish', label: 'No Shellfish' },
      { key: 'halal', label: 'Halal' },
      { key: 'kosher', label: 'Kosher' },
      { key: 'no-alcohol', label: 'No Alcohol in Cooking' },
    ],
  },
  {
    title: 'Lifestyle',
    items: [
      { key: 'vegetarian', label: 'Vegetarian (no meat or fish)' },
      { key: 'vegan', label: 'Vegan (no animal products)' },
      { key: 'pescatarian', label: 'Pescatarian (fish ok, no other meat)' },
      { key: 'flexitarian', label: 'Flexitarian (mostly plant-based)' },
    ],
  },
  {
    title: 'Health & Allergies',
    items: [
      { key: 'gluten-free', label: 'Gluten-Free' },
      { key: 'dairy-free', label: 'Dairy-Free' },
      { key: 'nut-free', label: 'Nut-Free' },
      { key: 'egg-free', label: 'Egg-Free' },
      { key: 'soy-free', label: 'Soy-Free' },
      { key: 'low-sodium', label: 'Low Sodium' },
      { key: 'low-sugar', label: 'Low Sugar / Diabetic Friendly' },
      { key: 'keto', label: 'Keto' },
      { key: 'paleo', label: 'Paleo' },
    ],
  },
  {
    title: 'Other Preferences',
    items: [
      { key: 'no-spicy', label: 'No Spicy Food' },
      { key: 'no-raw-fish', label: 'No Raw Fish (sushi, ceviche, etc.)' },
    ],
  },
];

export default function OnboardingFlow({ onComplete, currentUser, household, settings }) {
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    displayName: currentUser?.displayName || '',
    householdCode: sessionStorage.getItem('pantrypal_join_code') || '',
    dietaryRestrictions: [],
    shoppingPartners: [],
  });
  const [hhJoinStatus, setHhJoinStatus] = useState(
    sessionStorage.getItem('pantrypal_join_code') ? 'prefilled' : null
  );

  const uid = currentUser?.uid;

  function updateField(key, value) {
    setFormData(prev => ({ ...prev, [key]: value }));
  }

  function toggleArrayItem(key, item) {
    setFormData(prev => {
      const arr = prev[key];
      const next = arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];
      return { ...prev, [key]: next };
    });
  }

  async function handleProfileContinue() {
    setSaving(true);
    try {
      if (formData.displayName.trim() && formData.displayName.trim() !== currentUser?.displayName) {
        await updateProfile(auth.currentUser, { displayName: formData.displayName.trim() });
        await setDoc(doc(db, 'users', uid), { displayName: formData.displayName.trim() }, { merge: true });
        if (settings) settings.updateDisplayName(formData.displayName.trim());
      }
      if (formData.householdCode.trim().length === 6 && household?.joinByCode) {
        try {
          await household.joinByCode(formData.householdCode.trim().toUpperCase());
          setHhJoinStatus('joined');
        } catch {
          setHhJoinStatus('error');
        }
      }
    } catch { /* ignore */ }
    setSaving(false);
    setPage(2);
  }

  async function handleDietContinue() {
    if (uid && formData.dietaryRestrictions.length > 0) {
      await setDoc(doc(db, 'users', uid), { dietaryRestrictions: formData.dietaryRestrictions }, { merge: true });
    }
    if (settings) settings.updateDietaryPrefs(formData.dietaryRestrictions);
    setPage(3);
  }

  function handleShoppingContinue() {
    localStorage.setItem('pantrypal_shopping_partners', JSON.stringify(formData.shoppingPartners));
    if (settings) settings.updateShoppingPartners(formData.shoppingPartners);
    setPage(4);
  }

  async function finishOnboarding(takeTour) {
    if (uid) {
      await setDoc(doc(db, 'users', uid), { onboardingComplete: true }, { merge: true });
    }
    localStorage.setItem('pantrypal_onboarding_done', 'true');
    onComplete(takeTour);
  }

  const progressBar = (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {PAGE_LABELS.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i <= page ? '#10b981' : '#e5e7eb',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {PAGE_LABELS.map((label, i) => (
          <span key={i} style={{
            fontSize: 10, color: i <= page ? '#10b981' : '#d1d5db',
            fontWeight: i === page ? 600 : 400,
          }}>{label}</span>
        ))}
      </div>
    </div>
  );

  const navButtons = (onSkip, onContinue, continueLabel = 'Continue →', disableContinue = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 0', gap: 12 }}>
      {onSkip ? (
        <button onClick={onSkip} style={{
          background: 'none', border: 'none', color: '#9ca3af', fontSize: 14,
          cursor: 'pointer', fontFamily: 'inherit', padding: '10px 0',
        }}>Skip</button>
      ) : <div />}
      <button onClick={onContinue} disabled={disableContinue} style={{
        height: 44, padding: '0 28px', borderRadius: 10, border: 'none',
        background: disableContinue ? '#d1d5db' : '#10b981', color: '#fff',
        fontSize: 15, fontWeight: 600, cursor: disableContinue ? 'default' : 'pointer',
        fontFamily: 'inherit',
      }}>{continueLabel}</button>
    </div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300, background: '#fff',
      overflowY: 'auto', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {progressBar}

        <div style={{ flex: 1, padding: '0 20px', display: 'flex', flexDirection: 'column' }}>

          {/* PAGE 1 — Welcome */}
          {page === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '20px 0' }}>
              <img src="/images/full_logo-removebg-preview.png" alt="My Pantry Club" style={{ height: 120, width: 'auto', marginBottom: 24 }} />
              <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Welcome to My Pantry Club</h1>
              <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.6, marginBottom: 32, maxWidth: 340 }}>
                My Pantry Club uses AI to transform your kitchen into a smart pantry.
                Scan your fridge, discover recipes you can actually make, and plan
                your meals for the week — all in one place.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 40, width: '100%', maxWidth: 300 }}>
                {[
                  { icon: '📷', text: 'Scan ingredients instantly' },
                  { icon: '🍽', text: 'Get personalized recipes' },
                  { icon: '🏠', text: 'Share with your household' },
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                    <span style={{ fontSize: 28 }}>{f.icon}</span>
                    <span style={{ fontSize: 15, color: '#374151', fontWeight: 500 }}>{f.text}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setPage(1)} style={{
                width: '100%', maxWidth: 300, height: 50, borderRadius: 12, border: 'none',
                background: '#10b981', color: '#fff', fontSize: 17, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Get Started →</button>
            </div>
          )}

          {/* PAGE 2 — Profile */}
          {page === 1 && (
            <div style={{ flex: 1, paddingTop: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Set Up Your Profile</h2>
              <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 28 }}>You can always change this later in Settings</p>

              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
                What should we call you?
              </label>
              <input
                value={formData.displayName}
                onChange={e => updateField('displayName', e.target.value)}
                placeholder="Your name"
                style={{
                  width: '100%', height: 44, border: '1px solid #e5e7eb', borderRadius: 10,
                  padding: '0 14px', fontSize: 15, fontFamily: 'inherit', outline: 'none',
                  boxSizing: 'border-box', marginBottom: 24,
                }}
              />

              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>
                Have a household code?
              </label>
              <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
                Join a family member's household (optional)
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input
                  value={formData.householdCode}
                  onChange={e => {
                    updateField('householdCode', e.target.value.toUpperCase().slice(0, 6));
                    setHhJoinStatus(null);
                  }}
                  placeholder="ABC123"
                  maxLength={6}
                  style={{
                    width: 120, height: 44, border: '1px solid #e5e7eb', borderRadius: 10,
                    padding: '0 14px', fontSize: 17, fontFamily: 'inherit', outline: 'none',
                    letterSpacing: 3, textAlign: 'center', textTransform: 'uppercase',
                  }}
                />
                {hhJoinStatus === 'prefilled' && (
                  <span style={{ fontSize: 12, color: '#10b981' }}>✓ Code found! You'll join this household after setup.</span>
                )}
                {hhJoinStatus === 'joined' && (
                  <span style={{ fontSize: 12, color: '#10b981' }}>✓ Joined!</span>
                )}
                {hhJoinStatus === 'error' && (
                  <span style={{ fontSize: 12, color: '#ef4444' }}>Invalid code</span>
                )}
              </div>

              <div style={{ marginTop: 'auto' }}>
                {navButtons(
                  () => setPage(2),
                  handleProfileContinue,
                  saving ? 'Saving...' : 'Continue →',
                  saving
                )}
              </div>
            </div>
          )}

          {/* PAGE 3 — Dietary Restrictions */}
          {page === 2 && (
            <div style={{ flex: 1, paddingTop: 24, paddingBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Any dietary restrictions?</h2>
              <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>We'll filter recipes to match. Select all that apply.</p>

              {DIETARY_SECTIONS.map(section => (
                <div key={section.title} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 6 }}>
                    {section.title}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {section.items.map(item => {
                      const active = formData.dietaryRestrictions.includes(item.key);
                      return (
                        <button key={item.key} onClick={() => toggleArrayItem('dietaryRestrictions', item.key)} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                          background: active ? '#f0fdf4' : '#f9fafb', borderRadius: 10,
                          border: active ? '1px solid #86efac' : '1px solid #f3f4f6',
                          cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left',
                        }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: 4, border: active ? 'none' : '2px solid #d1d5db',
                            background: active ? '#10b981' : '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0,
                          }}>{active ? '✓' : ''}</div>
                          <span style={{ fontSize: 14, color: active ? '#065f46' : '#374151' }}>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <button onClick={() => updateField('dietaryRestrictions', [])} style={{
                width: '100%', padding: '12px 14px', background: '#fff', borderRadius: 10,
                border: '1px solid #e5e7eb', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 14, color: '#6b7280', marginBottom: 12,
              }}>None of the above</button>

              {navButtons(() => setPage(3), handleDietContinue)}
            </div>
          )}

          {/* PAGE 4 — Shopping Partners */}
          {page === 3 && (
            <div style={{ flex: 1, paddingTop: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>How do you prefer to shop?</h2>
              <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 24 }}>We'll add quick links to buy missing ingredients</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {SHOPPING_PARTNERS.map(partner => {
                  const active = formData.shoppingPartners.includes(partner.id);
                  return (
                    <button key={partner.id} onClick={() => toggleArrayItem('shoppingPartners', partner.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '18px 16px',
                      background: active ? '#f0fdf4' : '#fff', borderRadius: 14,
                      border: active ? '2px solid #10b981' : '2px solid #e5e7eb',
                      cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left',
                      position: 'relative',
                    }}>
                      <span style={{ fontSize: 32 }}>{partner.icon}</span>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{partner.name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          {partner.id === 'amazon_fresh' ? 'Order groceries delivered from Amazon' : 'Shop from local stores via Instacart'}
                        </div>
                      </div>
                      {active && (
                        <div style={{
                          position: 'absolute', top: 10, right: 12,
                          width: 22, height: 22, borderRadius: '50%', background: '#10b981',
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700,
                        }}>✓</div>
                      )}
                    </button>
                  );
                })}

                <div style={{
                  padding: '18px 16px', borderRadius: 14, border: '2px dashed #e5e7eb',
                  opacity: 0.5, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 14, color: '#9ca3af' }}>More partners coming soon</div>
                </div>
              </div>

              <div style={{ marginTop: 'auto' }}>
                {navButtons(() => setPage(4), handleShoppingContinue)}
              </div>
            </div>
          )}

          {/* PAGE 5 — Tour Offer */}
          {page === 4 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '20px 0' }}>
              <h2 style={{ fontSize: 26, fontWeight: 700, color: '#111827', marginBottom: 8 }}>You're all set! 🎉</h2>
              <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 32 }}>Want a quick tour of the app's best features?</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 340 }}>
                <button onClick={() => finishOnboarding(true)} style={{
                  width: '100%', padding: '18px 20px', borderRadius: 14,
                  border: '2px solid #10b981', background: '#f0fdf4',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#065f46' }}>🗺 Take the Tour</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>2 minutes · See what makes My Pantry Club unique</div>
                </button>

                <button onClick={() => finishOnboarding(false)} style={{
                  width: '100%', padding: '14px 20px', borderRadius: 14,
                  border: '1px solid #e5e7eb', background: '#fff',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}>
                  <div style={{ fontSize: 14, color: '#6b7280' }}>Skip for Now</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>You can always replay the tour from Settings → About</div>
                </button>
              </div>

              <p style={{ fontSize: 11, color: '#d1d5db', marginTop: 24 }}>
                Tip: You can replay this setup anytime from ⚙️ Settings
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
