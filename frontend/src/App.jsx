import { useState, useEffect } from 'react';
import BottomNav from './components/BottomNav';
import Toast from './components/Toast';
import Spinner from './components/Spinner';
import MigrationBanner from './components/MigrationBanner';
import OnboardingFlow from './components/OnboardingFlow';
import AppTour from './components/AppTour';
import PendingDeletionScreen from './components/PendingDeletionScreen';
import WhatsNewModal, { TYPE_ICON } from './components/WhatsNewModal';
import usePantry from './hooks/usePantry';
import useToast from './hooks/useToast';
import useSavedRecipes from './hooks/useSavedRecipes';
import useCookHistory from './hooks/useCookHistory';
import useGroceryList from './hooks/useGroceryList';
import useSettings from './hooks/useSettings';
import useMealPlan from './hooks/useMealPlan';
import useRateLimit from './hooks/useRateLimit';
import useHousehold from './hooks/useHousehold';
import useHouseholdPantry from './hooks/useHouseholdPantry';
import useHouseholdRecipes from './hooks/useHouseholdRecipes';
import useHouseholdMealPlan from './hooks/useHouseholdMealPlan';
import useUserRecipes from './hooks/useUserRecipes';
import ScanPage from './pages/ScanPage';
import SettingsPage from './pages/SettingsPage';
import PantryPage from './pages/PantryPage';
import RecipesPage from './pages/RecipesPage';
import DiscoverPage from './pages/DiscoverPage';
import AuthPage from './pages/AuthPage';
import BugReportButton from './components/BugReportButton';
import SupportChatBubble from './components/SupportChatBubble';
import useSavedDrinks from './hooks/useSavedDrinks';
import { AuthProvider, useAuth } from './context/AuthContext';
import { doc, getDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { trackEvent } from './utils/analytics';

// Capture last 20 console entries for bug reports
if (!window.__mpcLogs) {
  window.__mpcLogs = [];
  const _orig = { log: console.log, warn: console.warn, error: console.error };
  ['log', 'warn', 'error'].forEach(method => {
    console[method] = (...args) => {
      window.__mpcLogs.push({
        level: method,
        message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '),
        timestamp: new Date().toISOString(),
      });
      if (window.__mpcLogs.length > 20) window.__mpcLogs.shift();
      _orig[method](...args);
    };
  });
}

function UserHeader({ onOpenSettings, householdName }) {
  const { currentUser } = useAuth();
  const [showHHPop, setShowHHPop] = useState(false);

  if (!currentUser) return null;

  const name = currentUser.displayName || currentUser.email || 'User';
  const initial = name.charAt(0).toUpperCase();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', borderBottom: '1px solid #f0f0f0',
    }}>
      <img src="/images/small_logo-removebg-preview.png" alt="My Pantry Club" style={{ height: 36, width: 'auto' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {householdName && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowHHPop(v => !v)} style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1,
            }}>🏠</button>
            {showHHPop && (
              <>
                <div onClick={() => setShowHHPop(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
                  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)', minWidth: 160,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4 }}>{householdName}</div>
                  <button onClick={() => { setShowHHPop(false); onOpenSettings(); }} style={{
                    fontSize: 12, color: '#10b981', background: 'none', border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                  }}>Open Settings</button>
                </div>
              </>
            )}
          </div>
        )}
        <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{name}</span>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: '#10b981',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700,
        }}>{initial}</div>
        <button onClick={onOpenSettings} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 20, color: '#9ca3af', padding: '0 2px', lineHeight: 1,
        }}>⚙️</button>
      </div>
    </div>
  );
}

