'use client';
// Error boundary del ROOT (si falla el propio layout). Reporta a Sentry y muestra un fallback mínimo.
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, background: '#0B0B0F', color: '#fff' }}>
        <div>
          <h2 style={{ marginBottom: 8 }}>Algo salió mal</h2>
          <p style={{ opacity: 0.7, marginBottom: 16 }}>Recargá la página. Si el problema sigue, avisanos.</p>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#6D28D9', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Recargar</button>
        </div>
      </body>
    </html>
  );
}
