import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import SHOPPING_PARTNERS from '../config/shoppingPartners';
import CreateHouseholdSheet from '../components/CreateHouseholdSheet';
import JoinHouseholdSheet from '../components/JoinHouseholdSheet';

const DIETARY_OPTIONS = [
  { key: 'vegetarian', label: '🌱 Vegetarian' },
  { key: 'vegan', label: '🌿 Vegan' },
  { key: 'gluten-free', label: '🌾 Gluten-Free' },
  { key: 'dairy-free', label: '🥛 Dairy-Free' },
  { key: 'nut-free', label: '🥜 Nut-Free' },
  { key: 'pescatarian', label: '🐟 Pescatarian' },
];

const CUISINE_OPTIONS = ['Italian', 'Asian', 'Mexican', 'Quick & Easy', 'Mediterranean', 'Any'];

export default function SettingsPage({ onClose, settings, rateLimit, household, onReplayTour }) {
  const { currentUser, signOut } = useAuth();
  const [nameInput, setNameInput] = useState(settings.displayName || currentUser?.displayName || '');
  const [nameSaving, setNameSaving] = useState(false);
  const [partnersExpanded, setPartnersExpanded] = useState(false);
  const [showCreateHH, setShowCreateHH] = useState(false);
  const [showJoinHH, setShowJoinHH] = useState(false);
  const [hhCodeCopied, setHhCodeCopied] = useState(false);
  const [confirmDisband, setConfirmDisband] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const name = currentUser?.displayName || currentUser?.email || 'User';
  const initial = (settings.displayName || name).charAt(0).toUpperCase();

  function handleSaveName() {
    if (!nameInput.trim()) return;
    setNameSaving(true);
    settings.updateDisplayName(nameInput.trim());
    setTimeout(() => setNameSaving(false), 500);
  }

  const toggle = (active, onToggle) => (
    <button onClick={onToggle} style={{
      width: 44, height: 26, borderRadius: 13, border: 'none',
      background: active ? '#10b981' : '#e5e7eb', cursor: 'pointer',
      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3,
        left: active ? 21 : 3, transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      }} />
    </button>
  );

  const sectionTitle = (text) => (
    <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 12, marginTop: 24 }}>{text}</div>
  );

  const sectionLabel = (text) => (
    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>{text}</div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, background: '#fff',
      overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', padding: '14px 16px',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, color: '#374151', padding: '0 8px 0 0', lineHeight: 1,
          }}>←</button>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>Settings</span>
        </div>

        <div style={{ padding: '0 16px 100px' }}>
          {/* Account */}
          {sectionTitle('Account')}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: '#10b981',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 700, flexShrink: 0,
            }}>{initial}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                {settings.displayName || name}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>{currentUser?.email}</div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>
              Display Name
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={nameInput} onChange={e => setNameInput(e.target.value)}
                style={{
                  flex: 1, height: 38, border: '1px solid #e5e7eb', borderRadius: 8,
                  padding: '0 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                }} />
              <button onClick={handleSaveName} disabled={nameSaving || !nameInput.trim()} style={{
                height: 38, padding: '0 16px', borderRadius: 8, border: 'none',
                background: nameInput.trim() ? '#10b981' : '#d1d5db', color: '#fff',
                fontSize: 13, fontWeight: 600, cursor: nameInput.trim() ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}>{nameSaving ? 'Saved!' : 'Save'}</button>
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Email</label>
            <div style={{
              height: 38, border: '1px solid #f3f4f6', borderRadius: 8,
              padding: '0 12px', fontSize: 13, color: '#9ca3af', lineHeight: '38px',
              background: '#f9fafb',
            }}>{currentUser?.email}</div>
          </div>

          <button onClick={() => { onClose(); signOut(); }} style={{
            width: '100%', height: 38, borderRadius: 8, border: '1px solid #e5e7eb',
            background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit', marginTop: 12,
          }}>Sign Out</button>

          {/* Dietary Preferences */}
          {sectionTitle('Dietary Preferences')}
          {sectionLabel('These apply to all recipe suggestions by default')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DIETARY_OPTIONS.map(opt => (
              <div key={opt.key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', background: '#f9fafb', borderRadius: 10,
              }}>
                <span style={{ fontSize: 14, color: '#374151' }}>{opt.label}</span>
                {toggle(settings.dietaryPrefs.includes(opt.key), () => settings.toggleDietaryPref(opt.key))}
              </div>
            ))}
          </div>

          {/* Household */}
          {household && (() => {
            const hh = household.household;
            const myRole = hh?.members?.find(m => m.uid === currentUser?.uid)?.role;
            const isOwner = myRole === 'owner';
            const isAdmin = isOwner || myRole === 'co-admin';
            const displayName = settings.displayName || currentUser?.displayName || '';

            return (
              <>
                {sectionTitle(hh ? `🏠 ${hh.name}` : '🏠 My Household')}
                {!hh ? (
                  <>
                    {sectionLabel('Share your pantry and recipes with family or roommates')}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button onClick={() => setShowCreateHH(true)} style={{
                        width: '100%', height: 42, borderRadius: 10, border: 'none',
                        background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>Create a Household</button>
                      <button onClick={() => setShowJoinHH(true)} style={{
                        width: '100%', height: 42, borderRadius: 10, border: '1px solid #e5e7eb',
                        background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>Join a Household</button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Members */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                      {hh.members?.map(m => (
                        <div key={m.uid} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', background: '#f9fafb', borderRadius: 10,
                        }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', background: '#10b981',
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 700, flexShrink: 0,
                          }}>{(m.displayName || '?')[0].toUpperCase()}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{m.displayName || 'Member'}</div>
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                            background: m.role === 'owner' ? '#fef3c7' : m.role === 'co-admin' ? '#ede9fe' : '#f3f4f6',
                            color: m.role === 'owner' ? '#92400e' : m.role === 'co-admin' ? '#6d28d9' : '#6b7280',
                          }}>{m.role}</span>
                          {isAdmin && m.uid !== currentUser?.uid && m.role !== 'owner' && (
                            <select value="" onChange={e => {
                              const action = e.target.value;
                              if (action === 'promote') household.promoteToCoadmin(hh.id, m.uid);
                              if (action === 'demote') household.demoteToMember(hh.id, m.uid);
                              if (action === 'remove') household.removeMember(hh.id, m.uid);
                              e.target.value = '';
                            }} style={{
                              height: 28, border: '1px solid #e5e7eb', borderRadius: 6,
                              fontSize: 11, fontFamily: 'inherit', background: '#fff', color: '#6b7280',
                            }}>
                              <option value="">···</option>
                              {m.role === 'member' && <option value="promote">Promote</option>}
                              {m.role === 'co-admin' && <option value="demote">Demote</option>}
                              <option value="remove">Remove</option>
                            </select>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Sharing toggles */}
                    {isAdmin && (
                      <>
                        {sectionLabel('Shared features')}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                          {[
                            { key: 'sharesPantry', label: '🥫 Share Pantry' },
                            { key: 'sharesRecipes', label: '🍽 Share Recipes' },
                            { key: 'sharesMealPlan', label: '📅 Share Meal Plan' },
                          ].map(opt => (
                            <div key={opt.key} style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '10px 12px', background: '#f9fafb', borderRadius: 10,
                            }}>
                              <span style={{ fontSize: 14, color: '#374151' }}>{opt.label}</span>
                              {toggle(hh.settings?.[opt.key], () => {
                                household.updateSettings(hh.id, { ...hh.settings, [opt.key]: !hh.settings?.[opt.key] });
                              })}
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Code */}
                    <div style={{
                      padding: '10px 12px', background: '#f0fdf4', borderRadius: 10, marginBottom: 16,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>Household Code</div>
                        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: '#10b981', letterSpacing: '0.1em' }}>
                          {hh.code}
                        </div>
                      </div>
                      <button onClick={() => {
                        navigator.clipboard?.writeText(hh.code);
                        setHhCodeCopied(true);
                        setTimeout(() => setHhCodeCopied(false), 2000);
                      }} style={{
                        fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid #e5e7eb',
                        background: '#fff', color: '#374151', cursor: 'pointer', fontFamily: 'inherit',
                      }}>{hhCodeCopied ? '✓ Copied' : '📋 Copy'}</button>
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 16 }}>Share this code so others can join</div>

                    {/* Leave / Disband */}
                    {isOwner ? (
                      confirmDisband ? (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                          <span style={{ fontSize: 12, color: '#6b7280', lineHeight: '34px' }}>Disband household?</span>
                          <button onClick={async () => {
                            await deleteDoc(doc(db, 'households', hh.id));
                            setConfirmDisband(false);
                          }} style={{
                            fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6,
                            background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}>Yes, disband</button>
                          <button onClick={() => setConfirmDisband(false)} style={{
                            fontSize: 12, padding: '6px 14px', borderRadius: 6,
                            background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDisband(true)} style={{
                          fontSize: 12, color: '#ef4444', background: 'none', border: 'none',
                          cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                        }}>Disband Household</button>
                      )
                    ) : (
                      confirmLeave ? (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                          <span style={{ fontSize: 12, color: '#6b7280', lineHeight: '34px' }}>Leave household?</span>
                          <button onClick={async () => {
                            await household.leaveHousehold(hh.id);
                            setConfirmLeave(false);
                          }} style={{
                            fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6,
                            background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}>Yes, leave</button>
                          <button onClick={() => setConfirmLeave(false)} style={{
                            fontSize: 12, padding: '6px 14px', borderRadius: 6,
                            background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmLeave(true)} style={{
                          fontSize: 12, color: '#ef4444', background: 'none', border: 'none',
                          cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                        }}>Leave Household</button>
                      )
                    )}
                  </>
                )}

                {showCreateHH && <CreateHouseholdSheet household={household} displayName={displayName} onClose={() => setShowCreateHH(false)} toast={null} />}
                {showJoinHH && <JoinHouseholdSheet household={household} displayName={displayName} onClose={() => setShowJoinHH(false)} toast={null} />}
              </>
            );
          })()}

          {/* Shopping Partners */}
          {sectionTitle('Shopping Partners')}
          {sectionLabel('Choose where to buy missing ingredients')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SHOPPING_PARTNERS.map(partner => (
              <div key={partner.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', background: '#f9fafb', borderRadius: 10,
              }}>
                <span style={{ fontSize: 14, color: '#374151' }}>{partner.icon} {partner.name}</span>
                {toggle(settings.shoppingPartners.includes(partner.id), () => settings.toggleShoppingPartner(partner.id))}
              </div>
            ))}
          </div>
          <button onClick={() => setPartnersExpanded(v => !v)} style={{
            fontSize: 12, color: '#9ca3af', background: 'none', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit', marginTop: 8, padding: 0,
          }}>
            {partnersExpanded ? '▴' : '▾'} More partners coming soon
          </button>
          {partnersExpanded && (
            <div style={{
              marginTop: 6, padding: '10px 12px', background: '#f9fafb', borderRadius: 10,
              fontSize: 12, color: '#9ca3af',
            }}>
              We're working on adding Walmart, Target, and more. Stay tuned!
            </div>
          )}

          {/* Cuisine Preferences */}
          {sectionTitle('Cuisine Preferences')}
          {sectionLabel('Recipes you enjoy most')}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CUISINE_OPTIONS.map(c => {
              const active = settings.cuisinePrefs.includes(c);
              return (
                <button key={c} onClick={() => settings.toggleCuisinePref(c)} style={{
                  fontSize: 12, fontWeight: active ? 600 : 400, padding: '6px 14px', borderRadius: 20,
                  border: active ? 'none' : '1px solid #e5e7eb', cursor: 'pointer', fontFamily: 'inherit',
                  background: active ? '#10b981' : '#fff', color: active ? '#fff' : '#6b7280',
                }}>{c}</button>
              );
            })}
          </div>

          {/* Today's Usage */}
          {rateLimit && (() => {
            const usages = rateLimit.getRemainingAll();
            return (
              <>
                {sectionTitle("Today's Usage")}
                {sectionLabel('Resets at midnight')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {usages.map(u => (
                    <div key={u.feature} style={{
                      padding: '10px 12px', background: '#f9fafb', borderRadius: 10,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: '#374151' }}>{u.label}</span>
                        <span style={{ fontSize: 12, color: u.remaining === 0 ? '#ef4444' : '#6b7280', fontWeight: 500 }}>
                          {u.used}/{u.limit}
                        </span>
                      </div>
                      <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2 }}>
                        <div style={{
                          height: 4, borderRadius: 2, transition: 'width 0.3s',
                          width: `${Math.min(100, (u.used / u.limit) * 100)}%`,
                          background: u.used >= u.limit ? '#ef4444' : u.used >= u.limit * 0.8 ? '#f59e0b' : '#10b981',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

          {/* Notification Preferences */}
          {sectionTitle('Notification Preferences')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: 0.5 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', background: '#f9fafb', borderRadius: 10,
            }}>
              <div>
                <span style={{ fontSize: 14, color: '#374151' }}>Expiry alerts</span>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Coming soon</div>
              </div>
              <button disabled style={{
                width: 44, height: 26, borderRadius: 13, border: 'none',
                background: '#e5e7eb', cursor: 'default', position: 'relative',
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3, left: 3,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }} />
              </button>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', background: '#f9fafb', borderRadius: 10,
            }}>
              <div>
                <span style={{ fontSize: 14, color: '#374151' }}>Meal plan reminders</span>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Coming soon</div>
              </div>
              <button disabled style={{
                width: 44, height: 26, borderRadius: 13, border: 'none',
                background: '#e5e7eb', cursor: 'default', position: 'relative',
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3, left: 3,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }} />
              </button>
            </div>
          </div>
          {/* About */}
          {sectionTitle('About')}
          <div style={{ padding: '10px 12px', background: '#f9fafb', borderRadius: 10 }}>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>My Pantry Club <span style={{ color: '#9ca3af' }}>v1.0.0</span></div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>© 2026 My Pantry Club — DoneIt Technologies</div>
            <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.6, marginBottom: 12 }}>
              My Pantry Club participates in affiliate programs. We may earn a small commission when you purchase through ingredient links, at no extra cost to you.
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a href="#" style={{ fontSize: 12, color: '#10b981' }}>Privacy Policy</a>
              <a href="#" style={{ fontSize: 12, color: '#10b981' }}>Terms of Service</a>
              {onReplayTour && (
                <button onClick={() => {
                  localStorage.removeItem('pantrypal_onboarding_done');
                  onReplayTour();
                }} style={{ fontSize: 12, color: '#10b981', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                  🗺 Replay App Tour
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
