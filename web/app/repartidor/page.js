'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/ui';
import { usePoll, keep } from '@/lib/usePoll';
import { useTitleBell } from '@/lib/useTitleBell';
import PushButton from '@/components/PushButton';
import FontScale from '@/components/FontScale';
import BusyButton from '@/components/BusyButton';
import Loading from '@/components/Loading';
import { getMe, getMyDeliveries, getMyDeliveryHistory, markDelivered, claimDelivery, reportArrival, reportIssue, getMyReputation } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';
import { mapsDirUrl as mapsUrl } from '@/lib/maps';

const PER = 8;
const money = (n) => '$' + Math.round(n || 0).toLocaleString('es-AR');
const timeAgo = (ts) => { if (!ts) return ''; const s = (Date.now() - ts) / 1000; if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))} min`; if (s < 86400) return `hace ${Math.round(s / 3600)} h`; const d = Math.round(s / 86400); return `hace ${d} día${d === 1 ? '' : 's'}`; };
const isToday = (ts) => { const a = new Date(ts), b = new Date(); return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear(); };
const ymd = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtD = (s) => { const [y, m, d] = s.split('-'); return `${+d}/${+m}/${y}`; };
const vehIcon = (v) => /moto/i.test(v || '') ? 'motorcycle' : 'car-side';

export default function Repartidor() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [items, setItems] = useState([]);
  const [hist, setHist] = useState([]);
  const [rep, setRep] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('viaje');
  const [busy, setBusy] = useState(null);
  const [histPage, setHistPage] = useState(1);
  const [histQuery, setHistQuery] = useState('');
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');

  const load = async () => {
    try {
      const [d, h, m] = await Promise.all([getMyDeliveries(), getMyDeliveryHistory(), getMe()]);
      setItems((p) => keep(p, d || [])); setHist((p) => keep(p, h || [])); setMe((p) => keep(p, m || null)); setLoaded(true);
      getMyReputation().then((r) => r && setRep((p) => keep(p, r))).catch(() => {});
    } catch {}
  };
  usePoll(load, 5000);

  const disponibles = items.filter((d) => !d.mine);
  const actives = items.filter((d) => d.mine); // un repartidor puede tener más de un viaje en curso
  useTitleBell(disponibles.length, 'Repartidor · RepuestosAlToque');

  // ganancias (del historial entregado)
  const today = hist.filter((h) => isToday(h.ts));
  const ganadoHoy = money(today.reduce((s, h) => s + h.freight, 0));
  const entregasHoy = today.length;
  const weekAgo = Date.now() - 7 * 86400000;
  const estaSemana = money(hist.filter((h) => h.ts >= weekAgo).reduce((s, h) => s + h.freight, 0));

  // acciones (cada una opera sobre el VIAJE; el server consolida por patente+comercio+mecánico)
  async function tomar(t) {
    if (busy) return; setBusy(t.tripId);
    try {
      const res = await claimDelivery(t.orderIds[0]);
      if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); load(); return; }
      toast({ title: 'Viaje tomado', sub: 'Andá a retirar al comercio', icon: 'fa-hand', type: 'green' }); setTab('viaje'); load();
    } finally { setBusy(null); }
  }
  async function entregar(t, pin) {
    const r = await markDelivered(t.orderIds[0], pin);
    if (r?.error) { toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); }
    else { toast({ title: '¡Entrega confirmada! 🎉', sub: 'Ciclo completado · está en tu Historial', icon: 'fa-check', type: 'green' }); }
    load(); // queda en "Mi viaje" (muestra los viajes que sigan en curso)
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

  const ratingStr = rep ? (rep.rating != null ? `${rep.rating} (${rep.count})` : 'Nuevo') : '—';
  const greeting = actives.length ? 'Tenés un viaje en curso. Seguí los pasos.' : (disponibles.length ? 'Hay viajes esperando para tomar.' : 'Sin viajes por ahora. Te avisamos.');

  // historial: hoy por defecto; filtrable por búsqueda o rango de fechas
  const q = histQuery.trim().toLowerCase();
  const filtering = !!q || !!histFrom || !!histTo;
  const sorted = [...hist].sort((a, b) => b.ts - a.ts);
  let scope = filtering ? sorted : sorted.filter((h) => isToday(h.ts));
  if (histFrom) scope = scope.filter((h) => ymd(h.ts) >= histFrom);
  if (histTo) scope = scope.filter((h) => ymd(h.ts) <= histTo);
  if (q) scope = scope.filter((h) => `${h.veh} ${h.part} ${h.from} ${h.to}`.toLowerCase().includes(q));
  const histPages = Math.max(1, Math.ceil(scope.length / PER));
  const curPage = Math.min(histPage, histPages);
  const histVis = scope.slice((curPage - 1) * PER, curPage * PER);
  const ganadoScope = money(scope.reduce((s, h) => s + h.freight, 0));
  const histLabel = q ? 'Resultados' : (histFrom && histTo) ? `Del ${fmtD(histFrom)} al ${fmtD(histTo)}` : histFrom ? `Desde el ${fmtD(histFrom)}` : histTo ? `Hasta el ${fmtD(histTo)}` : 'Entregas de hoy';
  const histCount = `${scope.length} ${scope.length === 1 ? 'entrega' : 'entregas'} · ${ganadoScope}`;
  const histEmptyMsg = q ? 'Sin resultados para tu búsqueda' : (histFrom || histTo) ? 'No hiciste entregas en ese rango' : 'Todavía no completaste entregas hoy';

  return (
    <div className="app-shell rep">
      <div className="topbar">
        <Link href="/repartidor" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Repartidor</span></Link>
        <div className="topbar-actions">
          <span className="rep-badge"><i className="fa-solid fa-star"></i> {ratingStr}</span>
          <FontScale />
          <button className="icon-btn" onClick={logout} title="Salir"><i className="fa-solid fa-right-from-bracket"></i></button>
        </div>
      </div>

      <div className="container">
        <div className="rep-wrap">
          <div className="mb-16">
            <div className="eyebrow">Reparto</div>
            <h1 className="h-lg" style={{ fontSize: 25 }}>Hola, {me?.name || 'Repartidor'}</h1>
            <p className="subtle mt-4" style={{ fontSize: 16 }}>{greeting}</p>
          </div>
          <div className="mb-16"><PushButton /></div>

          <div className="grid-3 mb-18">
            <div className="card rep-stat"><div className="v text-yellow">{ganadoHoy}</div><div className="l">Ganado hoy</div></div>
            <div className="card rep-stat"><div className="v text-green">{entregasHoy}</div><div className="l">Entregas hoy</div></div>
            <div className="card rep-stat"><div className="v">{estaSemana}</div><div className="l">Esta semana</div></div>
          </div>

          <div className="rep-tabs">
            <div className="pill-tabs">
              <button type="button" className={tab === 'viaje' ? 'active' : ''} onClick={() => setTab('viaje')}><i className="fa-solid fa-route"></i> Mi viaje{actives.length > 0 && <span className="badge badge-yellow" style={{ padding: '2px 8px' }}>{actives.length}</span>}</button>
              <button type="button" className={tab === 'disp' ? 'active' : ''} onClick={() => setTab('disp')}><i className="fa-solid fa-box"></i> Disponibles{disponibles.length > 0 && <span className="badge badge-green" style={{ padding: '2px 8px' }}>{disponibles.length}</span>}</button>
              <button type="button" className={tab === 'hist' ? 'active' : ''} onClick={() => setTab('hist')}><i className="fa-solid fa-clock-rotate-left"></i> Historial</button>
            </div>
          </div>

          {!loaded ? <Loading label="Cargando…" /> : (<>
            {/* ===== MI VIAJE ===== */}
            {tab === 'viaje' && (actives.length
              ? <div className="rep-feed">{actives.map((t) => <TripActivo key={t.tripId} t={t} onLlegue={llegue} onNadie={nadie} onEntregar={entregar} />)}</div>
              : <div className="empty-state" style={{ padding: '32px 22px' }}>
                  <div className="empty-icon"><i className="fa-solid fa-truck-fast"></i></div>
                  <div className="text-sm" style={{ fontWeight: 700 }}>No tenés ningún viaje en curso</div>
                  <div className="text-xs mt-4">Tomá uno de la lista de disponibles y aparece acá.</div>
                  <button className="btn btn-yellow mt-16" type="button" onClick={() => setTab('disp')}><i className="fa-solid fa-box"></i> Ver viajes disponibles{disponibles.length > 0 ? ` (${disponibles.length})` : ''}</button>
                </div>)}

            {/* ===== DISPONIBLES ===== */}
            {tab === 'disp' && (<>
              <div className="section-title"><h2>Viajes para tomar</h2><span className="text-xs muted">primero que toma, se lo lleva</span></div>
              {disponibles.length === 0
                ? <div className="empty-state" style={{ padding: '32px 22px' }}><div className="empty-icon"><i className="fa-solid fa-box-open"></i></div><div className="text-sm" style={{ fontWeight: 700 }}>No hay viajes esperando</div><div className="text-xs mt-4">Te avisamos apenas entre uno nuevo.</div></div>
                : <div className="rep-feed">{disponibles.map((t) => <DispCard key={t.tripId} t={t} disabled={busy === t.tripId} busy={busy === t.tripId} onTomar={() => tomar(t)} />)}</div>}
            </>)}

            {/* ===== HISTORIAL ===== */}
            {tab === 'hist' && (<>
              <div className="section-title"><h2>{histLabel}</h2><span className="text-xs muted">{histCount}</span></div>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)', fontSize: 14, pointerEvents: 'none' }}></i>
                <input className="input" style={{ paddingLeft: 40 }} placeholder="Buscar repuesto, comercio o taller…" value={histQuery} onChange={(e) => { setHistQuery(e.target.value); setHistPage(1); }} />
                {histQuery && <button type="button" onClick={() => { setHistQuery(''); setHistPage(1); }} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}><i className="fa-solid fa-xmark"></i></button>}
              </div>
              <div className="flex gap-12 mb-16" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 140 }}><div className="text-xs muted mb-4">Desde</div><input className="input" type="date" value={histFrom} onChange={(e) => { setHistFrom(e.target.value); setHistPage(1); }} style={{ width: '100%', colorScheme: 'dark' }} /></div>
                <div style={{ flex: 1, minWidth: 140 }}><div className="text-xs muted mb-4">Hasta</div><input className="input" type="date" value={histTo} onChange={(e) => { setHistTo(e.target.value); setHistPage(1); }} style={{ width: '100%', colorScheme: 'dark' }} /></div>
                {filtering && <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setHistQuery(''); setHistFrom(''); setHistTo(''); setHistPage(1); }}><i className="fa-solid fa-rotate-left"></i> Volver a hoy</button>}
              </div>
              {scope.length === 0
                ? <div className="empty-state" style={{ padding: '32px 22px' }}><div className="empty-icon"><i className="fa-solid fa-clock-rotate-left"></i></div><div className="text-sm" style={{ fontWeight: 700 }}>{histEmptyMsg}</div></div>
                : <>
                  <div className="rep-feed">{histVis.map((h) => (
                    <div className="card" key={h.tripId + h.ts} style={{ padding: 16 }}>
                      <div className="flex-between" style={{ gap: 12, alignItems: 'flex-start' }}>
                        <div className="flex-center gap-12" style={{ minWidth: 0 }}>
                          <div className="store-avatar" style={{ width: 38, height: 38, background: 'rgba(34,197,94,0.14)', color: '#4ADE80' }}><i className="fa-solid fa-check"></i></div>
                          <div style={{ minWidth: 0 }}><div className="text-sm" style={{ fontWeight: 700 }}>{h.veh}</div><div className="text-xs" style={{ color: 'var(--purple-light)', fontWeight: 600 }}>{h.part}</div><div className="text-xs muted">{h.from} → {h.to}</div></div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}><div className="text-yellow text-sm" style={{ fontWeight: 800 }}>{money(h.freight)}</div><div className="text-xs muted">{timeAgo(h.ts)}</div></div>
                      </div>
                    </div>
                  ))}</div>
                  <RepPager total={scope.length} page={curPage} pages={histPages} setPage={setHistPage} />
                </>}
            </>)}
          </>)}

          <p className="text-center text-xs muted mt-24 mb-24">RepuestosAlToque · Repartidor</p>
        </div>
      </div>

      <nav className="bottom-nav">
        <Link href="/repartidor" className="active"><i className="fa-solid fa-truck-fast"></i>Entregas</Link>
        <button onClick={logout} style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: 'var(--text-2)', fontSize: '10.5px', fontWeight: 600, cursor: 'pointer' }}><i className="fa-solid fa-right-from-bracket"></i>Salir</button>
      </nav>
    </div>
  );
}

// Viaje activo: hero con stepper + etapa retiro (por comercio) / entrega (al taller). Flujo real:
// el RETIRO lo confirma el comercio con el PIN del repartidor -> el polling avanza el paso.
function TripActivo({ t, onLlegue, onNadie, onEntregar }) {
  const allPicked = t.allPicked;
  const cls = (x) => x === 'done' ? 'ok' : (x === 'current' ? 'on' : '');
  const s0 = allPicked ? 'done' : 'current';
  const s1 = t.arrivedDrop ? 'done' : (allPicked ? 'current' : '');
  const s2 = t.arrivedDrop ? 'current' : '';
  return (
    <div className="card rep-hero">
      <div className="flex-between mb-16" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div className="flex-center gap-12" style={{ minWidth: 0 }}>
          <div className="store-avatar" style={{ background: 'rgba(109,40,217,0.16)', color: 'var(--purple-light)' }}><i className={`fa-solid fa-${vehIcon(t.veh)}`}></i></div>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 18, fontWeight: 800 }}>{t.veh}</div><div className="text-xs muted">{t.plate || ''}{t.plate ? ' · ' : ''}{t.itemsCount} pieza{t.itemsCount === 1 ? '' : 's'} · {t.pickups.length} {t.pickups.length === 1 ? 'comercio' : 'comercios'}</div></div>
        </div>
        {t.freight ? <span className="badge badge-green" style={{ flexShrink: 0 }}>{money(t.freight)}</span> : null}
      </div>

      <div className="steps">
        <div className={`step ${s0}`}></div><div className={`step ${s1}`}></div><div className={`step ${s2}`}></div>
      </div>
      <div className="step-labels"><span className={cls(s0)}>Retiro</span><span className={cls(s1)}>En camino</span><span className={cls(s2)}>Entrega</span></div>

      {t.issue && <div className="float-notif mb-16" style={{ borderColor: 'rgba(239,68,68,0.45)' }}><i className="fa-solid fa-flag text-red"></i><span className="text-sm subtle">{t.issue}</span></div>}

      {/* ETAPA RETIRO */}
      {!allPicked && (<>
        <div className="float-notif mb-16" style={{ borderColor: 'rgba(250,204,21,0.5)' }}><i className="fa-solid fa-arrow-right text-yellow"></i><span className="text-sm subtle"><b>Paso 1:</b> retirá {t.pickups.length > 1 ? 'en cada comercio' : 'la pieza'} y mostrá tu PIN al vendedor.</span></div>
        {t.pickups.map((pk, i) => (
          <div className="card mb-12" key={pk.storeId} style={{ background: 'var(--bg-2)', padding: 14 }}>
            <div className="rep-point">
              <div className="ic" style={{ background: 'rgba(250,204,21,0.14)', color: 'var(--yellow)' }}><i className="fa-solid fa-store"></i></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="text-xs muted">{t.pickups.length > 1 ? `Retiro ${i + 1}` : 'Retiro'}</div>
                <div className="text-sm" style={{ fontWeight: 700 }}>{pk.name || '—'}</div>
                <div className="text-xs muted">{pk.address ? `${pk.address}${pk.barrio ? ' · ' + pk.barrio : ''}` : 'Sin dirección'}</div>
                <div style={{ marginTop: 6 }}>{pk.items.map((it) => (
                  <div key={it.orderId} className="flex-center gap-8" style={{ padding: '1px 0' }}><i className="fa-solid fa-circle text-purple" style={{ fontSize: 5 }}></i><span className="text-sm">{it.label}</span>{it.code && <span className="text-xs muted">#{it.code}</span>}</div>
                ))}</div>
              </div>
            </div>
            {pk.allPicked
              ? <div className="mt-12"><span className="badge badge-green"><i className="fa-solid fa-check"></i> Retirado</span></div>
              : <>
                <a className="btn btn-ghost btn-sm btn-block mt-12" href={mapsUrl(pk)} target="_blank" rel="noopener"><i className="fa-solid fa-location-arrow"></i> Cómo llegar</a>
                {!pk.arrived
                  ? <BusyButton className="btn btn-primary btn-block mt-8" busyLabel="Avisando…" onClick={() => onLlegue(pk.orderId, 'pickup')}><i className="fa-solid fa-location-dot"></i> Llegué al comercio</BusyButton>
                  : <>
                    <div className="card text-center mt-12" style={{ background: 'var(--bg-1)', padding: 16 }}>
                      <div className="text-xs muted mb-4">Mostrale este PIN al vendedor</div>
                      <div className="pin-big text-yellow pickup-pin">{t.pickupPin || '— — — —'}</div>
                    </div>
                    <div className="text-xs muted text-center mt-8">Cuando el vendedor confirme con tu PIN, el paso avanza solo.</div>
                    <BusyButton className="btn btn-ghost btn-sm btn-block mt-8" busyLabel="Avisando…" onClick={() => onNadie(pk.orderId, 'pickup')}><i className="fa-solid fa-user-slash"></i> Nadie me atendió</BusyButton>
                  </>}
              </>}
          </div>
        ))}
      </>)}

      {/* ETAPA ENTREGA */}
      {allPicked && (<>
        <div className="float-notif mb-16" style={{ borderColor: 'rgba(34,197,94,0.5)' }}><i className="fa-solid fa-check text-green"></i><span className="text-sm subtle"><b>Todo retirado.</b> Llevá las piezas al taller y cerrá con el PIN del mecánico.</span></div>
        <div className="card mb-12" style={{ background: 'var(--bg-2)', padding: 14 }}>
          <div className="text-xs muted mb-4"><i className="fa-solid fa-boxes-stacked"></i> Llevás</div>
          {t.pickups.flatMap((p) => p.items).map((it) => <div key={it.orderId} className="flex-center gap-8" style={{ padding: '1px 0' }}><i className="fa-solid fa-circle text-purple" style={{ fontSize: 5 }}></i><span className="text-sm">{it.label}</span></div>)}
        </div>
        <div className="card mb-12" style={{ background: 'var(--bg-2)', padding: 14 }}>
          <div className="rep-point">
            <div className="ic" style={{ background: 'rgba(109,40,217,0.16)', color: 'var(--purple-light)' }}><i className="fa-solid fa-screwdriver-wrench"></i></div>
            <div style={{ flex: 1, minWidth: 0 }}><div className="text-xs muted">Entregar en</div><div className="text-sm" style={{ fontWeight: 700 }}>{t.dropoff?.name || '—'}</div><div className="text-xs muted">{t.dropoff?.address ? `${t.dropoff.address}${t.dropoff.barrio ? ' · ' + t.dropoff.barrio : ''}` : 'Sin dirección'}</div></div>
          </div>
        </div>
        <a className="btn btn-ghost btn-block" href={mapsUrl(t.dropoff)} target="_blank" rel="noopener"><i className="fa-solid fa-location-arrow"></i> Cómo llegar al taller</a>
        {!t.arrivedDrop
          ? <BusyButton className="btn btn-primary btn-block mt-12" busyLabel="Avisando…" onClick={() => onLlegue(t.orderIds[0], 'drop')}><i className="fa-solid fa-location-dot"></i> Llegué al taller</BusyButton>
          : <>
            <EntregaPin onConfirm={(pin) => onEntregar(t, pin)} />
            <BusyButton className="btn btn-ghost btn-sm btn-block mt-12" busyLabel="Avisando…" onClick={() => onNadie(t.orderIds[0], 'drop')}><i className="fa-solid fa-user-slash"></i> Nadie me atendió</BusyButton>
          </>}
      </>)}
    </div>
  );
}

function DispCard({ t, disabled, busy, onTomar }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="flex-between mb-12" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div className="flex-center gap-12" style={{ minWidth: 0 }}>
          <div className="store-avatar" style={{ background: 'rgba(250,204,21,0.14)', color: 'var(--yellow)' }}><i className={`fa-solid fa-${vehIcon(t.veh)}`}></i></div>
          <div style={{ minWidth: 0 }}><div className="text-sm" style={{ fontWeight: 800 }}>{t.veh}</div><div className="text-xs muted">{t.plate || ''}{t.plate ? ' · ' : ''}{t.itemsCount} pieza{t.itemsCount === 1 ? '' : 's'} · {t.pickups.length} {t.pickups.length === 1 ? 'comercio' : 'comercios'}</div></div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>{t.freight ? <div className="text-yellow" style={{ fontSize: 20, fontWeight: 800 }}>{money(t.freight)}</div> : null}{t.distStr && <div className="text-xs muted">{t.distStr}</div>}</div>
      </div>
      {t.pickups.length > 1 && <div className="float-notif mb-12" style={{ padding: '8px 12px' }}><i className="fa-solid fa-layer-group text-purple"></i><span className="text-xs subtle">Viaje consolidado: {t.pickups.length} comercios en un solo recorrido.</span></div>}
      <div className="card mb-12" style={{ background: 'var(--bg-2)', padding: 12 }}>
        {t.pickups.map((pk, i) => (
          <div key={pk.storeId}>
            {i > 0 && <div className="rep-connector"></div>}
            <div className="rep-point"><div className="ic" style={{ background: 'rgba(250,204,21,0.14)', color: 'var(--yellow)' }}><i className="fa-solid fa-store"></i></div><div style={{ flex: 1, minWidth: 0 }}><div className="text-xs muted">{t.pickups.length > 1 ? `Retiro ${i + 1}` : 'Retiro'}</div><div className="text-sm" style={{ fontWeight: 700 }}>{pk.name || '—'}</div><div className="text-xs muted">{pk.address ? `${pk.address}${pk.barrio ? ' · ' + pk.barrio : ''}` : 'Sin dirección'}</div><div style={{ marginTop: 4 }}>{pk.items.map((it) => <div key={it.orderId} className="flex-center gap-8" style={{ padding: '1px 0' }}><i className="fa-solid fa-circle text-purple" style={{ fontSize: 5 }}></i><span className="text-xs">{it.label}</span></div>)}</div></div></div>
          </div>
        ))}
        <div className="rep-connector"></div>
        <div className="rep-point"><div className="ic" style={{ background: 'rgba(109,40,217,0.16)', color: 'var(--purple-light)' }}><i className="fa-solid fa-screwdriver-wrench"></i></div><div style={{ flex: 1, minWidth: 0 }}><div className="text-xs muted">Entrega</div><div className="text-sm" style={{ fontWeight: 700 }}>{t.dropoff?.name || '—'}</div><div className="text-xs muted">{t.dropoff?.address ? `${t.dropoff.address}${t.dropoff.barrio ? ' · ' + t.dropoff.barrio : ''}` : 'Sin dirección'}</div></div></div>
      </div>
      <button className="btn btn-yellow btn-lg btn-block" type="button" disabled={disabled} onClick={onTomar}>{busy ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Tomando…</> : <><i className="fa-solid fa-hand"></i> Tomar viaje</>}</button>
    </div>
  );
}

function EntregaPin({ onConfirm }) {
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false);
  async function confirmar() { if (sending) return; setSending(true); try { await onConfirm(pin); setPin(''); } finally { setSending(false); } }
  return (
    <div className="card mt-12" style={{ background: 'var(--bg-2)', padding: 16 }}>
      <div className="text-sm muted mb-8"><i className="fa-solid fa-key"></i> Pedile el PIN de entrega al mecánico</div>
      <div className="flex gap-12">
        <input className="input" inputMode="numeric" maxLength={4} placeholder="PIN" aria-label="PIN de entrega" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} style={{ maxWidth: 120, textAlign: 'center', letterSpacing: '0.2em', fontWeight: 800 }} />
        <button className="btn btn-success btn-block" disabled={pin.length !== 4 || sending} onClick={confirmar}>{sending ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Confirmando…</> : <><i className="fa-solid fa-check"></i> Confirmar entrega</>}</button>
      </div>
    </div>
  );
}

function RepPager({ total, page, pages, setPage }) {
  if (pages <= 1) return null;
  return (
    <div className="rep-pager">
      <span className="text-xs muted">{(page - 1) * PER + 1}–{Math.min(page * PER, total)} de {total}</span>
      <div className="flex gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm rep-pgbtn" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}><i className="fa-solid fa-chevron-left"></i></button>
        <span className="text-sm muted" style={{ padding: '0 4px' }}>{page} / {pages}</span>
        <button className="btn btn-ghost btn-sm rep-pgbtn" onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages}><i className="fa-solid fa-chevron-right"></i></button>
      </div>
    </div>
  );
}
