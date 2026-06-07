'use client';
import Link from 'next/link';
import { useRequests } from '@/lib/store';

export default function Repartidor() {
  const requests = useRequests();
  const entregas = requests.filter((r) => r.status === 'paid');
  const label = (r) => r.desc || r.catLabel || 'Repuesto';

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Repartidor</span></Link>
        <div className="topbar-actions">
          <span className="badge badge-green"><i className="fa-solid fa-circle" style={{ fontSize: 7 }}></i> En línea</span>
          <div className="avatar" style={{ background: 'linear-gradient(135deg,#22C55E,var(--purple))' }}>DR</div>
        </div>
      </div>

      <div className="container">
        <div className="mb-16">
          <div className="eyebrow">Diego R. · empresa de fletes</div>
          <h1 className="h-lg">Entregas</h1>
          <p className="text-sm muted">Retiros y entregas asignadas</p>
        </div>

        <div className="grid-3 mb-16">
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value text-green">{entregas.length}</div><div className="stat-label">Asignadas</div></div>
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value">0</div><div className="stat-label">En camino</div></div>
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value text-yellow">0</div><div className="stat-label">Entregadas</div></div>
        </div>

        <div className="float-notif mb-16">
          <i className="fa-solid fa-circle-info text-purple"></i>
          <div className="text-sm subtle"><b>Flujo en definición.</b> Vista preliminar: cuando una venta se concreta, aparece acá para retirar y entregar. Un envío puede consolidar varios pedidos de distintos puntos.</div>
        </div>

        <div className="section-title"><h2>Para retirar</h2></div>
        {entregas.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-truck-fast"></i></div><div className="text-sm">No hay entregas asignadas</div><div className="text-xs">Aparecen cuando se concreta una venta</div></div>
        ) : (
          entregas.map((r) => (
            <div className="card mb-12" key={r.id}>
              <div className="flex-between mb-12">
                <div className="flex-center gap-12">
                  <div className="store-avatar" style={{ background: 'rgba(34,197,94,0.16)', color: '#4ADE80' }}><i className="fa-solid fa-box"></i></div>
                  <div><div className="text-sm" style={{ fontWeight: 700 }}>{label(r)}</div><div className="text-xs muted">Pedido #{r.id}</div></div>
                </div>
                <span className="badge badge-yellow">Preparando</span>
              </div>
              <div className="flex-between">
                <span className="text-xs muted"><i className="fa-solid fa-store"></i> Retiro en comercio → <i className="fa-solid fa-screwdriver-wrench"></i> Taller</span>
                <button className="btn btn-ghost btn-sm"><i className="fa-solid fa-route"></i> Ver ruta</button>
              </div>
            </div>
          ))
        )}
      </div>

      <nav className="bottom-nav">
        <Link href="/repartidor" className="active"><i className="fa-solid fa-truck-fast"></i>Entregas</Link>
        <Link href="/"><i className="fa-solid fa-map"></i>Mapa</Link>
        <Link href="/"><i className="fa-solid fa-coins"></i>Ganancias</Link>
        <Link href="/"><i className="fa-solid fa-user"></i>Perfil</Link>
      </nav>
    </div>
  );
}
