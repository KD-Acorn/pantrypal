import { useState } from 'react';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import AdminSidebar from './components/AdminSidebar';
import AdminLoginPage from './pages/AdminLoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import BugReportsPage from './pages/BugReportsPage';
import RecipesPage from './pages/RecipesPage';
import CatalogPage from './pages/CatalogPage';
import AnalyticsPage from './pages/AnalyticsPage';
import PlaceholderPage from './pages/PlaceholderPage';

function Spinner() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#22c55e',
        borderRadius: '50%', animation: 'spin 0.6s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function AdminPanel() {
  const [page, setPage] = useState('dashboard');

  const content = (() => {
    switch (page) {
      case 'dashboard': return <DashboardPage />;
      case 'users': return <UsersPage />;
      case 'recipes': return <RecipesPage />;
      case 'catalog': return <CatalogPage />;
      case 'bugs': return <BugReportsPage />;
      case 'analytics': return <AnalyticsPage />;
      case 'settings': return <PlaceholderPage title="Settings" icon="⚙️" description="Admin panel configuration" />;
      default: return <DashboardPage />;
    }
  })();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <AdminSidebar activePage={page} onNavigate={setPage} />
      <main style={{ flex: 1, marginLeft: 240, padding: '24px 32px', background: '#f9fafb', minHeight: '100vh' }}
        className="admin-main-content">
        {content}
      </main>
      <style>{`
        @media (max-width: 768px) {
          .admin-main-content { margin-left: 0 !important; padding: 60px 16px 24px !important; }
        }
      `}</style>
    </div>
  );
}

function AppGate() {
  const { currentUser, isAdmin, loading } = useAdminAuth();

  if (loading) return <Spinner />;
  if (!currentUser) return <AdminLoginPage />;
  if (!isAdmin) return <AdminLoginPage />;
  return <AdminPanel />;
}

export default function App() {
  return (
    <AdminAuthProvider>
      <AppGate />
    </AdminAuthProvider>
  );
}
