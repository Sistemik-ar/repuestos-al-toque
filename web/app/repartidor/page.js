'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/ui';
import { usePoll } from '@/lib/usePoll';
import { getMyDeliveries, markDelivered, markPickedUp } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';

const mapsUrl = (p) => (p?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.address} ${p.barrio || ''} Bariloche`)}` : null);

export default function Repartidor() {
  const router = useRouter();
  const [items, setItems] = useState([]);

  const load = async () => setItems(await getMyDeliveries());
  usePoll(load, 5000);

  const pend = items.filter((d) => d.status !== 'DELIVERED');
  const label = (r) => r.desc || r.catLabel || 'Repuesto';

  async function retirar(o) { await markPickedUp(o.orderId); toast({ title: 'Retiraste el pedido', sub: 'En camino al taller', icon: 'fa-box', type: 'green' }); load(); }
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

            <div className="card mb-12" style={{ background: 'var(--bg-1)', padding: 12 }}>
              <Punto icon="fa-store" color="#FACC15" titulo="Retiro" lugar={o.pickup?.name} dir={o.pickup?.address} barrio={o.pickup?.barrio} maps={mapsUrl(o.pickup)} />
              <div style={{ borderLeft: '2px dashed var(--border)', height: 14, marginLeft: 17 }}></div>
              <Punto icon="fa-screwdriver-wrench" color="#6D28D9" titulo="Entrega" lugar={o.dropoff?.name} dir={o.dropoff?.address} barrio={o.dropoff?.barrio} maps={mapsUrl(o.dropoff)} />
            </div>

            {o.status === 'PAID'
              ? <button className="btn btn-yellow btn-block" onClick={() => retirar(o)}><i className="fa-solid fa-box"></i> Retiré el pedido</button>
              : <button className="btn btn-success btn-block" onClick={() => entregar(o)}><i className="fa-solid fa-check"></i> Marcar entregado</button>}
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

function Punto({ icon, color, titulo, lugar, dir, barrio, maps }) {
  return (
    <div className="flex-center gap-12">
      <div className="store-avatar" style={{ width: 34, height: 34, background: 'transparent', color }}><i className={`fa-solid ${icon}`}></i></div>
      <div style={{ flex: 1 }}>
        <div className="text-xs muted">{titulo}</div>
        <div className="text-sm" style={{ fontWeight: 700 }}>{lugar || '—'}</div>
        <div className="text-xs muted">{dir ? `${dir}${barrio ? ' · ' + barrio : ''}` : 'Sin dirección cargada'}</div>
      </div>
      {maps && <a className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto' }} href={maps} target="_blank" rel="noopener"><i className="fa-solid fa-location-arrow"></i></a>}
    </div>
  );
}
