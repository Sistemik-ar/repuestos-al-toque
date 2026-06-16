import { useEffect } from 'react';

// Pone una campanita 🔔 + contador en el título de la pestaña cuando hay items que requieren
// atención (pedidos/cotizaciones/llegadas nuevas). Sirve para que el usuario lo note aunque
// esté en otra pestaña. Con count 0 deja el título normal.
export function useTitleBell(count, base = 'RepuestosAlToque') {
  useEffect(() => {
    document.title = count > 0 ? `🔔 (${count}) ${base}` : base;
    return () => { document.title = base; };
  }, [count, base]);
}
