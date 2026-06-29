import { useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';

const NAV_ITEMS = [
  { key: 'dashboard', icon: '📊', label: 'Dashboard' },
  { key: 'users', icon: '👥', label: 'Users' },
  { key: 'recipes', icon: '🍽', label: 'Recipes' },
  { key: 'catalog', icon: '📚', label: 'Catalog' },
  { key: 'bugs', icon: '🐛', label: 'Bug Reports' },
  { key: 'analytics', icon: '📈', label: 'Analytics' },
  { key: 'settings', icon: '⚙️', label: 'Settings' },
];

export default function AdminSidebar({ activePage, onNavigate }) {
  const { currentUser, signOut } = useAdminAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const email = currentUser?.email || '';
  const initial = (currentUser?.displayName || email).charAt(0).toUpperCase();

  const navContent = (
    <>
      <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <img src="/small_logo-removebg-preview.png" alt="My Pantry Club" style={{ height: 32, width: 'auto', marginBottom: 4 }} />
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Admin Panel</div>
      </div>

      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(item => {
          const active = activePage === item.key;
          return (
            <button key={item.key} onClick={() => { onNavigate(item.key); setMobileOpen(false); }} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: active ? 'rgba(34,197,94,0.15)' : 'transparent',
              color: active ? '#22c55e' : 'rgba(255,255,255,0.6)',
              fontSize: 14, fontWeight: active ? 600 : 400, width: '100%', textAlign: 'left',
              transition: 'background 0.15s, color 0.15s',
            }}>
              <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div style={{
        padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: '#22c55e',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, flexShrink: 0,
        }}>{initial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
        </div>
        <button onClick={signOut} title="Sign Out" style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
          cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1, flexShrink: 0,
        }}>↪</button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside style={{
        width: 240, background: '#1a1a2e', height: '100vh', position: 'fixed',
        top: 0, left: 0, display: 'flex', flexDirection: 'column', zIndex: 50,
      }} className="admin-sidebar-desktop">
        {navContent}
      </aside>

      {/* Mobile hamburger */}
      <button onClick={() => setMobileOpen(v => !v)} className="admin-sidebar-hamburger" style={{
        position: 'fixed', top: 12, left: 12, zIndex: 60, width: 40, height: 40,
        borderRadius: 8, background: '#1a1a2e', border: 'none', color: '#fff',
        fontSize: 20, cursor: 'pointer', display: 'none', alignItems: 'center',
        justifyContent: 'center',
      }}>☰</button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 55,
        }} className="admin-sidebar-overlay">
          <aside onClick={e => e.stopPropagation()} style={{
            width: 240, background: '#1a1a2e', height: '100vh',
            display: 'flex', flexDirection: 'column',
          }}>
            {navContent}
          </aside>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .admin-sidebar-desktop { display: none !important; }
          .admin-sidebar-hamburger { display: flex !important; }
        }
      `}</style>
    </>
  );
}
