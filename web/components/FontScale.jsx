'use client';
import { useEffect, useState } from 'react';

// Control de tamaño de texto (accesibilidad). Escala TODA la UI con `zoom` (incluye tamaños inline),
// guarda la preferencia y se aplica en todas las páginas (ver el script en app/layout.js).
// Es un solo botón "Aa" que abre un popover (para no agrandar el topbar en mobile).
const KEY = 'rat_ui_scale';
const MIN = 0.8, MAX = 1.6, STEP = 0.1;

export default function FontScale() {
  const [scale, setScale] = useState(1);
  const [open, setOpen] = useState(false);

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

  const sb = { width: 32, height: 32, padding: 0, fontWeight: 800, lineHeight: 1 };
  return (
    <div style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} title="Tamaño del texto" aria-label="Tamaño del texto">
        <span style={{ fontWeight: 800, fontSize: 15 }}>A</span><span style={{ fontWeight: 800, fontSize: 10 }}>a</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div className="card" style={{ position: 'absolute', right: 0, top: '115%', zIndex: 41, padding: 8, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <button className="icon-btn" style={{ ...sb, fontSize: 12 }} onClick={() => apply(scale - STEP)} disabled={scale <= MIN} aria-label="Achicar texto">A−</button>
            <button className="icon-btn" style={{ ...sb, fontSize: 13 }} onClick={() => apply(1)} aria-label="Tamaño normal" title="Volver al normal">Aa</button>
            <button className="icon-btn" style={{ ...sb, fontSize: 15 }} onClick={() => apply(scale + STEP)} disabled={scale >= MAX} aria-label="Agrandar texto">A+</button>
          </div>
        </>
      )}
    </div>
  );
}
