'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import Loading from '@/components/Loading';
import { tierFor, toast, ping } from '@/lib/ui';
import { usePoll, keep } from '@/lib/usePoll';
import { useRef } from 'react';
import { getMe, getMyJobs } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';

export default function MecanicoDashboard() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loaded, setLoaded] = useState(false); // primer fetch completado (evita parpadeo del empty state)
  const [dismissed, setDismissed] = useState([]); // banners de llegada cerrados con la X

  const arrivalsRef = useRef(null); // avisar UNA vez (sonido) cuando el repartidor llega al taller
  const load = async () => {
    try {
      const [m, js] = await Promise.all([getMe(), getMyJobs()]);
      setMe((p) => keep(p, m || null)); setJobs((p) => keep(p, js || [])); setLoaded(true);
      const items = (js || []).flatMap((jb) => jb.items || []);
      const ahora = new Set(items.filter((i) => i.arrivedDrop).map((i) => i.id));
      if (arrivalsRef.current) {
        for (const i of items) {
          if (ahora.has(i.id) && !arrivalsRef.current.has(i.id)) {
            ping(3); // sonido insistente + vibración: el repartidor está esperando (el aviso visual es el banner persistente de abajo)
          }
        }
      }
      arrivalsRef.current = ahora;
    } catch {}
  };
  usePoll(load, 4000);

  // vuelta desde Mercado Pago (?pago=ok | pend). Avisamos y limpiamos la URL.
  useEffect(() => {
    const pago = new URLSearchParams(window.location.search).get('pago');
    if (!pago) return;
    if (pago === 'ok') { ping(); toast({ title: '¡Pago confirmado!', sub: 'El trabajo quedó pago — coordinamos el envío', icon: 'fa-circle-check', type: 'green', duration: 9000 }); }
    else if (pago === 'pend') toast({ title: 'Pago en proceso', sub: 'Estamos esperando que Mercado Pago lo acredite. Apenas se confirme, el pedido avanza solo.', icon: 'fa-clock', type: 'yellow', duration: 11000 });
    router.replace('/mecanico');
  }, []); // eslint-disable-line

  const activos = jobs.filter((jb) => ['DRAFT', 'OPEN', 'CLOSED'].includes(jb.status));
  const enEntrega = jobs.filter((jb) => jb.status === 'PAID'); // pagado, en tránsito
  const entregados = jobs.filter((jb) => jb.status === 'DONE'); // todos los ítems entregados
  const cancelados = jobs.filter((jb) => jb.status === 'CANCELLED');
  const JOB_BADGE = { DRAFT: ['badge-yellow', 'fa-pen', 'En armado'], OPEN: ['badge-purple', 'fa-tower-broadcast', 'Cotizando'], CLOSED: ['badge-yellow', 'fa-clock', 'Pendiente de pago'], PAID: ['badge-green', 'fa-check', 'Pagado'], DONE: ['badge-green', 'fa-box-open', 'Entregado'], CANCELLED: ['badge-red', 'fa-ban', 'Cancelado'] };
  const veh = (jb) => `${jb.brand || ''} ${jb.model || ''}`.trim() || 'Vehículo';
  const initials = (me?.name || 'TP').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  // insignia por operaciones REALES (ítems entregados), no el número del mock
  const concretados = jobs.flatMap((jb) => jb.items || []).filter((i) => i.status === 'DELIVERED').length;
  const badge = tierFor('mechanic', concretados);

  async function logout() { await logoutAction(); router.push('/login'); }

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>RepuestosAlToque</span></Link>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={logout} title="Salir"><i className="fa-solid fa-right-from-bracket"></i></button>
          <div className="avatar">{initials}</div>
        </div>
      </div>

      <div className="container">
        {/* Llegada del repartidor: banner PERSISTENTE (no se autocierra; solo con la X). Lleva al pedido para mostrar el PIN. */}
        {jobs.flatMap((jb) => jb.items || []).filter((i) => i.arrivedDrop && !dismissed.includes(i.id)).map((i) => (
          <div key={i.id} className="float-notif mb-12" style={{ borderColor: 'rgba(250,204,21,0.55)', background: 'linear-gradient(135deg,rgba(250,204,21,0.14),rgba(31,41,55,0.5))' }}>
            <i className="fa-solid fa-location-dot text-yellow"></i>
            <div className="text-sm subtle" style={{ flex: 1 }}>
              <b>¡El repartidor llegó a tu taller!</b>
              <div className="text-xs muted mt-4">Trae «{i.desc || i.catLabel}» — recibí la pieza y dale tu PIN de entrega.</div>
              <div className="mt-8"><Link className="btn btn-yellow btn-sm" href={`/mecanico/detalle?id=${i.id}`}><i className="fa-solid fa-key"></i> Ver PIN e ir al pedido</Link></div>
            </div>
            <button className="icon-btn" style={{ flexShrink: 0 }} onClick={() => setDismissed((p) => [...p, i.id])} title="Cerrar" aria-label="Cerrar"><i className="fa-solid fa-xmark"></i></button>
          </div>
        ))}

        <div className="mb-16">
          <div className="eyebrow">{me?.name || 'Taller'}</div>
          <h1 className="h-lg">Hola 👋</h1>
          <p className="text-sm muted">¿Qué repuesto necesitás hoy?</p>
        </div>

        <div className="card glow mb-16" style={{ background: 'linear-gradient(135deg,rgba(109,40,217,0.28),rgba(31,41,55,0.6))' }}>
          <div className="flex-between mb-12">
            <div className="flex-center gap-12">
              <div className="avatar" style={{ width: 46, height: 46, fontSize: 16 }}>{initials}</div>
              <div>
                <div style={{ fontWeight: 800 }}>{me?.name || 'Taller'}</div>
                <div className="mt-4"><span className={`rep-badge ${badge.cls}`}><i className={`fa-solid ${badge.icon}`}></i> {badge.label}</span></div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}><div className="text-xs muted">Puntos</div><div className="h-md text-yellow">2.540</div></div>
          </div>
          <div className="rep-stats card" style={{ background: 'var(--bg-1)', padding: 12 }}>
            <div><div className="v">{jobs.length}</div><div className="l">Trabajos</div></div>
            <div><div className="v">⭐ 4.9</div><div className="l">Calificación</div></div>
            <div><div className="v">{entregados.length}</div><div className="l">Concretados</div></div>
          </div>
        </div>

        <Link href="/mecanico/pedido" className="card glow hoverable mb-16" style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'linear-gradient(135deg,rgba(109,40,217,0.35),rgba(31,41,55,0.7))' }}>
          <div className="store-avatar" style={{ background: 'var(--yellow)', color: '#0B0B0F' }}><i className="fa-solid fa-bolt"></i></div>
          <div style={{ flex: 1 }}><div className="h-md">Solicitar Repuesto</div><div className="text-sm subtle">Recibí cotizaciones en minutos</div></div>
          <i className="fa-solid fa-arrow-right"></i>
        </Link>

        <Link href="/mecanico/cuentas" className="card hoverable mb-16" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="store-avatar"><i className="fa-solid fa-id-card-clip"></i></div>
          <div style={{ flex: 1 }}><div className="text-sm" style={{ fontWeight: 700 }}>Mis Cuentas Corrientes</div><div className="text-xs muted">Vinculá tus proveedores habituales</div></div>
          <i className="fa-solid fa-arrow-right"></i>
        </Link>

        <div className="section">
          <div className="section-title"><h2>Trabajos activos</h2></div>
          {!loaded ? (
            <Loading label="Cargando tus trabajos…" />
          ) : activos.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-clipboard-list"></i></div><div className="text-sm">Todavía no tenés trabajos</div><div className="text-xs">Tocá “Solicitar Repuesto” para crear el primero</div></div>
          ) : <div className="cards-grid">{activos.map((jb) => {
            const [cls, icon, txt] = JOB_BADGE[jb.status] || ['badge-gray', 'fa-circle', jb.status];
            return (
              <Link key={jb.id} href={`/mecanico/trabajo?id=${jb.id}`} className="card hoverable mb-12" style={{ display: 'block' }}>
                <div className="flex-between mb-8">
                  <div className="flex-center">
                    <div className="store-avatar" style={{ width: 38, height: 38 }}><i className="fa-solid fa-car"></i></div>
                    <div><div className="text-sm" style={{ fontWeight: 700 }}>{veh(jb)} · {jb.plate || jb.vin}</div><div className="text-xs muted">{jb.items.length} repuesto{jb.items.length === 1 ? '' : 's'} · #{jb.code}</div></div>
                  </div>
                  <span className={`badge ${cls}`}><i className={`fa-solid ${icon}`}></i> {txt}</span>
                </div>
                <div className="flex-between">
                  <span className="text-xs muted">{jb.items.map((i) => i.desc || i.catLabel).filter(Boolean).slice(0, 3).join(' · ')}</span>
                  <span className="text-xs text-purple" style={{ fontWeight: 700 }}>Ver →</span>
                </div>
              </Link>
            );
          })}</div>}
        </div>

        {enEntrega.length > 0 && (
          <div className="section">
            <div className="section-title"><h2>En entrega</h2></div>
            <div className="cards-grid">{enEntrega.map((jb) => (
              <Link key={jb.id} href={`/mecanico/trabajo?id=${jb.id}`} className="card hoverable mb-12" style={{ display: 'block' }}>
                <div className="flex-between mb-12"><div className="text-sm" style={{ fontWeight: 700 }}>{veh(jb)} · {jb.plate} · #{jb.code}</div><span className="badge badge-green"><i className="fa-solid fa-check"></i> Pagado</span></div>
                <div className="flex-between"><span className="text-xs muted">{jb.items.length} repuesto{jb.items.length === 1 ? '' : 's'} · seguilos desde el trabajo</span><span className="text-xs text-purple" style={{ fontWeight: 700 }}>Ver →</span></div>
              </Link>
            ))}</div>
          </div>
        )}

        {entregados.length > 0 && (
          <div className="section">
            <div className="section-title"><h2>Entregados</h2><span className="text-xs muted">{entregados.length}</span></div>
            <div className="cards-grid">{entregados.map((jb) => (
              <Link key={jb.id} href={`/mecanico/trabajo?id=${jb.id}`} className="card hoverable mb-12" style={{ display: 'block' }}>
                <div className="flex-between mb-12"><div className="text-sm" style={{ fontWeight: 700 }}>{veh(jb)} · {jb.plate} · #{jb.code}</div><span className="badge badge-green"><i className="fa-solid fa-box-open"></i> Entregado</span></div>
                <div className="flex-between"><span className="text-xs muted">{jb.items.length} repuesto{jb.items.length === 1 ? '' : 's'} · entregado</span><span className="text-xs text-purple" style={{ fontWeight: 700 }}>Ver →</span></div>
              </Link>
            ))}</div>
          </div>
        )}

        {cancelados.length > 0 && (
          <div className="section">
            <div className="section-title"><h2>Cancelados</h2><span className="text-xs muted">{cancelados.length}</span></div>
            <div className="cards-grid">{cancelados.map((jb) => (
              <Link key={jb.id} href={`/mecanico/trabajo?id=${jb.id}`} className="card hoverable mb-12" style={{ display: 'block', opacity: 0.7 }}>
                <div className="flex-between"><div className="text-sm" style={{ fontWeight: 700 }}>{veh(jb)} · {jb.plate || jb.vin} · #{jb.code}</div><span className="badge badge-red"><i className="fa-solid fa-ban"></i> Cancelado</span></div>
              </Link>
            ))}</div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
