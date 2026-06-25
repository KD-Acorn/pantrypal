import { useState } from 'react';
import Spinner from '../components/Spinner';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [tab, setTab] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setConfirmPassword('');
    setError('');
  }

  function switchTab(t) {
    setTab(t);
    resetForm();
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError('Email and password are required.'); return; }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setError('');
    if (!displayName.trim()) { setError('Display name is required.'); return; }
    if (!email.trim()) { setError('Email is required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await signUp(email.trim(), password, displayName.trim());
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(friendlyError(err.code));
      }
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    width: '100%', height: 44, border: '1px solid #e5e7eb', borderRadius: 10,
    padding: '0 14px', fontSize: 14, fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box',
  };

  const primaryBtn = {
    width: '100%', height: 44, borderRadius: 10, border: 'none',
    background: busy ? '#d1d5db' : '#10b981', color: '#fff',
    fontSize: 15, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
    fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };

  const googleBtn = {
    width: '100%', height: 44, borderRadius: 10, border: '1px solid #e5e7eb',
    background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
    cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };

  const tabStyle = (active) => ({
    flex: 1, padding: '10px 0', fontSize: 14, fontWeight: active ? 600 : 400,
    color: active ? '#10b981' : '#6b7280', background: 'none', border: 'none',
    borderBottom: `2px solid ${active ? '#10b981' : 'transparent'}`,
    cursor: 'pointer', fontFamily: 'inherit',
  });

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: '#f9fafb',
    }}>
      <div style={{
        width: '100%', maxWidth: 400, background: '#fff', borderRadius: 20,
        boxShadow: '0 2px 16px rgba(0,0,0,0.06)', padding: '28px 24px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/images/full_logo-removebg-preview.png" alt="My Pantry Club" style={{ height: 80, width: 'auto', marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Your AI-powered kitchen companion</div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', marginBottom: 20 }}>
          <button onClick={() => switchTab('signin')} style={tabStyle(tab === 'signin')}>Sign In</button>
          <button onClick={() => switchTab('signup')} style={tabStyle(tab === 'signup')}>Create Account</button>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
            padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b',
          }}>{error}</div>
        )}

        {tab === 'signin' ? (
          <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="email" placeholder="Email" value={email}
              onChange={e => setEmail(e.target.value)} style={inputStyle} autoComplete="email" />
            <input type="password" placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)} style={inputStyle} autoComplete="current-password" />
            <button type="submit" disabled={busy} style={primaryBtn}>
              {busy ? <><Spinner size={18} /> Signing in...</> : 'Sign In'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
              <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>or</span>
              <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            </div>
            <button type="button" onClick={handleGoogle} disabled={busy} style={googleBtn}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#34A853" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Continue with Google
            </button>
            <div style={{ textAlign: 'center', marginTop: 4 }}>
              <button type="button" onClick={() => switchTab('signup')} style={{
                background: 'none', border: 'none', color: '#10b981', fontSize: 13,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Don't have an account? Create one</button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="text" placeholder="Display name" value={displayName}
              onChange={e => setDisplayName(e.target.value)} style={inputStyle} autoComplete="name" />
            <input type="email" placeholder="Email" value={email}
              onChange={e => setEmail(e.target.value)} style={inputStyle} autoComplete="email" />
            <input type="password" placeholder="Password (min 6 characters)" value={password}
              onChange={e => setPassword(e.target.value)} style={inputStyle} autoComplete="new-password" />
            <input type="password" placeholder="Confirm password" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} style={inputStyle} autoComplete="new-password" />
            <button type="submit" disabled={busy} style={primaryBtn}>
              {busy ? <><Spinner size={18} /> Creating account...</> : 'Create Account'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
              <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>or</span>
              <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            </div>
            <button type="button" onClick={handleGoogle} disabled={busy} style={googleBtn}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#34A853" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Continue with Google
            </button>
            <div style={{ textAlign: 'center', marginTop: 4 }}>
              <button type="button" onClick={() => switchTab('signin')} style={{
                background: 'none', border: 'none', color: '#10b981', fontSize: 13,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Already have an account? Sign in</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function friendlyError(code) {
  switch (code) {
    case 'auth/invalid-email': return 'Invalid email address.';
    case 'auth/user-disabled': return 'This account has been disabled.';
    case 'auth/user-not-found': return 'No account found with this email.';
    case 'auth/wrong-password': return 'Incorrect password.';
    case 'auth/invalid-credential': return 'Invalid email or password.';
    case 'auth/email-already-in-use': return 'An account with this email already exists.';
    case 'auth/weak-password': return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests': return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed': return 'Network error. Check your connection.';
    default: return 'Something went wrong. Please try again.';
  }
}
