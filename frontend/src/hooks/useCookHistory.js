import { useState, useCallback } from 'react';

const HISTORY_KEY = 'pantrypal_cook_history';
const SUBS_KEY = 'pantrypal_substitutions';

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch { return []; }
}

export default function useCookHistory() {
  const [history, setHistory] = useState(() => loadJSON(HISTORY_KEY));
  const [substitutions, setSubstitutions] = useState(() => loadJSON(SUBS_KEY));

  const logCook = useCallback((entry) => {
    const record = { ...entry, id: Date.now(), cookedAt: new Date().toISOString() };
    setHistory(prev => {
      const next = [record, ...prev];
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const logSubstitution = useCallback((sub) => {
    const record = { ...sub, id: Date.now(), loggedAt: new Date().toISOString() };
    setSubstitutions(prev => {
      const next = [record, ...prev];
      localStorage.setItem(SUBS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getHistory = useCallback(() => {
    return [...history].sort((a, b) => new Date(b.cookedAt) - new Date(a.cookedAt));
  }, [history]);

  const getSubstitutions = useCallback(() => {
    return [...substitutions].sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt));
  }, [substitutions]);

  return { history, substitutions, logCook, logSubstitution, getHistory, getSubstitutions };
}
