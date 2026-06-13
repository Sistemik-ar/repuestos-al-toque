'use client';
import { useEffect, useRef, useState } from 'react';
import { searchAddresses } from '@/app/actions/data';

// Autocompletado de direcciones de Bariloche. El admin escribe, ve un desplegable de
// direcciones reales (Nominatim acotado a Bariloche) y ELIGE una. Al elegir, se guardan
// las coordenadas exactas (lat/lng) que después usa el cálculo de distancia.
// onChange(address, coords|null): coords = { lat, lng } solo cuando se eligió del listado.
export default function AddressAutocomplete({ value, onChange, placeholder }) {
  const [opts, setOpts] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(false); // hay una dirección elegida (con coords)
  const boxRef = useRef(null);
  const timer = useRef(null);

  // cerrar el desplegable al clickear afuera
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function handleType(text) {
    onChange(text, null); // al tipear se pierde la dirección elegida (coords)
    setPicked(false);
    clearTimeout(timer.current);
    if (text.trim().length < 3) { setOpts([]); setOpen(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await searchAddresses(text);
        setOpts(res || []); setOpen(true);
      } catch { setOpts([]); }
      setLoading(false);
    }, 350); // debounce: Nominatim pide 1 req/s
  }

  function pick(o) {
    onChange(o.label, { lat: o.lat, lng: o.lng });
    setPicked(true); setOpen(false); setOpts([]);
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        className="input"
        value={value || ''}
        onChange={(e) => handleType(e.target.value)}
        onFocus={() => opts.length && setOpen(true)}
        placeholder={placeholder || 'Empezá a escribir la dirección…'}
        autoComplete="off"
      />
      {value && (
        <div className="text-xs mt-4" style={{ color: picked ? 'var(--green)' : 'var(--text-2)' }}>
          {picked ? <><i className="fa-solid fa-circle-check"></i> Dirección validada en Bariloche</> : <><i className="fa-solid fa-circle-info"></i> Elegí una opción del listado para validar la ubicación</>}
        </div>
      )}
      {open && (
        <div className="card" style={{ position: 'absolute', zIndex: 50, left: 0, right: 0, marginTop: 4, padding: 6, maxHeight: 240, overflowY: 'auto' }}>
          {loading && <div className="text-xs muted" style={{ padding: 8 }}>Buscando…</div>}
          {!loading && opts.length === 0 && <div className="text-xs muted" style={{ padding: 8 }}>Sin resultados en Bariloche</div>}
          {opts.map((o, i) => (
            <button key={i} type="button" className="btn btn-ghost btn-sm" style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 2, whiteSpace: 'normal', height: 'auto' }} onClick={() => pick(o)}>
              <i className="fa-solid fa-location-dot text-purple"></i> {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
