'use client';
import { useEffect, useState } from 'react';
import { savePushSubscription } from '@/app/actions/data';
import { toast } from '@/lib/ui';

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlB64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Botón "Activar notificaciones": registra el SW, pide permiso y suscribe el dispositivo.
// Se oculta si el navegador no soporta push o si no están las claves VAPID.
export default function PushButton() {
  const [state, setState] = useState('idle'); // idle | unsupported | off | on | denied | working

  useEffect(() => {
    const ok = VAPID && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!ok) { setState('unsupported'); return; }
    navigator.serviceWorker.register('/sw.js').then(async () => {
      const r = await navigator.serviceWorker.ready;
      const sub = await r.pushManager.getSubscription();
      setState(sub ? 'on' : (Notification.permission === 'denied' ? 'denied' : 'off'));
    }).catch(() => setState('unsupported'));
  }, []);

  async function activar() {
    setState('working');
    try {
      await navigator.serviceWorker.register('/sw.js').catch(() => {});
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        toast({ title: 'No se activaron', sub: 'Hay que permitir notificaciones', type: 'yellow', icon: 'fa-bell-slash' });
        return;
      }
      const r = await navigator.serviceWorker.ready; // espera a que el SW esté ACTIVO (si no, subscribe falla)
      let sub = await r.pushManager.getSubscription();
      if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID) });
      const res = await savePushSubscription(sub.toJSON());
      if (res?.error) { setState('off'); toast({ title: res.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
      setState('on');
      toast({ title: 'Notificaciones activadas', sub: 'Te vamos a avisar de lo importante', icon: 'fa-bell', type: 'green' });
    } catch (e) {
      console.error('[push] no se pudo activar:', e); // el detalle real queda en consola
      setState('off');
      toast({ title: 'No se pudo activar', sub: String(e?.message || e).slice(0, 100), type: 'yellow', icon: 'fa-triangle-exclamation' });
    }
  }

  if (state === 'idle' || state === 'unsupported') return null;
  if (state === 'on') return <span className="badge badge-green"><i className="fa-solid fa-bell"></i> Notificaciones activadas</span>;
  if (state === 'denied') return <span className="text-xs muted"><i className="fa-solid fa-bell-slash"></i> Notificaciones bloqueadas — activalas en los ajustes del navegador</span>;
  return (
    <button className="btn btn-ghost btn-sm" disabled={state === 'working'} onClick={activar}>
      <i className="fa-solid fa-bell"></i> {state === 'working' ? 'Activando…' : 'Activar notificaciones'}
    </button>
  );
}
