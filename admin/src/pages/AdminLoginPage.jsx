import { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';
import { useAdminAuth } from '../context/AdminAuthContext';

const googleProvider = new GoogleAuthProvider();

export default function AdminLoginPage() {
  const { currentUser, isAdmin, signOut } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmail(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message?.includes('auth/') ? 'Invalid email or password' : err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (!err.message?.includes('popup-closed')) setError('Google sign-in failed');
    }
  }

  if (currentUser && !isAdmin) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f9fafb', fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{
          background: '#fff', borderRadius: 16, padding: 32, maxWidth: 380, width: '100%',
          boxShadow: '0 2px 16px rgba(0,0,0,0.06)', textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Access Denied</div>
          <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
            This account does not have admin privileges.
          </p>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>{currentUser.email}</div>
          <button onClick={signOut} style={{
            width: '100%', height: 42, borderRadius: 10, border: '1px solid #e5e7eb',
            background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Sign Out</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f9fafb', fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 32, maxWidth: 380, width: '100%',
        boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/full_logo-removebg-preview.png" alt="My Pantry Club" style={{ height: 80, width: 'auto', marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: '#9ca3af' }}>Admin Access</div>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', color: '#991b1b', fontSize: 13, padding: '8px 12px',
            borderRadius: 8, marginBottom: 12, border: '1px solid #fca5a5',
          }}>{error}</div>
        )}

        <form onSubmit={handleEmail}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
            style={{
              width: '100%', height: 42, border: '1px solid #e5e7eb', borderRadius: 10,
              padding: '0 14px', fontSize: 14, fontFamily: 'inherit', outline: 'none',
              marginBottom: 10, boxSizing: 'border-box',
            }} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
            style={{
              width: '100%', height: 42, border: '1px solid #e5e7eb', borderRadius: 10,
              padding: '0 14px', fontSize: 14, fontFamily: 'inherit', outline: 'none',
              marginBottom: 14, boxSizing: 'border-box',
            }} />
          <button type="submit" disabled={loading} style={{
            width: '100%', height: 44, borderRadius: 10, border: 'none',
            background: loading ? '#9ca3af' : '#22c55e', color: '#fff',
            fontSize: 15, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
            fontFamily: 'inherit', marginBottom: 10,
          }}>{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>

        <button onClick={handleGoogle} style={{
          width: '100%', height: 44, borderRadius: 10, border: '1px solid #e5e7eb',
          background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'inherit', display: 'flex',
          alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 18 }}>G</span> Sign in with Google
        </button>
      </div>
    </div>
  );
}
