import { useState, useRef, useEffect } from 'react';
import BottomNav from './components/BottomNav';
import Toast from './components/Toast';
import Spinner from './components/Spinner';
import MigrationBanner from './components/MigrationBanner';
import usePantry from './hooks/usePantry';
import useToast from './hooks/useToast';
import useSavedRecipes from './hooks/useSavedRecipes';
import useCookHistory from './hooks/useCookHistory';
import useGroceryList from './hooks/useGroceryList';
import ScanPage from './pages/ScanPage';
import PantryPage from './pages/PantryPage';
import RecipesPage from './pages/RecipesPage';
import GroceryPage from './pages/GroceryPage';
import DiscoverPage from './pages/DiscoverPage';
import AuthPage from './pages/AuthPage';
import { AuthProvider, useAuth } from './context/AuthContext';

function UserHeader() {
  const { currentUser, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!currentUser) return null;

  const name = currentUser.displayName || currentUser.email || 'User';
  const initial = name.charAt(0).toUpperCase();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', borderBottom: '1px solid #f0f0f0',
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>PantryPal</div>
      <div ref={ref} style={{ position: 'relative' }}>
        <button onClick={() => setOpen(v => !v)} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit',
        }}>
          <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{name}</span>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: '#10b981',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700,
          }}>{initial}</div>
        </button>
        {open && (
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)',
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)', padding: '12px 16px',
            minWidth: 220, zIndex: 100,
          }}>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
              Signed in as {currentUser.email}
            </div>
            <button onClick={() => { setOpen(false); signOut(); }} style={{
              width: '100%', height: 36, borderRadius: 8, border: '1px solid #e5e7eb',
              background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Sign Out</button>
          </div>
        )}
      </div>
    </div>
  );
}

function AppContent() {
  const { currentUser, loading } = useAuth();
  const uid = currentUser?.uid || null;
  const [tab, setTab] = useState('pantry');
  const pantry = usePantry(uid);
  const toast = useToast();
  const saved = useSavedRecipes(uid);
  const cookHistory = useCookHistory(uid);
  const grocery = useGroceryList(uid);

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
      <UserHeader />
      <MigrationBanner uid={uid} toast={toast} />
      {tab === 'scan' && <ScanPage pantry={pantry} toast={toast} grocery={grocery} />}
      {tab === 'pantry' && <PantryPage pantry={pantry} toast={toast} />}
      {tab === 'recipes' && <RecipesPage saved={saved} pantry={pantry} toast={toast} onSwitchTab={setTab} cookHistory={cookHistory} />}
      {tab === 'grocery' && <GroceryPage grocery={grocery} pantry={pantry} saved={saved} toast={toast} />}
      {tab === 'discover' && <DiscoverPage pantry={pantry} toast={toast} saved={saved} cookHistory={cookHistory} />}
      <Toast toast={toast.toast} />
      <BottomNav active={tab} onChange={setTab} />
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
