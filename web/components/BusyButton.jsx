'use client';
import { useState } from 'react';

// Botón que se bloquea y muestra un spinner mientras su onClick (async) está en vuelo.
// Evita el doble-click en acciones lentas (la DB tarda) y le da feedback claro al usuario.
// onClick debe devolver una promesa (server action). disabled extra se respeta.
export default function BusyButton({ onClick, disabled, className, busyLabel = 'Procesando…', children, ...rest }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      disabled={disabled || busy}
      onClick={async () => { if (busy) return; setBusy(true); try { await onClick?.(); } finally { setBusy(false); } }}
      {...rest}
    >
      {busy ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> {busyLabel}</> : children}
    </button>
  );
}
