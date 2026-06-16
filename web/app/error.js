'use client';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Error boundary global. Caso principal: después de un deploy, una pestaña vieja pide un
// chunk de JS que ya no existe en el server (cambió el hash) -> "client-side exception".
// No es un bug: alcanza con recargar para traer el build nuevo. Lo hacemos automático
// (una sola vez, para no entrar en loop). Para errores reales, mostramos un cartel claro.
export default function Error({ error, reset }) {
  useEffect(() => {
    const msg = `${error?.name || ''} ${error?.message || ''}`;
    const staleChunk = /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported|Failed to fetch dynamically|importing a module script failed/i.test(msg);
    if (!staleChunk) { Sentry.captureException(error); return; } // error real -> a Sentry (si hay DSN)
    const KEY = 'rat_reload_at';
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > 10000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="app-shell">
      <div className="container" style={{ paddingTop: 48, textAlign: 'center' }}>
        <div className="empty-state">
          <div className="empty-icon"><i className="fa-solid fa-triangle-exclamation text-yellow"></i></div>
          <div className="h-md mb-8">Se actualizó la app</div>
          <p className="text-sm muted mb-16">Recargá para seguir. Si el problema sigue, avisanos.</p>
          <div className="flex-center gap-12" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => window.location.reload()}><i className="fa-solid fa-rotate-right"></i> Recargar</button>
            <button className="btn btn-ghost" onClick={() => reset()}>Reintentar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
