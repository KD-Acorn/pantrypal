import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
// IMPORTANT: pantry.doneitmobile.com must be added to Firebase Console
// Authentication → Settings → Authorized domains before Google sign-in works in production.
import { auth, db } from '../firebase';
import { trackEvent } from '../utils/analytics';

const AuthContext = createContext(null);

const googleProvider = new GoogleAuthProvider();

async function ensureUserDoc(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      displayName: user.displayName || '',
      email: user.email || '',
      createdAt: serverTimestamp(),
      onboardingComplete: false,
      pantryCount: 0,
      recipesCount: 0,
      cookCount: 0,
    });
  }
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function signUp(email, password, displayName) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    await ensureUserDoc({ ...cred.user, displayName });
    setCurrentUser({ ...cred.user, displayName });
    trackEvent('user_signup', { method: 'email' }, cred.user.uid);
  }

  async function signIn(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signInWithGoogle() {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureUserDoc(cred.user);
  }

  async function signOut() {
    await firebaseSignOut(auth);
  }

  const value = { currentUser, loading, signUp, signIn, signInWithGoogle, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
