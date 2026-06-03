'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { toast, ping, fmtTime, tierFor } from '@/lib/ui';

export default function MecanicoDashboard() {
  const [secs, setSecs] = useState(7 * 60 + 12);
  const badge = tierFor('mechanic', 127);

  useEffect(() => {
    const id = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    const t = setTimeout(() => {
      ping();
      toast({ title: 'Nueva cotización · Pedido #1042', sub: 'Distribuidor Centro · $44.900 · En stock', icon: 'fa-tag', type: 'yellow' });
    }, 4500);
    return () => { clearInterval(id); clearTimeout(t); };
  }, []);

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/" className="brand">
          <span className="logo-mark"><i className="fa-solid fa-gear"></i></span>
          <span>RepuestosAlToque</span>
        </Link>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={() => toast({ title: '2 nuevas cotizaciones', sub: 'Pedido #1042 · Pastillas de freno', icon: 'fa-tag', type: 'yellow' })}>
            <i className="fa-regular fa-bell"></i><span className="dot"></span>
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
                <div className="mt-4">
                  <span className={`rep-badge ${badge.cls}`}><i className={`fa-solid ${badge.icon}`}></i> {badge.label}</span>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="text-xs muted">Puntos</div>
              <div className="h-md text-yellow">2.540</div>
            </div>
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

        {/* Pedido activo */}
        <div className="section">
          <div className="section-title"><h2>Pedidos activos</h2><Link href="/mecanico/cotizaciones">Ver todos</Link></div>
          <Link href="/mecanico/cotizaciones" className="card hoverable mb-12" style={{ display: 'block' }}>
            <div className="flex-between mb-8">
              <div className="flex-center">
                <div className="store-avatar" style={{ width: 38, height: 38 }}><i className="fa-solid fa-record-vinyl"></i></div>
                <div>
                  <div className="text-sm" style={{ fontWeight: 700 }}>Pastillas de freno delanteras</div>
                  <div className="text-xs muted">Toyota Hilux 2019 · Frenos</div>
                </div>
              </div>
              <span className={`timer-pill ${secs <= 60 ? 'urgent' : ''}`}><i className="fa-solid fa-clock"></i> {fmtTime(secs)}</span>
            </div>
            <div className="flex-between">
              <div className="flex-center gap-8">
                <span className="badge badge-green"><i className="fa-solid fa-bolt"></i> Necesito ahora</span>
                <span className="text-xs muted">esperando ofertas</span>
              </div>
              <span className="text-xs text-purple" style={{ fontWeight: 700 }}>Ver →</span>
            </div>
          </Link>
        </div>

        {/* A coordinar */}
        <div className="section">
          <div className="section-title"><h2>A coordinar</h2></div>
          <div className="card">
            <div className="flex-between mb-12">
              <div className="text-sm" style={{ fontWeight: 700 }}>Bomba de agua · #1038</div>
              <span className="badge badge-green"><i className="fa-solid fa-check"></i> Pagado</span>
            </div>
            <div className="flex-between">
              <span className="text-xs muted">Te llega con el remito vía la empresa de envíos</span>
              <span className="badge badge-yellow"><i className="fa-solid fa-truck-fast"></i> En camino</span>
            </div>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