function AppContent() {
  const { currentUser, loading } = useAuth();
  const uid = currentUser?.uid || null;
  const [tab, setTab] = useState('pantry');
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showPendingDeletion, setShowPendingDeletion] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showWhatsNewFromUpdate, setShowWhatsNewFromUpdate] = useState(false);
  const toast = useToast();
  const grocery = useGroceryList(uid);
  const pantry = usePantry(uid, {
    onDepleted: (item) => {
      grocery.addItem({ name: item.name, quantity: 1, unit: item.unit, source: 'pantry_depleted' });
      toast.show(`🛒 ${item.name} ran out — added to grocery list`, 'info');
    },
  });
  const saved = useSavedRecipes(uid);
  const cookHistory = useCookHistory(uid);
  const settings = useSettings(uid);
  const mealPlan = useMealPlan(uid);
  const rateLimit = useRateLimit();
  const household = useHousehold(uid);
  const householdPantry = useHouseholdPantry(household.household?.id, household.logActivity);
  const householdRecipes = useHouseholdRecipes(household.household?.id, household.logActivity);
  const householdMealPlan = useHouseholdMealPlan(household.household?.id, household.logActivity);
  const userRecipes = useUserRecipes(uid);
  const savedDrinks = useSavedDrinks(uid);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) sessionStorage.setItem('pantrypal_join_code', code);
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) return;
    console.log('[PendingDeletion] Setting up listener for uid:', currentUser.uid);
    const unsub = onSnapshot(
      doc(db, 'pending_deletions', currentUser.uid),
      (snap) => {
        console.log('[PendingDeletion] Snapshot received, exists:', snap.exists(), 'Data:', snap.data());
        if (snap.exists() && snap.data().status === 'pending') {
          setScheduledFor(snap.data().scheduledFor);
          setShowPendingDeletion(true);
        } else {
          setShowPendingDeletion(false);
          setScheduledFor(null);
        }
      },
      (error) => {
        console.error('[PendingDeletion] onSnapshot error:', error);
      }
    );
    return () => unsub();
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!currentUser?.uid) return;
    getDoc(doc(db, 'pending_deletions', currentUser.uid)).then(snap => {
      if (snap.exists() && snap.data().status === 'pending') {
        setScheduledFor(snap.data().scheduledFor);
        setShowPendingDeletion(true);
      }
    }).catch(() => {});
  }, [currentUser?.uid]);

  useEffect(() => {
    window.__mpcErrors = window.__mpcErrors || [];
    const prevOnerror = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      window.__mpcErrors.push({ message, source, lineno, colno, stack: error?.stack, timestamp: new Date().toISOString() });
      if (window.__mpcErrors.length > 10) window.__mpcErrors.shift();
      return prevOnerror ? prevOnerror(message, source, lineno, colno, error) : false;
    };
    return () => { window.onerror = prevOnerror; };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    if (localStorage.getItem('pantrypal_onboarding_done') === 'true') return;
    const timer = setTimeout(async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (!userDoc.exists() || userDoc.data().onboardingComplete !== true) {
          setShowOnboarding(true);
        }
      } catch { /* ignore */ }
    }, 1500);
    return () => clearTimeout(timer);
  }, [currentUser]);

  // "What's new" update banner — static versions.json only, no Firestore.
  // Never shown mid-onboarding/tour, and never shown to a first-time user
  // (reuses the same 'pantrypal_onboarding_done' flag OnboardingFlow.jsx
  // already sets, rather than a fresh Firestore read).
  useEffect(() => {
    if (!currentUser) return;
    if (showOnboarding || showTour) {
      setUpdateInfo(null);
      return;
    }
    fetch('/versions.json')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(list => {
        if (!Array.isArray(list) || list.length === 0) return;
        const latest = list[0];
        const lastSeen = localStorage.getItem('pantrypal_last_seen_version');
        const onboardingDone = localStorage.getItem('pantrypal_onboarding_done') === 'true';
        const isVersionBump = lastSeen && lastSeen !== latest.version;
        const isReturningUserNeverTracked = !lastSeen && onboardingDone;
        if (isVersionBump || isReturningUserNeverTracked) setUpdateInfo(latest);
      })
      .catch(() => {});
  }, [currentUser, showOnboarding, showTour]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Spinner size={40} />
      </div>
    );
  }

  if (!currentUser) return <AuthPage />;

  if (showPendingDeletion) {
    return (
      <PendingDeletionScreen
        scheduledFor={scheduledFor}
        currentUser={currentUser}
        onCancelled={() => {
          setShowPendingDeletion(false);
          setScheduledFor(null);
        }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh' }}>
      <UserHeader onOpenSettings={() => setShowSettings(true)} householdName={household.household?.name} />
      <MigrationBanner uid={uid} toast={toast} />
      {tab === 'scan' && <ScanPage pantry={pantry} toast={toast} grocery={grocery} rateLimit={rateLimit} />}
      {tab === 'pantry' && <PantryPage pantry={pantry} toast={toast} household={household} householdPantry={householdPantry} uid={uid} displayName={settings.displayName || currentUser?.displayName || ''} grocery={grocery} saved={saved} />}
      {tab === 'recipes' && <RecipesPage saved={saved} pantry={pantry} toast={toast} onSwitchTab={setTab} cookHistory={cookHistory} grocery={grocery} settings={settings} household={household} householdRecipes={householdRecipes} uid={uid} displayName={settings.displayName || currentUser?.displayName || ''} mealPlan={mealPlan} householdMealPlan={householdMealPlan} userRecipes={userRecipes} savedDrinks={savedDrinks} />}
      {tab === 'discover' && <DiscoverPage pantry={pantry} toast={toast} saved={saved} cookHistory={cookHistory} settings={settings} rateLimit={rateLimit} grocery={grocery} userRecipes={userRecipes} household={household} displayName={settings.displayName || currentUser?.displayName || ''} savedDrinks={savedDrinks} />}
      <SupportChatBubble uid={uid} displayName={settings.displayName || currentUser?.displayName || ''} currentTab={tab} pantryItemCount={pantry.items.length} />
      <BugReportButton uid={uid} currentTab={tab} toast={toast} pantry={pantry} saved={saved} />
      <Toast toast={toast.toast} />
      <BottomNav active={tab} onChange={(t) => { setTab(t); trackEvent('page_view', { tab: t }, uid); }} />
      {updateInfo && !showSettings && !showOnboarding && !showTour && (
        <div onClick={() => setShowWhatsNewFromUpdate(true)} style={{
          position: 'fixed', bottom: 72, left: 12, right: 12, maxWidth: 456, margin: '0 auto',
          background: '#111827', color: '#fff', borderRadius: 12, padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          zIndex: 150, cursor: 'pointer',
        }}>
          <div style={{ fontSize: 18 }}>{TYPE_ICON[updateInfo.type] || '🔧'}</div>
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
            <strong>{updateInfo.title}</strong> — See what's new
          </div>
          <button onClick={(e) => {
            e.stopPropagation();
            localStorage.setItem('pantrypal_last_seen_version', updateInfo.version);
            setUpdateInfo(null);
          }} style={{
            background: 'none', border: 'none', color: '#9ca3af', fontSize: 18,
            cursor: 'pointer', padding: 4, lineHeight: 1, fontFamily: 'inherit',
          }}>×</button>
        </div>
      )}
      {showWhatsNewFromUpdate && (
        <WhatsNewModal onClose={() => { setShowWhatsNewFromUpdate(false); setUpdateInfo(null); }} />
      )}
      {showSettings && (
        <SettingsPage
          onClose={() => setShowSettings(false)}
          settings={settings}
          rateLimit={rateLimit}
          household={household}
          onReplayTour={() => { setShowSettings(false); setShowTour(true); }}
          onRedoSetup={() => { setShowSettings(false); setShowOnboarding(true); }}
        />
      )}
      {showOnboarding && (
        <OnboardingFlow
          onComplete={(takeTour) => {
            setShowOnboarding(false);
            if (takeTour) setShowTour(true);
          }}
          currentUser={currentUser}
          household={household}
          settings={settings}
        />
      )}
      {showTour && (
        <AppTour
          show={showTour}
          onComplete={() => setShowTour(false)}
          onSwitchTab={setTab}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
