import { useState } from 'react';
import BottomNav from './components/BottomNav';
import Toast from './components/Toast';
import usePantry from './hooks/usePantry';
import useToast from './hooks/useToast';
import useSavedRecipes from './hooks/useSavedRecipes';
import useCookHistory from './hooks/useCookHistory';
import ScanPage from './pages/ScanPage';
import PantryPage from './pages/PantryPage';
import RecipesPage from './pages/RecipesPage';
import DiscoverPage from './pages/DiscoverPage';

export default function App() {
  const [tab, setTab] = useState('pantry');
  const pantry = usePantry();
  const toast = useToast();
  const saved = useSavedRecipes();
  const cookHistory = useCookHistory();

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh' }}>
      {tab === 'scan' && <ScanPage pantry={pantry} toast={toast} />}
      {tab === 'pantry' && <PantryPage pantry={pantry} toast={toast} />}
      {tab === 'recipes' && <RecipesPage saved={saved} pantry={pantry} toast={toast} onSwitchTab={setTab} cookHistory={cookHistory} />}
      {tab === 'discover' && <DiscoverPage pantry={pantry} toast={toast} saved={saved} cookHistory={cookHistory} />}
      <Toast toast={toast.toast} />
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
