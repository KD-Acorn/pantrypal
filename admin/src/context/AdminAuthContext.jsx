import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { auth } from '../firebase';

const ADMIN_UID = import.meta.env.VITE_ADMIN_UID;

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsub;
  }, []);

  const isAdmin = !!currentUser && !!ADMIN_UID && currentUser.uid === ADMIN_UID;

  function signOut() {
    return fbSignOut(auth);
  }

  return (
    <AdminAuthContext.Provider value={{ currentUser, isAdmin, loading, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
