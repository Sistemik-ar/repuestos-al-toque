'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/ui';
import { usePoll, keep } from '@/lib/usePoll';
import { getMyDeliveries, markDelivered, claimDelivery, reportArrival, reportIssue, getMyReputation } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';
import Loading from '@/components/Loading';

const mapsUrl = (p) => (p?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.address} ${p.barrio || ''} Bariloche`)}` : null);

export default function Repartidor() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [rep, setRep] = useState(null);
  const [loaded, setLoaded] = useState(false); // primer fetch completado (evita parpadeo del empty state)
  const [busy, setBusy] = useState(null); // orderId que se está tomando (evita doble-claim + da feedback)

  const load = async () => { try { const d = await getMyDeliveries(); setItems((p) => keep(p, d || [])); setLoaded(true); getMyReputation().then((r) => r && setRep(r)).catch(() => {}); } catch {} };
  usePoll(load, 5000);

  const disponibles = items.filter((d) => !d.mine);
  const mias = items.filter((d) => d.mine);
  const label = (r) => r.desc || r.catLabel || 'Repuesto';

  async function tomar(o) {
    if (busy) return;
    setBusy(o.orderId);
    try {
      const res = await claimDelivery(o.orderId);
      if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); load(); return; }
      toast({ title: 'Pedido tomado', sub: 'Andá a retirarlo al comercio', icon: 'fa-hand', type: 'green' }); load();
    } finally { setBusy(null); }
  }
  async function entregar(o, pin) {
    const r = await markDelivered(o.orderId, pin);
    if (r?.error) toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' });
    else toast({ title: 'Entrega confirmada 🎉', sub: 'Ciclo completado', icon: 'fa-check', type: 'green' });
    load();
  }
  async function llegue(o, stage) {
    const r = await reportArrival(o.orderId, stage);
    if (r?.error) toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' });
    else toast({ title: 'Llegada avisada', sub: stage === 'pickup' ? 'El comercio ya sabe que estás ahí — pedile que confirme con tu PIN' : 'El mecánico ya sabe que llegaste — pedile su PIN', icon: 'fa-location-dot', type: 'green' });
    load();
  }
  async function nadie(o, stage) {
    const r = await reportIssue(o.orderId, stage === 'pickup' ? 'Nadie me atendió en el comercio' : 'Nadie me atendió en el taller');
    if (r?.error) toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' });
    else toast({ title: 'Incidencia registrada', sub: 'Queda avisado para el comercio y el admin', icon: 'fa-flag', type: 'purple' });
    load();
  }
  async function logout() { await logoutAction(); router.push('/login'); }

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Repartidor</span></Link>
        <div className="topbar-actions">
          {rep && <span className="badge badge-yellow" title="Tu reputación: promedio de reseñas · entregas concretadas"><i className="fa-solid fa-star"></i> {rep.rating != null ? `${rep.rating} (${rep.count})` : 'Nuevo'} · {rep.points} {rep.points === 1 ? 'entrega' : 'entregas'}</span>}
          <span className="badge badge-green"><i className="fa-solid fa-circle" style={{ fontSize: 7 }}></i> En línea</span>
          <button className="icon-btn" onClick={logout} title="Salir"><i className="fa-solid fa-right-from-bracket"></i></button>
        </div>
      </div>

      <div className="container">
        <div className="mb-16"><div className="eyebrow">Empresa de fletes</div><h1 className="h-lg">Entregas</h1><p className="text-sm muted">Retiros y entregas asignadas</p></div>

        <div className="grid-3 mb-16">
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value text-yellow">{disponibles.length}</div><div className="stat-label">Disponibles</div></div>
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value text-green">{mias.length}</div><div className="stat-label">Mis entregas</div></div>
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value">{items.length}</div><div className="stat-label">Total</div></div>
        </div>

        {/* Pedidos disponibles para tomar */}
        <div className="section-title"><h2>Pedidos disponibles</h2><span className="text-xs muted">primero en tomar, se lo lleva</span></div>
        {!loaded ? (
          <Loading label="Cargando pedidos…" />
        ) : disponibles.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}><div className="text-sm muted">No hay pedidos esperando flete</div></div>
        ) : <div className="cards-grid mb-16">{disponibles.map((o) => (
          <div className="card mb-12" key={o.orderId}>
            <div className="flex-between mb-12">
              <div className="flex-center gap-12"><div className="store-avatar" style={{ background: 'rgba(250,204,21,0.16)', color: '#FACC15' }}><i className="fa-solid fa-box"></i></div><div><div className="text-sm" style={{ fontWeight: 700 }}>{label(o)}</div><div className="text-xs muted">Pedido #{o.code}</div></div></div>
              {o.freight ? <span className="badge badge-green">{'$' + o.freight.toLocaleString('es-AR')}</span> : null}
            </div>
            <div className="card mb-12" style={{ background: 'var(--bg-1)', padding: 12 }}>
              <Punto icon="fa-store" color="#FACC15" titulo="Retiro" lugar={o.pickup?.name} dir={o.pickup?.address} barrio={o.pickup?.barrio} maps={mapsUrl(o.pickup)} />
              <div style={{ borderLeft: '2px dashed var(--border)', height: 14, marginLeft: 17 }}></div>
              <Punto icon="fa-screwdriver-wrench" color="#6D28D9" titulo="Entrega" lugar={o.dropoff?.name} dir={o.dropoff?.address} barrio={o.dropoff?.barrio} maps={mapsUrl(o.dropoff)} />
            </div>
            <button className="btn btn-yellow btn-block" disabled={busy === o.orderId} onClick={() => tomar(o)}>{busy === o.orderId ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Tomando…</> : <><i className="fa-solid fa-hand"></i> Tomar pedido</>}</button>
          </div>
        ))}</div>}

        {/* Mis entregas en curso */}
        <div className="section-title"><h2>Mis entregas</h2></div>
        {!loaded ? (
          <Loading label="Cargando tus entregas…" />
        ) : mias.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}><div className="text-sm muted">Todavía no tomaste ningún pedido</div></div>
        ) : <div className="cards-grid">{mias.map((o) => (
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
            {o.issue && <div className="float-notif mb-12" style={{ padding: '8px 12px', borderColor: 'rgba(239,68,68,0.4)' }}><i className="fa-solid fa-flag text-red"></i><span className="text-xs subtle">{o.issue}</span></div>}
            {o.status === 'PAID' ? (
              <div>
                {!o.arrivedPickup && <button className="btn btn-primary btn-block mb-12" onClick={() => llegue(o, 'pickup')}><i className="fa-solid fa-location-dot"></i> Llegué al comercio</button>}
                <div className="card mb-12" style={{ background: 'rgba(250,204,21,0.08)', borderColor: 'rgba(250,204,21,0.35)', textAlign: 'center', padding: 14 }}>
                  <div className="text-xs muted mb-4">Mostrale este PIN al vendedor al retirar</div>
                  <div className="h-lg text-yellow" style={{ letterSpacing: '0.3em' }}>{o.pickupPin || '— — — —'}</div>
                  <div className="text-xs muted mt-4">El vendedor lo ingresa para confirmar que te llevás la pieza</div>
                </div>
                <button className="btn btn-ghost btn-sm btn-block" onClick={() => nadie(o, 'pickup')}><i className="fa-solid fa-user-slash"></i> Nadie me atendió</button>
              </div>
            ) : (
              <div>
                {!o.arrivedDrop && <button className="btn btn-primary btn-block mb-12" onClick={() => llegue(o, 'drop')}><i className="fa-solid fa-location-dot"></i> Llegué al taller</button>}
                <EntregaPin onConfirm={(pin) => entregar(o, pin)} />
                <button className="btn btn-ghost btn-sm btn-block mt-12" onClick={() => nadie(o, 'drop')}><i className="fa-solid fa-user-slash"></i> Nadie me atendió</button>
              </div>
            )}
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

function EntregaPin({ onConfirm }) {
  const [pin, setPin] = useState('');
  return (
    <div>
      <div className="text-xs muted mb-8"><i className="fa-solid fa-key"></i> Pedile el PIN de entrega al mecánico</div>
      <div className="flex gap-12">
        <input className="input" inputMode="numeric" maxLength={4} placeholder="PIN" aria-label="PIN de entrega que te da el mecánico" value={pin} onChange={(e) => setPin(e.target.value)} style={{ maxWidth: 110, textAlign: 'center', letterSpacing: '0.2em', fontWeight: 800 }} />
        <button className="btn btn-success btn-block" disabled={pin.length !== 4} onClick={() => { onConfirm(pin); setPin(''); }}><i className="fa-solid fa-check"></i> Confirmar entrega</button>
      </div>
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
