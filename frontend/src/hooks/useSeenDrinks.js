import { useState, useCallback, useRef } from 'react';

export default function useSeenDrinks() {
  const [seenIds, setSeenIds] = useState(new Set());
  const [seenTitles, setSeenTitles] = useState(new Set());
  const shuffleCount = useRef(0);

  const markSeen = useCallback((drinks) => {
    setSeenIds(prev => {
      const next = new Set(prev);
      for (const d of drinks) {
        const id = d.catalogId || d.cocktailDbId || d.title;
        if (id) next.add(String(id));
      }
      return next;
    });
    setSeenTitles(prev => {
      const next = new Set(prev);
      for (const d of drinks) {
        if (d.title) next.add(d.title);
      }
      return next;
    });
  }, []);

  const getSeenIds = useCallback(() => [...seenIds], [seenIds]);
  const getSeenTitles = useCallback(() => [...seenTitles], [seenTitles]);

  const reset = useCallback(() => {
    setSeenIds(new Set());
    setSeenTitles(new Set());
    shuffleCount.current = 0;
  }, []);

  const incrementShuffle = useCallback(() => {
    shuffleCount.current += 1;
    if (shuffleCount.current >= 8) { reset(); return true; }
    return false;
  }, [reset]);

  return { markSeen, getSeenIds, getSeenTitles, incrementShuffle, reset };
}
