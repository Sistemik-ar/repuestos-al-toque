'use client';
import { useEffect, useState } from 'react';

// Control de tamaño de texto (accesibilidad). Escala TODA la UI con `zoom` (incluye tamaños inline),
// guarda la preferencia y se aplica en todas las páginas (ver el script en app/layout.js).
const KEY = 'rat_ui_scale';
const MIN = 0.8, MAX = 1.6, STEP = 0.1;

export default function FontScale() {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const s = parseFloat(localStorage.getItem(KEY) || '1');
    if (!isNaN(s)) setScale(s);
  }, []);

  function apply(next) {
    const v = Math.round(Math.min(MAX, Math.max(MIN, next)) * 100) / 100;
    setScale(v);
    try { localStorage.setItem(KEY, String(v)); } catch {}
    document.documentElement.style.zoom = v === 1 ? '' : String(v);
  }

  const btn = { width: 30, height: 30, padding: 0, fontWeight: 800, lineHeight: 1 };
  return (
    <div className="flex-center" style={{ gap: 3 }} title="Tamaño del texto">
      <button className="icon-btn" style={{ ...btn, fontSize: 11 }} onClick={() => apply(scale - STEP)} disabled={scale <= MIN} aria-label="Achicar texto">A−</button>
      <button className="icon-btn" style={{ ...btn, fontSize: 12 }} onClick={() => apply(1)} aria-label="Tamaño normal" title="Volver al tamaño normal">Aa</button>
      <button className="icon-btn" style={{ ...btn, fontSize: 14 }} onClick={() => apply(scale + STEP)} disabled={scale >= MAX} aria-label="Agrandar texto">A+</button>
    </div>
  );
}
