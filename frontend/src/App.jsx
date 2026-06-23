import { useState } from 'react';
import BottomNav from './components/BottomNav';
import Toast from './components/Toast';
import usePantry from './hooks/usePantry';
import useToast from './hooks/useToast';
import ScanPage from './pages/ScanPage';
import PantryPage from './pages/PantryPage';
import DiscoverPage from './pages/DiscoverPage';

export default function App() {
  const [tab, setTab] = useState('pantry');
  const pantry = usePantry();
  const toast = useToast();

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh' }}>
      {tab === 'scan' && <ScanPage pantry={pantry} toast={toast} />}
      {tab === 'pantry' && <PantryPage pantry={pantry} toast={toast} />}
      {tab === 'discover' && <DiscoverPage pantry={pantry} toast={toast} />}
      <Toast toast={toast.toast} />
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
