'use client';
import { useEffect, useRef } from 'react';

// Ejecuta fn al montar y cada `ms`, pero PAUSA mientras la pestaña está oculta
// (document.hidden) y refresca al volver a foco. Reduce queries innecesarias.
export function usePoll(fn, ms = 5000) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    saved.current();
    const tick = () => { if (!document.hidden) saved.current(); };
    const id = setInterval(tick, ms);
    const onVisible = () => { if (!document.hidden) saved.current(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [ms]);
}
