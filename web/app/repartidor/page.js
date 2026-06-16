'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/ui';
import { usePoll, keep } from '@/lib/usePoll';
import { useTitleBell } from '@/lib/useTitleBell';
import { getMyDeliveries, markDelivered, claimDelivery, reportArrival, reportIssue, getMyReputation } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';
import Loading from '@/components/Loading';
import BusyButton from '@/components/BusyButton';
import { mapsDirUrl as mapsUrl } from '@/lib/maps';

export default function Repartidor() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [rep, setRep] = useState(null);
  const [loaded, setLoaded] = useState(false); // primer fetch completado (evita parpadeo del empty state)
  const [busy, setBusy] = useState(null); // orderId que se está tomando (evita doble-claim + da feedback)

  const load = async () => { try { const d = await getMyDeliveries(); setItems((p) => keep(p, d || [])); setLoaded(true); getMyReputation().then((r) => r && setRep(r)).catch(() => {}); } catch {} };
  usePoll(load, 5000);

  const disponibles = items.filter((d) => !d.mine); // viajes sin tomar
  const mias = items.filter((d) => d.mine); // mis viajes en curso
  useTitleBell(disponibles.length, 'Repartidor · RepuestosAlToque'); // campanita si hay viajes nuevos para tomar

  // cada acción opera sobre el VIAJE entero (el server consolida por patente+comercio+mecánico).
  async function tomar(t) {
    if (busy) return;
    setBusy(t.tripId);
    try {
      const res = await claimDelivery(t.orderIds[0]);
      if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); load(); return; }
      toast({ title: 'Viaje tomado', sub: 'Andá a retirar al comercio', icon: 'fa-hand', type: 'green' }); load();
    } finally { setBusy(null); }
  }
  async function entregar(t, pin) {
    const r = await markDelivered(t.orderIds[0], pin);
    if (r?.error) toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' });
    else toast({ title: 'Entrega confirmada 🎉', sub: 'Ciclo completado', icon: 'fa-check', type: 'green' });
    load();
  }
  async function llegue(orderId, stage) {
    const r = await reportArrival(orderId, stage);
    if (r?.error) toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' });
    else toast({ title: 'Llegada avisada', sub: stage === 'pickup' ? 'El comercio ya sabe que estás ahí — pedile que confirme con tu PIN' : 'El mecánico ya sabe que llegaste — pedile su PIN', icon: 'fa-location-dot', type: 'green' });
    load();
  }
  async function nadie(orderId, stage) {
    const r = await reportIssue(orderId, stage);
    if (r?.error) toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' });
    else toast({ title: 'Incidencia registrada', sub: 'Queda avisado para el comercio y el admin', icon: 'fa-flag', type: 'purple' });
    load();
  }
  async function logout() { await logoutAction(); router.push('/login'); }

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/repartidor" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Repartidor</span></Link>
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
        ) : <div className="cards-grid mb-16">{disponibles.map((t) => (
          <div className="card mb-12" key={t.tripId}>
            <div className="flex-between mb-12">
              <div className="flex-center gap-12"><div className="store-avatar" style={{ background: 'rgba(250,204,21,0.16)', color: '#FACC15' }}><i className="fa-solid fa-box"></i></div><div><div className="text-sm" style={{ fontWeight: 700 }}>{t.veh}{t.plate ? ` · ${t.plate}` : ''}</div><div className="text-xs muted">{t.itemsCount} pieza{t.itemsCount === 1 ? '' : 's'} · {t.pickups.length} {t.pickups.length === 1 ? 'comercio' : 'comercios'} · 1 viaje</div></div></div>
              {t.freight ? <span className="badge badge-green">{'$' + t.freight.toLocaleString('es-AR')}</span> : null}
            </div>
            <div className="card mb-12" style={{ background: 'var(--bg-1)', padding: 12 }}>
              {t.pickups.map((pk, i) => (
                <div key={pk.storeId}>
                  {i > 0 && <div style={{ borderLeft: '2px dashed var(--border)', height: 14, marginLeft: 17 }}></div>}
                  <Punto icon="fa-store" color="#FACC15" titulo={`Retiro ${t.pickups.length > 1 ? i + 1 : ''}`.trim()} lugar={pk.name} dir={pk.address} barrio={pk.barrio} maps={mapsUrl(pk)} />
                  <ItemsViaje items={pk.items} embedded />
                </div>
              ))}
              <div style={{ borderLeft: '2px dashed var(--border)', height: 14, marginLeft: 17 }}></div>
              <Punto icon="fa-screwdriver-wrench" color="#6D28D9" titulo="Entrega" lugar={t.dropoff?.name} dir={t.dropoff?.address} barrio={t.dropoff?.barrio} maps={mapsUrl(t.dropoff)} />
            </div>
            <button className="btn btn-yellow btn-block" disabled={busy === t.tripId} onClick={() => tomar(t)}>{busy === t.tripId ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Tomando…</> : <><i className="fa-solid fa-hand"></i> Tomar viaje</>}</button>
          </div>
        ))}</div>}

        {/* Mis entregas en curso */}
        <div className="section-title"><h2>Mis entregas</h2></div>
        {!loaded ? (
          <Loading label="Cargando tus entregas…" />
        ) : mias.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}><div className="text-sm muted">Todavía no tomaste ningún pedido</div></div>
        ) : <div className="cards-grid">{mias.map((t) => (
          <div className="card mb-12" key={t.tripId}>
            <div className="flex-between mb-12">
              <div className="flex-center gap-12"><div className="store-avatar" style={{ background: 'rgba(34,197,94,0.16)', color: '#4ADE80' }}><i className="fa-solid fa-box"></i></div><div><div className="text-sm" style={{ fontWeight: 700 }}>{t.veh}{t.plate ? ` · ${t.plate}` : ''}</div><div className="text-xs muted">{t.itemsCount} pieza{t.itemsCount === 1 ? '' : 's'} · {t.pickups.length} {t.pickups.length === 1 ? 'comercio' : 'comercios'}</div></div></div>
              <span className="badge badge-yellow">{t.allPicked ? 'Listo para entregar' : 'A retirar'}</span>
            </div>
            {t.issue && <div className="float-notif mb-12" style={{ padding: '8px 12px', borderColor: 'rgba(239,68,68,0.4)' }}><i className="fa-solid fa-flag text-red"></i><span className="text-xs subtle">{t.issue}</span></div>}

            {/* RETIROS: uno por comercio */}
            {t.pickups.map((pk, i) => (
              <div className="card mb-12" key={pk.storeId} style={{ background: 'var(--bg-1)', padding: 12 }}>
                <Punto icon="fa-store" color="#FACC15" titulo={`Retiro ${t.pickups.length > 1 ? i + 1 : ''}`.trim()} lugar={pk.name} dir={pk.address} barrio={pk.barrio} maps={mapsUrl(pk)} />
                {pk.allPicked && <div className="mt-8"><span className="badge badge-green"><i className="fa-solid fa-check"></i> Retirado</span></div>}
                <ItemsViaje items={pk.items} embedded />
                {!pk.allPicked && (
                  <div className="mt-8">
                    {!pk.arrived && <BusyButton className="btn btn-primary btn-block btn-sm mb-8" busyLabel="Avisando…" onClick={() => llegue(pk.orderId, 'pickup')}><i className="fa-solid fa-location-dot"></i> Llegué al comercio</BusyButton>}
                    <div style={{ textAlign: 'center', padding: '8px 0' }}>
                      <div className="text-xs muted mb-4">Mostrale este PIN al vendedor</div>
                      <div className="h-md text-yellow pickup-pin" style={{ letterSpacing: '0.3em' }}>{t.pickupPin || '— — — —'}</div>
                    </div>
                    <BusyButton className="btn btn-ghost btn-sm btn-block" busyLabel="Avisando…" onClick={() => nadie(pk.orderId, 'pickup')}><i className="fa-solid fa-user-slash"></i> Nadie me atendió</BusyButton>
                  </div>
                )}
              </div>
            ))}

            {/* ENTREGA al taller */}
            <div className="card mb-12" style={{ background: 'var(--bg-1)', padding: 12 }}>
              <Punto icon="fa-screwdriver-wrench" color="#6D28D9" titulo="Entrega al taller" lugar={t.dropoff?.name} dir={t.dropoff?.address} barrio={t.dropoff?.barrio} maps={mapsUrl(t.dropoff)} />
            </div>
            {t.allPicked ? (
              <div>
                {!t.arrivedDrop && <BusyButton className="btn btn-primary btn-block mb-12" busyLabel="Avisando…" onClick={() => llegue(t.orderIds[0], 'drop')}><i className="fa-solid fa-location-dot"></i> Llegué al taller</BusyButton>}
                <EntregaPin onConfirm={(pin) => entregar(t, pin)} />
                <BusyButton className="btn btn-ghost btn-sm btn-block mt-12" busyLabel="Avisando…" onClick={() => nadie(t.orderIds[0], 'drop')}><i className="fa-solid fa-user-slash"></i> Nadie me atendió</BusyButton>
              </div>
            ) : (
              <div className="text-xs muted" style={{ textAlign: 'center', padding: 8 }}><i className="fa-solid fa-circle-info"></i> Retirá todas las piezas antes de entregar al taller</div>
            )}
          </div>
        ))}</div>}
      </div>

      <nav className="bottom-nav">
        <Link href="/repartidor" className="active"><i className="fa-solid fa-truck-fast"></i>Entregas</Link>
        <button onClick={logout} style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: 'var(--text-2)', fontSize: '10.5px', fontWeight: 600, cursor: 'pointer' }}><i className="fa-solid fa-right-from-bracket"></i>Salir</button>
      </nav>
    </div>
  );
}

