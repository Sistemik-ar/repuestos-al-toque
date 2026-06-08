'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/ui';
import { getMyDeliveries, markDelivered } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';

export default function Repartidor() {
  const router = useRouter();
  const [items, setItems] = useState([]);

  const load = async () => setItems(await getMyDeliveries());
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, []);

  const pend = items.filter((d) => d.status !== 'DELIVERED');
  const label = (r) => r.desc || r.catLabel || 'Repuesto';

  async function entregar(o) { await markDelivered(o.orderId); toast({ title: 'Entregado', icon: 'fa-check', type: 'green' }); load(); }
  async function logout() { await logoutAction(); router.push('/login'); }

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Repartidor</span></Link>
        <div className="topbar-actions">
          <span className="badge badge-green"><i className="fa-solid fa-circle" style={{ fontSize: 7 }}></i> En línea</span>
          <button className="icon-btn" onClick={logout} title="Salir"><i className="fa-solid fa-right-from-bracket"></i></button>
        </div>
      </div>

      <div className="container">
        <div className="mb-16"><div className="eyebrow">Empresa de fletes</div><h1 className="h-lg">Entregas</h1><p className="text-sm muted">Retiros y entregas asignadas</p></div>

        <div className="grid-3 mb-16">
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value text-green">{pend.length}</div><div className="stat-label">Pendientes</div></div>
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value">{items.length}</div><div className="stat-label">Total</div></div>
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value text-yellow">{items.length - pend.length}</div><div className="stat-label">Entregadas</div></div>
        </div>

        <div className="section-title"><h2>Para retirar y entregar</h2></div>
        {pend.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-truck-fast"></i></div><div className="text-sm">No hay entregas pendientes</div><div className="text-xs">Aparecen cuando se concreta una venta</div></div>
        ) : <div className="cards-grid">{pend.map((o) => (
          <div className="card mb-12" key={o.orderId}>
            <div className="flex-between mb-12">
              <div className="flex-center gap-12"><div className="store-avatar" style={{ background: 'rgba(34,197,94,0.16)', color: '#4ADE80' }}><i className="fa-solid fa-box"></i></div><div><div className="text-sm" style={{ fontWeight: 700 }}>{label(o)}</div><div className="text-xs muted">Pedido #{o.code}</div></div></div>
              <span className="badge badge-yellow">{o.status === 'SHIPPED' ? 'En camino' : 'A retirar'}</span>
            </div>
            <div className="flex-between">
              <span className="text-xs muted"><i className="fa-solid fa-store"></i> Comercio → <i className="fa-solid fa-screwdriver-wrench"></i> Taller</span>
              <button className="btn btn-success btn-sm" onClick={() => entregar(o)}><i className="fa-solid fa-check"></i> Marcar entregado</button>
            </div>
          </div>
        ))}</div>}
      </div>

      <nav className="bottom-nav">
        <Link href="/repartidor" className="active"><i className="fa-solid fa-truck-fast"></i>Entregas</Link>
        <Link href="/"><i className="fa-solid fa-map"></i>Mapa</Link>
        <Link href="/"><i className="fa-solid fa-coins"></i>Ganancias</Link>
        <button onClick={logout} style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: 'var(--text-2)', fontSize: '10.5px', fontWeight: 600, cursor: 'pointer' }}><i className="fa-solid fa-right-from-bracket"></i>Salir</button>
      </nav>
    </div>
  );
}
