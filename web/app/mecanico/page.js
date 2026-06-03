'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { toast, tierFor } from '@/lib/ui';
import { useRequests, getClientId } from '@/lib/store';

export default function MecanicoDashboard() {
  const badge = tierFor('mechanic', 127);
  const requests = useRequests();
  const [myId, setMyId] = useState(null);
  useEffect(() => { setMyId(getClientId()); }, []);
  const mine = myId ? requests.filter((r) => r.clientId === myId) : [];
  const activos = mine.filter((r) => r.status === 'open' || r.status === 'closed');
  const coordinar = mine.filter((r) => r.status === 'paid');

  const label = (r) => r.desc || r.catLabel || 'Repuesto';
  const veh = (r) => `${r.brand || ''} ${r.model || ''} ${r.year || ''}`.trim() || 'Vehículo';

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/" className="brand">
          <span className="logo-mark"><i className="fa-solid fa-gear"></i></span>
          <span>RepuestosAlToque</span>
        </Link>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={() => toast({ title: 'Sin novedades', icon: 'fa-bell', type: 'purple' })}>
            <i className="fa-regular fa-bell"></i>
          </button>
          <div className="avatar">TP</div>
        </div>
      </div>

      <div className="container">
        <div className="mb-16">
          <div className="eyebrow">Taller Patagonia</div>
          <h1 className="h-lg">Buenas, Martín 👋</h1>
          <p className="text-sm muted">¿Qué repuesto necesitás hoy?</p>
        </div>

        {/* Reputación */}
        <div className="card glow mb-16" style={{ background: 'linear-gradient(135deg,rgba(109,40,217,0.28),rgba(31,41,55,0.6))' }}>
          <div className="flex-between mb-12">
            <div className="flex-center gap-12">
              <div className="avatar" style={{ width: 46, height: 46, fontSize: 16 }}>TP</div>
              <div>
                <div style={{ fontWeight: 800 }}>Taller Patagonia</div>
                <div className="mt-4"><span className={`rep-badge ${badge.cls}`}><i className={`fa-solid ${badge.icon}`}></i> {badge.label}</span></div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}><div className="text-xs muted">Puntos</div><div className="h-md text-yellow">2.540</div></div>
          </div>
          <div className="rep-stats card" style={{ background: 'var(--bg-1)', padding: 12 }}>
            <div><div className="v">127</div><div className="l">Operaciones</div></div>
            <div><div className="v">⭐ 4.9</div><div className="l">Calificación</div></div>
            <div><div className="v">96</div><div className="l">Reseñas</div></div>
          </div>
        </div>

        {/* CTA */}
        <Link href="/mecanico/pedido" className="card glow hoverable mb-16" style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'linear-gradient(135deg,rgba(109,40,217,0.35),rgba(31,41,55,0.7))' }}>
          <div className="store-avatar" style={{ background: 'var(--yellow)', color: '#0B0B0F' }}><i className="fa-solid fa-bolt"></i></div>
          <div style={{ flex: 1 }}>
            <div className="h-md">Solicitar Repuesto</div>
            <div className="text-sm subtle">Recibí cotizaciones en minutos</div>
          </div>
          <i className="fa-solid fa-arrow-right"></i>
        </Link>

        {/* Pedidos activos */}
        <div className="section">
          <div className="section-title"><h2>Pedidos activos</h2></div>
          {activos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><i className="fa-solid fa-clipboard-list"></i></div>
              <div className="text-sm">Todavía no tenés pedidos</div>
              <div className="text-xs">Tocá “Solicitar Repuesto” para crear el primero</div>
            </div>
          ) : (
            activos.map((r) => (
              <Link key={r.id} href={`/mecanico/cotizaciones?id=${r.id}`} className="card hoverable mb-12" style={{ display: 'block' }}>
                <div className="flex-between mb-8">
                  <div className="flex-center">
                    <div className="store-avatar" style={{ width: 38, height: 38 }}><i className="fa-solid fa-box"></i></div>
                    <div>
                      <div className="text-sm" style={{ fontWeight: 700 }}>{label(r)}</div>
                      <div className="text-xs muted">{veh(r)} · {r.catLabel}</div>
                    </div>
                  </div>
                  <span className="badge badge-purple">#{r.id}</span>
                </div>
                <div className="flex-between">
                  <span className="badge badge-green"><i className="fa-solid fa-bolt"></i> {r.urgency}</span>
                  <span className="text-xs text-purple" style={{ fontWeight: 700 }}>Ver ofertas →</span>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* A coordinar */}
        {coordinar.length > 0 && (
          <div className="section">
            <div className="section-title"><h2>A coordinar</h2></div>
            {coordinar.map((r) => (
              <div className="card mb-12" key={r.id}>
                <div className="flex-between mb-12">
                  <div className="text-sm" style={{ fontWeight: 700 }}>{label(r)} · #{r.id}</div>
                  <span className="badge badge-green"><i className="fa-solid fa-check"></i> Pagado</span>
                </div>
                <div className="flex-between">
                  <span className="text-xs muted">Te llega con el remito vía la empresa de envíos</span>
                  <span className="badge badge-yellow"><i className="fa-solid fa-truck-fast"></i> En camino</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
