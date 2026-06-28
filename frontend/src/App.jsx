import { useState, useEffect } from 'react';
import BottomNav from './components/BottomNav';
import Toast from './components/Toast';
import Spinner from './components/Spinner';
import MigrationBanner from './components/MigrationBanner';
import OnboardingFlow from './components/OnboardingFlow';
import AppTour from './components/AppTour';
import PendingDeletionScreen from './components/PendingDeletionScreen';
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
import ScanPage from './pages/ScanPage';
import MealPlanPage from './pages/MealPlanPage';
import SettingsPage from './pages/SettingsPage';
import PantryPage from './pages/PantryPage';
import RecipesPage from './pages/RecipesPage';
import GroceryPage from './pages/GroceryPage';
import DiscoverPage from './pages/DiscoverPage';
import AuthPage from './pages/AuthPage';
import BugReportButton from './components/BugReportButton';
import { AuthProvider, useAuth } from './context/AuthContext';
import { doc, getDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { trackEvent } from './utils/analytics';

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) sessionStorage.setItem('pantrypal_join_code', code);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(doc(db, 'pending_deletions', currentUser.uid), (snap) => {
      if (snap.exists() && snap.data().status === 'pending') {
        setScheduledFor(snap.data().scheduledFor);
        setShowPendingDeletion(true);
      } else {
        setShowPendingDeletion(false);
      }
    });
    return unsub;
  }, [currentUser]);

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

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh' }}>
      <UserHeader onOpenSettings={() => setShowSettings(true)} householdName={household.household?.name} />
      <MigrationBanner uid={uid} toast={toast} />
      {tab === 'scan' && <ScanPage pantry={pantry} toast={toast} grocery={grocery} rateLimit={rateLimit} />}
      {tab === 'pantry' && <PantryPage pantry={pantry} toast={toast} household={household} householdPantry={householdPantry} uid={uid} displayName={settings.displayName || currentUser?.displayName || ''} />}
      {tab === 'recipes' && <RecipesPage saved={saved} pantry={pantry} toast={toast} onSwitchTab={setTab} cookHistory={cookHistory} grocery={grocery} settings={settings} household={household} householdRecipes={householdRecipes} uid={uid} displayName={settings.displayName || currentUser?.displayName || ''} />}
      {tab === 'grocery' && <GroceryPage grocery={grocery} pantry={pantry} saved={saved} toast={toast} />}
      {tab === 'mealplan' && <MealPlanPage mealPlan={mealPlan} saved={saved} pantry={pantry} grocery={grocery} toast={toast} household={household} householdMealPlan={householdMealPlan} householdRecipes={householdRecipes} displayName={settings.displayName || currentUser?.displayName || ''} />}
      {tab === 'discover' && <DiscoverPage pantry={pantry} toast={toast} saved={saved} cookHistory={cookHistory} settings={settings} rateLimit={rateLimit} grocery={grocery} />}
      <BugReportButton uid={uid} currentTab={tab} toast={toast} />
      <Toast toast={toast.toast} />
      <BottomNav active={tab} onChange={(t) => { setTab(t); trackEvent('page_view', { tab: t }, uid); }} />
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
      {showPendingDeletion && (
        <PendingDeletionScreen
          scheduledFor={scheduledFor}
          currentUser={currentUser}
          onCancelled={() => {
            setShowPendingDeletion(false);
            toast.show('Account deletion cancelled. Welcome back!', 'success');
          }}
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
