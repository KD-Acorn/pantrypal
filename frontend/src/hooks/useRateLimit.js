import { useState, useCallback } from 'react';

const LIMITS = {
  recipe_generate: 5,
  scan_camera: 10,
  scan_receipt: 5,
  scan_barcode: 10,
  substitution_suggest: 10,
};

const LABELS = {
  recipe_generate: 'Recipe Generation',
  scan_camera: 'Camera Scans',
  scan_receipt: 'Receipt Scans',
  scan_barcode: 'Barcode Scans',
  substitution_suggest: 'Substitution Suggestions',
};

function todayKey() {
  return `pantrypal_usage_${new Date().toISOString().slice(0, 10)}`;
}

function loadToday() {
  try { return JSON.parse(localStorage.getItem(todayKey())) || {}; }
  catch { return {}; }
}

function saveToday(data) {
  localStorage.setItem(todayKey(), JSON.stringify(data));
}

export { LIMITS, LABELS };

export default function useRateLimit() {
  const [usage, setUsage] = useState(loadToday);

  const canUse = useCallback((feature) => {
    const limit = LIMITS[feature];
    if (!limit) return true;
    const current = loadToday();
    return (current[feature] || 0) < limit;
  }, []);

  const increment = useCallback((feature) => {
    const current = loadToday();
    current[feature] = (current[feature] || 0) + 1;
    saveToday(current);
    setUsage({ ...current });
  }, []);

  const getUsage = useCallback((feature) => {
    const limit = LIMITS[feature] || Infinity;
    const used = loadToday()[feature] || 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
  }, []);

  const getRemainingAll = useCallback(() => {
    const current = loadToday();
    return Object.entries(LIMITS).map(([feature, limit]) => ({
      feature,
      label: LABELS[feature] || feature,
      used: current[feature] || 0,
      limit,
      remaining: Math.max(0, limit - (current[feature] || 0)),
    }));
  }, []);

  const resetAll = useCallback(() => {
    saveToday({});
    setUsage({});
  }, []);

  return { usage, canUse, increment, getUsage, getRemainingAll, resetAll };
}