function EntregaPin({ onConfirm }) {
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false); // evita doble-confirmación + da feedback
  async function confirmar() {
    if (sending) return;
    setSending(true);
    try { await onConfirm(pin); setPin(''); } finally { setSending(false); }
  }
  return (
    <div>
      <div className="text-xs muted mb-8"><i className="fa-solid fa-key"></i> Pedile el PIN de entrega al mecánico</div>
      <div className="flex gap-12">
        <input className="input" inputMode="numeric" maxLength={4} placeholder="PIN" aria-label="PIN de entrega que te da el mecánico" value={pin} onChange={(e) => setPin(e.target.value)} style={{ maxWidth: 110, textAlign: 'center', letterSpacing: '0.2em', fontWeight: 800 }} />
        <button className="btn btn-success btn-block" disabled={pin.length !== 4 || sending} onClick={confirmar}>{sending ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Confirmando…</> : <><i className="fa-solid fa-check"></i> Confirmar entrega</>}</button>
      </div>
    </div>
  );
}

function ItemsViaje({ items, embedded }) {
  if (!items?.length) return null;
  const inner = (
    <>
      {items.map((it) => (
        <div key={it.orderId} className="flex-center gap-8" style={{ padding: '2px 0' }}>
          <i className="fa-solid fa-circle text-purple" style={{ fontSize: 5 }}></i>
          <span className="text-sm" style={{ fontWeight: 600 }}>{it.label}</span>
          {it.code ? <span className="text-xs muted">#{it.code}</span> : null}
        </div>
      ))}
    </>
  );
  if (embedded) return <div style={{ paddingLeft: 46, paddingBottom: 4 }}>{inner}</div>;
  return (
    <div className="card mb-12" style={{ background: 'var(--bg-1)', padding: '10px 12px' }}>
      <div className="text-xs muted mb-4"><i className="fa-solid fa-boxes-stacked"></i> {items.length === 1 ? 'Pieza a llevar' : `Piezas a llevar (${items.length})`}</div>
      {inner}
    </div>
  );
}

function Punto({ icon, color, titulo, lugar, dir, barrio, maps }) {
  return (
    <div className="flex gap-12" style={{ alignItems: 'flex-start' }}>
      <div className="store-avatar" style={{ width: 34, height: 34, background: 'transparent', color, flexShrink: 0 }}><i className={`fa-solid ${icon}`}></i></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="text-xs muted">{titulo}</div>
        <div className="text-sm" style={{ fontWeight: 700 }}>{lugar || '—'}</div>
        <div className="text-xs muted">{dir ? `${dir}${barrio ? ' · ' + barrio : ''}` : 'Sin dirección cargada'}</div>
      </div>
      {maps && <a className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto' }} href={maps} target="_blank" rel="noopener"><i className="fa-solid fa-location-arrow"></i> Cómo llegar</a>}
    </div>
  );
}
