import { useState, useCallback, useEffect } from 'react';
import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Keys kept as "pantrypal_*" for backward compatibility
const HISTORY_KEY = 'pantrypal_cook_history';
const SUBS_KEY = 'pantrypal_substitutions';

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch { return []; }
}

export default function useCookHistory(uid) {
  const [history, setHistory] = useState(() => uid ? [] : loadJSON(HISTORY_KEY));
  const [substitutions, setSubstitutions] = useState(() => uid ? [] : loadJSON(SUBS_KEY));

  useEffect(() => {
    if (!uid) {
      setHistory(loadJSON(HISTORY_KEY));
      setSubstitutions(loadJSON(SUBS_KEY));
      return;
    }
    const unsubH = onSnapshot(collection(db, 'cook_history', uid, 'entries'), (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubS = onSnapshot(collection(db, 'substitutions', uid, 'entries'), (snap) => {
      setSubstitutions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubH(); unsubS(); };
  }, [uid]);

  const logCook = useCallback((entry) => {
    const id = Date.now().toString();
    const record = { ...entry, id, cookedAt: new Date().toISOString() };
    if (!uid) {
      setHistory(prev => {
        const next = [record, ...prev];
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    } else {
      setDoc(doc(db, 'cook_history', uid, 'entries', id), record);
    }
  }, [uid]);

  const logSubstitution = useCallback((sub) => {
    const id = Date.now().toString();
    const record = { ...sub, id, loggedAt: new Date().toISOString() };
    if (!uid) {
      setSubstitutions(prev => {
        const next = [record, ...prev];
        localStorage.setItem(SUBS_KEY, JSON.stringify(next));
        return next;
      });
    } else {
      setDoc(doc(db, 'substitutions', uid, 'entries', id), record);
    }
  }, [uid]);

  const getHistory = useCallback(() => {
    return [...history].sort((a, b) => new Date(b.cookedAt) - new Date(a.cookedAt));
  }, [history]);

  const getSubstitutions = useCallback(() => {
    return [...substitutions].sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt));
  }, [substitutions]);

  return { history, substitutions, logCook, logSubstitution, getHistory, getSubstitutions };
}
