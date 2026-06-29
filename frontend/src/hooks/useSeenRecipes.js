import { useState, useCallback, useRef } from 'react';

export default function useSeenRecipes() {
  const [seenIds, setSeenIds] = useState(new Set());
  const [seenTitles, setSeenTitles] = useState(new Set());
  const shuffleCount = useRef(0);

  const markSeen = useCallback((recipes) => {
    setSeenIds(prev => {
      const next = new Set(prev);
      for (const r of recipes) {
        const id = r.catalogId || r.spoonacularId || r.mealDbId || r.title;
        if (id) next.add(String(id));
      }
      return next;
    });
    setSeenTitles(prev => {
      const next = new Set(prev);
      for (const r of recipes) {
        if (r.title) next.add(r.title);
      }
      return next;
    });
  }, []);

  const getSeenIds = useCallback(() => [...seenIds], [seenIds]);
  const getSeenTitles = useCallback(() => [...seenTitles], [seenTitles]);
  const getShuffleCount = useCallback(() => shuffleCount.current, []);

  const reset = useCallback(() => {
    setSeenIds(new Set());
    setSeenTitles(new Set());
    shuffleCount.current = 0;
  }, []);

  const incrementShuffle = useCallback(() => {
    shuffleCount.current += 1;
    if (shuffleCount.current >= 10) {
      reset();
      return true;
    }
    return false;
  }, [reset]);

  return { markSeen, getSeenIds, getSeenTitles, getShuffleCount, incrementShuffle, reset };
}
