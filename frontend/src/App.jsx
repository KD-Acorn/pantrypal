import { useState } from 'react';
import BottomNav from './components/BottomNav';
import Toast from './components/Toast';
import Spinner from './components/Spinner';
import MigrationBanner from './components/MigrationBanner';
import usePantry from './hooks/usePantry';
import useToast from './hooks/useToast';
import useSavedRecipes from './hooks/useSavedRecipes';
import useCookHistory from './hooks/useCookHistory';
import useGroceryList from './hooks/useGroceryList';
import useSettings from './hooks/useSettings';
import ScanPage from './pages/ScanPage';
import SettingsPage from './pages/SettingsPage';
import PantryPage from './pages/PantryPage';
import RecipesPage from './pages/RecipesPage';
import GroceryPage from './pages/GroceryPage';
import DiscoverPage from './pages/DiscoverPage';
import AuthPage from './pages/AuthPage';
import { AuthProvider, useAuth } from './context/AuthContext';

function UserHeader({ onOpenSettings }) {
  const { currentUser } = useAuth();

  if (!currentUser) return null;

  const name = currentUser.displayName || currentUser.email || 'User';
  const initial = name.charAt(0).toUpperCase();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', borderBottom: '1px solid #f0f0f0',
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>PantryPal</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
  const pantry = usePantry(uid);
  const toast = useToast();
  const saved = useSavedRecipes(uid);
  const cookHistory = useCookHistory(uid);
  const grocery = useGroceryList(uid);
  const settings = useSettings(uid);

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
      <UserHeader onOpenSettings={() => setShowSettings(true)} />
      <MigrationBanner uid={uid} toast={toast} />
      {tab === 'scan' && <ScanPage pantry={pantry} toast={toast} grocery={grocery} />}
      {tab === 'pantry' && <PantryPage pantry={pantry} toast={toast} />}
      {tab === 'recipes' && <RecipesPage saved={saved} pantry={pantry} toast={toast} onSwitchTab={setTab} cookHistory={cookHistory} />}
      {tab === 'grocery' && <GroceryPage grocery={grocery} pantry={pantry} saved={saved} toast={toast} />}
      {tab === 'discover' && <DiscoverPage pantry={pantry} toast={toast} saved={saved} cookHistory={cookHistory} settings={settings} />}
      <Toast toast={toast.toast} />
      <BottomNav active={tab} onChange={setTab} />
      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} settings={settings} />}
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
