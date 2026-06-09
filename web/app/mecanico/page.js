'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { tierFor } from '@/lib/ui';
import { usePoll, keep } from '@/lib/usePoll';
import { getMe, getMyRequests } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';

export default function MecanicoDashboard() {
  const router = useRouter();
  const badge = tierFor('mechanic', 127);
  const [me, setMe] = useState(null);
  const [requests, setRequests] = useState([]);

  const load = async () => {
    try {
      const [m, rs] = await Promise.all([getMe(), getMyRequests()]);
      setMe((p) => keep(p, m || null)); setRequests((p) => keep(p, rs || []));
    } catch {}
  };
  usePoll(load, 4000);

  const activos = requests.filter((r) => ['OPEN', 'QUOTED', 'CLOSED'].includes(r.status));
  const coordinar = requests.filter((r) => ['PAID', 'SHIPPED', 'DELIVERED'].includes(r.status));
  const SHIP_BADGE = { PAID: ['badge-yellow', 'fa-clock', 'Esperando flete'], SHIPPED: ['badge-yellow', 'fa-truck-fast', 'En camino'], DELIVERED: ['badge-green', 'fa-box-open', 'Entregado'] };
  const label = (r) => r.desc || r.catLabel || 'Repuesto';
  const veh = (r) => `${r.brand || ''} ${r.model || ''} ${r.year || ''}`.trim() || 'Vehículo';
  const initials = (me?.name || 'TP').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

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
            <div><div className="v">{requests.length}</div><div className="l">Pedidos</div></div>
            <div><div className="v">⭐ 4.9</div><div className="l">Calificación</div></div>
            <div><div className="v">{coordinar.length}</div><div className="l">Concretados</div></div>
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
          <div className="section-title"><h2>Pedidos activos</h2></div>
          {activos.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-clipboard-list"></i></div><div className="text-sm">Todavía no tenés pedidos</div><div className="text-xs">Tocá “Solicitar Repuesto” para crear el primero</div></div>
          ) : <div className="cards-grid">{activos.map((r) => (
            <Link key={r.id} href={`/mecanico/detalle?id=${r.id}`} className="card hoverable mb-12" style={{ display: 'block' }}>
              <div className="flex-between mb-8">
                <div className="flex-center">
                  <div className="store-avatar" style={{ width: 38, height: 38 }}><i className="fa-solid fa-box"></i></div>
                  <div><div className="text-sm" style={{ fontWeight: 700 }}>{label(r)}</div><div className="text-xs muted">{veh(r)} · {r.catLabel}</div></div>
                </div>
                <span className="badge badge-purple">#{r.code}</span>
              </div>
              <div className="flex-between">
                <span className="badge badge-green"><i className="fa-solid fa-bolt"></i> {r.urgency}</span>
                <span className="text-xs text-purple" style={{ fontWeight: 700 }}>Ver ofertas →</span>
              </div>
            </Link>
          ))}</div>}
        </div>

        {coordinar.length > 0 && (
          <div className="section">
            <div className="section-title"><h2>A coordinar</h2></div>
            <div className="cards-grid">{coordinar.map((r) => {
              const [cls, icon, txt] = SHIP_BADGE[r.status] || SHIP_BADGE.PAID;
              return (
                <Link key={r.id} href={`/mecanico/detalle?id=${r.id}`} className="card hoverable mb-12" style={{ display: 'block' }}>
                  <div className="flex-between mb-12"><div className="text-sm" style={{ fontWeight: 700 }}>{label(r)} · #{r.code}</div><span className="badge badge-green"><i className="fa-solid fa-check"></i> Pagado</span></div>
                  <div className="flex-between"><span className={`badge ${cls}`}><i className={`fa-solid ${icon}`}></i> {txt}</span><span className="text-xs text-purple" style={{ fontWeight: 700 }}>Ver detalle →</span></div>
                </Link>
              );
            })}</div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
