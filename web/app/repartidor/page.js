'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast, money } from '@/lib/ui';
import { usePoll, keep } from '@/lib/usePoll';
import { useTitleBell } from '@/lib/useTitleBell';
import PushButton from '@/components/PushButton';
import FontScale from '@/components/FontScale';
import { getMyDeliveries, markDelivered, claimDelivery, reportArrival, reportIssue, getMyReputation, getDeliveryHistory } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';
import Loading from '@/components/Loading';
import BusyButton from '@/components/BusyButton';
import RoutePoint from '@/components/repartidor/RoutePoint';
import HistorialView from '@/components/repartidor/HistorialView';

export default function Repartidor() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [rep, setRep] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loaded, setLoaded] = useState(false); // primer fetch completado (evita parpadeo del empty state)
  const [busy, setBusy] = useState(null); // tripId que se está tomando (evita doble-claim + da feedback)
  const [tab, setTab] = useState('activas');
  const [online, setOnline] = useState(true);

  // preferencias del cliente (se leen en efecto para no romper la hidratación SSR)
  useEffect(() => {
    try {
      const t = localStorage.getItem('rp.tab'); if (t === 'activas' || t === 'historial') setTab(t);
      if (localStorage.getItem('rp.online') === '0') setOnline(false);
    } catch {}
  }, []);

  const load = async () => {
    try {
      const d = await getMyDeliveries(); setItems((p) => keep(p, d || [])); setLoaded(true);
      getMyReputation().then((r) => r && setRep(r)).catch(() => {});
      getDeliveryHistory().then((h) => setHistorial(h || [])).catch(() => {});
    } catch {}
  };
  usePoll(load, 5000);

  const disponibles = items.filter((d) => !d.mine); // viajes sin tomar
  const mias = items.filter((d) => d.mine); // mis viajes en curso
  useTitleBell(online ? disponibles.length : 0, 'Repartidor · RepuestosAlToque'); // campanita si hay viajes nuevos

  const ganHoy = historial.filter((h) => h.daysAgo === 0).reduce((n, h) => n + h.freight, 0);

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
    else toast({ title: 'Entrega confirmada 🎉', sub: 'Ciclo completado · sumaste el flete', icon: 'fa-check', type: 'green' });
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

  function switchTab(t) { setTab(t); try { localStorage.setItem('rp.tab', t); } catch {} window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function toggleOnline() {
    const v = !online; setOnline(v); try { localStorage.setItem('rp.online', v ? '1' : '0'); } catch {}
    toast({ title: v ? 'Estás en línea' : 'Te desconectaste', sub: v ? 'Vas a ver y recibir viajes disponibles' : 'No vas a ver nuevos viajes hasta reconectarte', icon: v ? 'fa-circle-check' : 'fa-circle-pause', type: v ? 'green' : 'purple' });
  }

  const navBtn = { background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: '10.5px', fontWeight: 600, cursor: 'pointer' };

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/repartidor" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Repartidor</span></Link>
        <div className="topbar-actions">
          {rep && <span className="rep-pill" title="Tu reputación: promedio de reseñas · entregas concretadas"><i className="fa-solid fa-star"></i> {rep.rating != null ? `${rep.rating} (${rep.count})` : 'Nuevo'} · {rep.points} {rep.points === 1 ? 'entrega' : 'entregas'}</span>}
          <button className={`online-pill ${online ? '' : 'off'}`} onClick={toggleOnline} title="Conectarte / desconectarte"><i className="fa-solid fa-circle"></i> {online ? 'En línea' : 'Desconectado'}</button>
          <FontScale />
          <button className="icon-btn" onClick={logout} title="Salir"><i className="fa-solid fa-right-from-bracket"></i></button>
        </div>
      </div>

      <div className="container">
        <div className="rp-head">
          <div><div className="eyebrow">Empresa de fletes</div><h1 className="h-lg">Entregas</h1></div>
        </div>
        <div className="mb-16"><PushButton /></div>

        <div className="rp-tabs">
          <button className={`${tab === 'activas' ? 'active' : ''} ${online && disponibles.length > 0 ? 'alert' : ''}`} onClick={() => switchTab('activas')}><i className="fa-solid fa-truck-fast"></i> Activas <span className="cnt">{disponibles.length + mias.length}</span></button>
          <button className={tab === 'historial' ? 'active' : ''} onClick={() => switchTab('historial')}><i className="fa-solid fa-clock-rotate-left"></i> Historial <span className="cnt">{historial.length}</span></button>
        </div>

        {tab === 'activas' ? (
          <>
            <div className="kpi-row">
              <div className="kpi"><div className="kv text-yellow">{online ? disponibles.length : '—'}</div><div className="kl"><i className="fa-solid fa-hand"></i>Disponibles</div></div>
              <div className="kpi"><div className="kv text-green">{mias.length}</div><div className="kl"><i className="fa-solid fa-truck-fast"></i>En curso</div></div>
              <div className="kpi"><div className="kv">{money(ganHoy)}</div><div className="kl"><i className="fa-solid fa-sack-dollar"></i>Ganado hoy</div></div>
            </div>

            <div className="sec-head"><h2><i className="fa-solid fa-hand text-yellow"></i> Pedidos disponibles</h2><span className="hint">primero en tomar, se lo lleva</span></div>
            {!loaded ? <Loading label="Cargando pedidos…" />
              : !online ? <div className="empty-card"><i className="fa-solid fa-circle-pause"></i><div className="et">Estás desconectado. Activá <b>En línea</b> para ver y tomar viajes.</div></div>
              : disponibles.length === 0 ? <div className="empty-card"><i className="fa-solid fa-mug-hot"></i><div className="et">No hay viajes esperando flete ahora.</div></div>
              : <div className="trip-grid">{disponibles.map((t) => (
                <div className="card trip" key={t.tripId}>
                  <div className="trip-top">
                    <div className="trip-veh"><i className="fa-solid fa-truck-fast"></i></div>
                    <div className="trip-veh-info"><div className="vn">{t.veh}</div>
                      <div className="vs"><span className="plate">{t.plate || 's/patente'}</span> · {t.itemsCount} pza{t.itemsCount !== 1 ? 's' : ''} · {t.pickups.length} {t.pickups.length === 1 ? 'comercio' : 'comercios'}</div></div>
                    {t.freight ? <div className="freight-badge"><span className="fa-val">{money(t.freight)}</span><span className="fa-lbl">flete</span></div> : null}
                  </div>
                  <div className="route">
                    {t.pickups.map((pk, i) => <RoutePoint key={pk.storeId} pk={pk} idx={i} total={t.pickups.length} />)}
                    <RoutePoint pk={t.dropoff} total={t.pickups.length} drop last />
                  </div>
                  <div className="trip-actions"><button className="btn btn-yellow btn-block" disabled={busy === t.tripId} onClick={() => tomar(t)}>{busy === t.tripId ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Tomando…</> : <><i className="fa-solid fa-hand"></i> Tomar viaje</>}</button></div>
                </div>
              ))}</div>}

            <div className="sec-head sec-gap"><h2><i className="fa-solid fa-truck-fast text-green"></i> Mis entregas</h2></div>
            {!loaded ? <Loading label="Cargando tus entregas…" />
              : mias.length === 0 ? <div className="empty-card"><i className="fa-solid fa-box-open"></i><div className="et">Todavía no tomaste ningún viaje. Aceptá uno de los disponibles.</div></div>
              : <div className="trip-grid">{mias.map((t) => (
                <div className="card trip live" key={t.tripId}>
                  <div className="trip-top">
                    <div className="trip-veh"><i className="fa-solid fa-truck-fast"></i></div>
                    <div className="trip-veh-info"><div className="vn">{t.veh}</div>
                      <div className="vs"><span className="plate">{t.plate || 's/patente'}</span> · {t.itemsCount} pza{t.itemsCount !== 1 ? 's' : ''} · {t.pickups.length} {t.pickups.length === 1 ? 'comercio' : 'comercios'}</div></div>
                    <span className={`badge ${t.allPicked ? 'badge-green' : 'badge-yellow'}`}>{t.allPicked ? 'Listo para entregar' : 'A retirar'}</span>
                  </div>
                  {t.issue && <div className="issue-banner"><i className="fa-solid fa-flag"></i> {t.issue}</div>}

                  {t.pickups.map((pk, i) => (
                    <div className="route" style={{ marginBottom: 10 }} key={pk.storeId}>
                      <RoutePoint pk={pk} idx={i} total={t.pickups.length} done={pk.allPicked} last />
                      {!pk.allPicked && (
                        <div className="trip-actions">
                          {!pk.arrived && <BusyButton className="btn btn-primary btn-sm btn-block" busyLabel="Avisando…" onClick={() => llegue(pk.orderId, 'pickup')}><i className="fa-solid fa-location-dot"></i> Llegué al comercio</BusyButton>}
                          <div className="pin-box"><div className="pl">Mostrale este PIN al vendedor para confirmar el retiro</div><div className="pv pickup-pin">{t.pickupPin || '——'}</div></div>
                          <BusyButton className="btn btn-ghost btn-sm btn-block" busyLabel="Avisando…" onClick={() => nadie(pk.orderId, 'pickup')}><i className="fa-solid fa-user-slash"></i> Nadie me atendió</BusyButton>
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="route">
                    <RoutePoint pk={t.dropoff} drop last />
                    {t.allPicked ? (
                      <div className="trip-actions">
                        {!t.arrivedDrop && <BusyButton className="btn btn-primary btn-sm btn-block" busyLabel="Avisando…" onClick={() => llegue(t.orderIds[0], 'drop')}><i className="fa-solid fa-location-dot"></i> Llegué al taller</BusyButton>}
                        <EntregaPin onConfirm={(pin) => entregar(t, pin)} />
                        <BusyButton className="btn btn-ghost btn-sm btn-block" busyLabel="Avisando…" onClick={() => nadie(t.orderIds[0], 'drop')}><i className="fa-solid fa-user-slash"></i> Nadie me atendió</BusyButton>
                      </div>
                    ) : <div className="blocked-note"><i className="fa-solid fa-circle-info"></i> Retirá todas las piezas antes de entregar al taller.</div>}
                  </div>
                </div>
              ))}</div>}
          </>
        ) : (
          !loaded ? <Loading label="Cargando historial…" /> : <HistorialView historial={historial} />
        )}
      </div>

      <nav className="bottom-nav">
        <button className={tab === 'activas' ? 'active' : ''} onClick={() => switchTab('activas')} style={{ ...navBtn, color: tab === 'activas' ? 'var(--purple-light)' : 'var(--text-2)' }}><i className="fa-solid fa-truck-fast"></i>Entregas</button>
        <button className={tab === 'historial' ? 'active' : ''} onClick={() => switchTab('historial')} style={{ ...navBtn, color: tab === 'historial' ? 'var(--purple-light)' : 'var(--text-2)' }}><i className="fa-solid fa-clock-rotate-left"></i>Historial</button>
        <button onClick={logout} style={{ ...navBtn, color: 'var(--text-2)' }}><i className="fa-solid fa-right-from-bracket"></i>Salir</button>
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
    <div className="pin-box">
      <div className="pl"><i className="fa-solid fa-key"></i> Pedile al mecánico su PIN de entrega</div>
      <div className="pin-entry" style={{ justifyContent: 'center', marginTop: 8 }}>
        <input type="text" inputMode="numeric" maxLength={4} placeholder="PIN" aria-label="PIN de entrega que te da el mecánico" value={pin} onChange={(e) => setPin(e.target.value)} />
        <button className="btn btn-success" disabled={pin.length !== 4 || sending} onClick={confirmar}>{sending ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Confirmando…</> : <><i className="fa-solid fa-check"></i> Confirmar entrega</>}</button>
      </div>
    </div>
  );
}
