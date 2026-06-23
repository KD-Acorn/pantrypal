import { useState, useCallback, useRef } from 'react';

export default function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const show = useCallback((msg, type = 'info') => {
    clearTimeout(timer.current);
    setToast({ msg, type });
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  return { toast, show };
}
