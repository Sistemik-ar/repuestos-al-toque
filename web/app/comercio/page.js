'use client';
import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast, ping, tierFor, fmtDateTime } from '@/lib/ui';
import { usePoll, keep } from '@/lib/usePoll';
import { useTitleBell } from '@/lib/useTitleBell';
import { getMe, getOpenRequestsForStore, getStoreSales, createQuote, getStoreCreditRequests, storeActOnCredit, storeConfirmPickup, getMyReputation, markCreditSettled } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';
import { uploadPhoto } from '@/lib/upload';
import { data } from '@/lib/data';
import Loading from '@/components/Loading';
import PushButton from '@/components/PushButton';
import FontScale from '@/components/FontScale';

export default function Comercio() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState([]);
  const [sales, setSales] = useState([]);
  const [tab, setTab] = useState('pend');
  const [modal, setModal] = useState(null);
  const [dismissed, setDismissed] = useState([]);
  const [zoom, setZoom] = useState(null);
  const [detalle, setDetalle] = useState(null); // pedido cuyo detalle se ve en el modal
  const [rep, setRep] = useState(null);
  const [loaded, setLoaded] = useState(false); // primer fetch completado (evita parpadeo del empty state)
  // la insignia sale de los PUNTOS reales (ventas concretadas), no del mock
  const badge = tierFor('store', rep?.points ?? 0);

  const arrivalsRef = useRef(null); // para avisar UNA vez cuando llega el repartidor
  const load = async () => {
    // la reputación es un badge secundario: va FUERA del Promise.all crítico para que su
    // fallo (o presión del pool) no congele el refresco de solicitudes/ventas.
    getMyReputation().then((r) => r && setRep((p) => keep(p, r))).catch(() => {});
    try {
      const [m, o, s] = await Promise.all([getMe(), getOpenRequestsForStore(), getStoreSales()]);
      setMe((p) => keep(p, m || null));
      setOpen((p) => keep(p, o || []));
      setSales((p) => keep(p, s || []));
      setLoaded(true);
      // aviso emergente: el repartidor llegó al local (transición de estado)
      const ahora = new Set((s || []).filter((x) => x.orderStatus === 'PAID' && x.arrivedPickup).map((x) => x.orderId));
      if (arrivalsRef.current) {
        for (const x of s || []) {
          if (ahora.has(x.orderId) && !arrivalsRef.current.has(x.orderId)) {
            ping(3); // sonido insistente + vibración: el repartidor está esperando en el local
            toast({ title: '🛵 ¡Llegó el repartidor!', sub: `Está en tu local por «${x.desc || x.catLabel}» — pedile su PIN y confirmá el retiro (pestaña Concretadas)`, icon: 'fa-location-dot', type: 'yellow', duration: 20000 });
          }
        }
      }
      arrivalsRef.current = ahora;
    } catch {} // si una action falla (red/DB), conservamos el último estado válido
  };
  usePoll(load, 4000);

  // Navegabilidad: persistir la pestaña activa para no resetear a "Pendientes" al volver/recargar.
  useEffect(() => { const t = sessionStorage.getItem('rat_comercio_tab'); if (t) setTab(t); }, []);
  useEffect(() => { try { sessionStorage.setItem('rat_comercio_tab', tab); } catch {} }, [tab]);

  // pendientes: cotizable mientras el pedido siga abierto (el contador NO vence el pedido).
  // Orden: el más antiguo primero (es el que espera hace más); urgente desempata.
  const windowOpen = (r) => ['OPEN', 'QUOTED'].includes(r.status);
  const pend = open
    .filter((r) => r.myCount === 0 && windowOpen(r) && !dismissed.includes(r.id))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || (a.urgency === 'Necesito ahora' ? -1 : 1));
  const cot = open.filter((r) => r.myCount > 0);
  useTitleBell(pend.length, 'Comercio · RepuestosAlToque'); // campanita en el tab si hay pedidos nuevos para cotizar
  // "esperando decisión": vivas (ventana cerrada hace <24hs) vs zombies "sin respuesta"
  const ZOMBIE_MS = 24 * 60 * 60 * 1000;
  const esperando = cot.filter((r) => ['OPEN', 'QUOTED'].includes(r.status));
  const vivas = esperando.filter((r) => !r.windowEndsAt || Date.now() - r.windowEndsAt < ZOMBIE_MS).sort((a, b) => b.createdAt - a.createdAt);
  const sinRespuesta = esperando.filter((r) => r.windowEndsAt && Date.now() - r.windowEndsAt >= ZOMBIE_MS).sort((a, b) => b.createdAt - a.createdAt);
  const cotBadge = (r) => {
    if (r.status === 'CANCELLED') return ['badge-red', 'fa-ban', 'Cancelado · no pagó'];
    if (r.status === 'CLOSED') return r.mySelected ? ['badge-yellow', 'fa-clock', 'Pendiente de pago'] : ['badge-gray', 'fa-circle-xmark', 'No elegida'];
    return ['badge-purple', 'fa-hourglass-half', 'Esperando decisión'];
  };
  // tiempos legibles para las tarjetas del comerciante
  const timeAgo = (ts) => {
    if (!ts) return '';
    const s = (Date.now() - ts) / 1000;
    if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    const d = Math.round(s / 86400);
    return `hace ${d} día${d === 1 ? '' : 's'}`;
  };
  const venceEn = (selectedAt) => {
    const ms = (selectedAt || 0) + 24 * 3600 * 1000 - Date.now();
    if (ms <= 0) return 'Vence ya';
    const h = Math.floor(ms / 3600000), mn = Math.floor((ms % 3600000) / 60000);
    return `Vence en ${h} h ${mn} m`;
  };
  const initials = (me?.name || 'RC').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const label = (r) => r.desc || r.catLabel || 'Repuesto';
  const veh = (r) => `${r.brand || ''} ${r.model || ''} ${r.year || ''}`.trim() + (r.engine ? ` · ${r.engine}` : '');

  async function sendQuote(payload) {
    const res = await createQuote(modal.id, payload);
    setModal(null);
    if (res?.error) { toast({ title: res.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
    ping(); toast({ title: 'Cotización enviada', sub: 'El mecánico ya la puede ver y elegir', icon: 'fa-paper-plane', type: 'green' });
    load();
  }
  async function logout() { await logoutAction(); router.push('/login'); }

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/comercio" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Panel Comercio</span></Link>
        <div className="topbar-actions">
          <FontScale />
          <Link href="/comercio/perfil" className="icon-btn" title="Mi perfil"><i className="fa-solid fa-user"></i></Link>
          <button className="icon-btn" onClick={logout} title="Salir"><i className="fa-solid fa-right-from-bracket"></i></button>
          <Link href="/comercio/perfil" className="avatar" style={{ background: 'linear-gradient(135deg,var(--yellow),var(--purple))', textDecoration: 'none' }}>{initials}</Link>
        </div>
      </div>

      <div className="container">
        <div className="mb-16"><div className="eyebrow">{me?.name || 'Comercio'}</div><h1 className="h-lg">Solicitudes entrantes</h1><p className="text-sm muted">Respondé rápido = ganás la venta</p></div>
        <div className="mb-16"><PushButton /></div>

        <div className="card glow mb-16" style={{ background: 'linear-gradient(135deg,rgba(250,204,21,0.16),rgba(31,41,55,0.6))' }}>
          <div className="flex-between mb-12">
            <div className="flex-center gap-12">
              <div className="avatar" style={{ width: 46, height: 46, fontSize: 16, background: 'linear-gradient(135deg,var(--yellow),var(--purple))' }}>{initials}</div>
              <div><div style={{ fontWeight: 800 }}>{me?.name || 'Comercio'}</div><div className="mt-4"><span className={`rep-badge ${badge.cls}`}><i className={`fa-solid ${badge.icon}`}></i> {badge.label}</span></div></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="text-xs muted">Puntos</div><div className="h-md text-yellow">{(rep?.points ?? 0).toLocaleString('es-AR')}</div>
              <div className="text-xs muted mt-4">{rep?.rating != null ? <><i className="fa-solid fa-star text-yellow"></i> {rep.rating} ({rep.count} {rep.count === 1 ? 'reseña' : 'reseñas'})</> : 'Sin reseñas aún'}</div>
            </div>
          </div>
          <div className="rep-stats card" style={{ background: 'var(--bg-1)', padding: 12 }}>
            <div><div className="v">{pend.length}</div><div className="l">Solicitudes</div></div>
            <div><div className="v">{cot.length}</div><div className="l">Cotizadas</div></div>
            <div><div className="v text-green">{sales.length}</div><div className="l">Concretadas</div></div>
          </div>
        </div>

        <CreditRequestsStore />

        {/* Por cobrar: quién le debe plata al vendedor (con detalle de cuenta corriente) */}
        {sales.length > 0 && <PorCobrar sales={sales} onChanged={load} />}

        <div className="pill-tabs mb-16">
          <button className={tab === 'pend' ? 'active' : ''} onClick={() => setTab('pend')}>Pendientes <span className="badge badge-yellow" style={{ marginLeft: 4 }}>{pend.length}</span></button>
          <button className={tab === 'cot' ? 'active' : ''} onClick={() => setTab('cot')}>Cotizadas {cot.length > 0 && <span className="badge badge-gray" style={{ marginLeft: 4 }}>{cot.length}</span>}</button>
          <button className={tab === 'ent' ? 'active' : ''} onClick={() => setTab('ent')}>Concretadas {sales.length > 0 && <span className="badge badge-green" style={{ marginLeft: 4 }}>{sales.length}</span>}</button>
        </div>

        {tab === 'pend' && (!loaded ? <Loading label="Cargando solicitudes…" /> : pend.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-inbox"></i></div><div className="text-sm">Sin solicitudes pendientes</div><div className="text-xs">Cuando un mecánico pida un repuesto, aparece acá</div></div>
        ) : <div className="cards-grid">{pend.map((r) => (
          <div className="card mb-12" key={r.id}>
            <div className="flex-between mb-12">
              <div className="flex-center gap-12"><div className="store-avatar" style={r.urgency === 'Necesito ahora' ? { background: 'rgba(239,68,68,0.16)', color: '#FCA5A5' } : {}}><i className="fa-solid fa-bolt"></i></div><div><div className="text-sm" style={{ fontWeight: 700 }}>{label(r)}</div><div className="text-xs muted">{veh(r)} · {r.catLabel}</div></div></div>
              <span className="badge badge-gray">#{r.code}</span>
            </div>
            <div className="flex-between mb-12">
              <div className="flex-center gap-8" style={{ flexWrap: 'wrap' }}>
                {r.plate && <span className="badge badge-purple"><i className="fa-solid fa-car-side"></i> {r.plate}</span>}
                <span className="badge badge-gray"><i className="fa-solid fa-layer-group"></i> {r.catLabel}</span>
                <span className="badge badge-gray"><i className="fa-solid fa-file-invoice"></i> {r.invoiceType === 'factura_a' ? 'Factura A' : 'Cons. Final'}</span>
                {r.urgency === 'Necesito ahora' && <span className="badge badge-red"><i className="fa-solid fa-bolt"></i> Urgente</span>}
              </div>
              {r.photoUrls?.length > 0 && <span className="badge badge-purple"><i className="fa-solid fa-image"></i> {r.photoUrls.length} foto(s)</span>}
            </div>
            {r.invoiceType === 'factura_a' && (
              <div className="float-notif mb-12" style={{ padding: '10px 12px' }}><i className="fa-solid fa-file-invoice text-yellow"></i><div className="text-xs subtle"><b>Factura A</b> a nombre de: {r.solicRazon || '—'} {r.solicCuit ? `(CUIT ${r.solicCuit})` : ''}. Emitís vos con tu CUIT.</div></div>
            )}
            {r.photoUrls?.length > 0 && <div className="flex gap-8 mb-12">{r.photoUrls.map((u, i) => <img key={i} src={u} alt="" onClick={() => setZoom(u)} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'zoom-in' }} />)}</div>}
            <div className="text-xs muted mb-12"><i className="fa-regular fa-clock"></i> {fmtDateTime(r.createdAt)}</div>
            <div className="locked-info mb-12"><i className="fa-solid fa-user-secret"></i> Mecánico anónimo hasta concretar</div>
            <button className="btn btn-ghost btn-sm btn-block mb-8" onClick={() => setDetalle(r)}><i className="fa-solid fa-circle-info"></i> Ver detalle</button>
            <div className="flex gap-12">
              <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto' }} onClick={() => { setDismissed((d) => [...d, r.id]); toast({ title: 'Marcado sin stock', sub: 'No penaliza tu balance', icon: 'fa-ban', type: 'purple' }); }}><i className="fa-solid fa-ban"></i> Sin stock</button>
              <button className="btn btn-yellow btn-block" onClick={() => setModal(r)}><i className="fa-solid fa-tag"></i> Cotizar</button>
            </div>
          </div>
        ))}</div>)}

        {tab === 'cot' && (!loaded ? <Loading label="Cargando tus cotizaciones…" /> : cot.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-tags"></i></div><div className="text-sm">Todavía no cotizaste nada</div></div>
        ) : (
          // agrupado por estado; cada grupo con el orden que le sirve al comerciante
          [
            { titulo: 'Esperando decisión', icon: 'fa-hourglass-half', sub: 'Más nuevas primero — son las que tienen chance real de convertir.', rows: vivas },
            { titulo: 'Pendiente de pago', icon: 'fa-stopwatch', sub: 'El mecánico ya eligió tu cotización — tiene 24 hs para pagar. La que vence antes, primero.', rows: cot.filter((r) => r.status === 'CLOSED' && r.mySelected).sort((a, b) => (a.selectedAt || 0) - (b.selectedAt || 0)) },
            { titulo: 'Sin respuesta', icon: 'fa-moon', banner: 'Ventana cerrada hace más de 24 hs y el mecánico no decidió. Siguen activas — todavía puede elegir — pero no compiten con las vivas.', rows: sinRespuesta },
            { titulo: 'No elegidas', icon: 'fa-circle-xmark', rows: cot.filter((r) => r.status === 'CLOSED' && !r.mySelected).sort((a, b) => b.createdAt - a.createdAt) },
            { titulo: 'Canceladas', icon: 'fa-ban', rows: cot.filter((r) => r.status === 'CANCELLED').sort((a, b) => b.createdAt - a.createdAt) },
          ].filter((g) => g.rows.length > 0).map((g) => (
            <div key={g.titulo} className="section">
              <div className="section-title"><h2><i className={`fa-solid ${g.icon} text-purple`} style={{ marginRight: 6 }}></i>{g.titulo}</h2><span className="text-xs muted">{g.rows.length}</span></div>
              {g.sub && <p className="text-xs muted mb-12" style={{ marginTop: -6 }}>{g.sub}</p>}
              {g.banner && <div className="float-notif mb-12" style={{ padding: '10px 12px' }}><i className="fa-solid fa-circle-info text-purple"></i><span className="text-xs subtle">{g.banner}</span></div>}
              <div className="cards-grid">{g.rows.map((r) => {
                const esPago = g.titulo === 'Pendiente de pago';
                const esZombie = g.titulo === 'Sin respuesta';
                const [bCls, bIcon, bTxt] = esZombie ? ['badge-gray', 'fa-moon', 'Sin respuesta'] : esPago ? ['badge-yellow', 'fa-stopwatch', venceEn(r.selectedAt)] : cotBadge(r);
                return (
                  <div className="card mb-12" key={r.id} style={r.status === 'CANCELLED' || esZombie ? { opacity: 0.6 } : esPago ? { borderColor: 'rgba(250,204,21,0.35)' } : {}}>
                    <div className="flex-between mb-8"><div><div className="text-sm" style={{ fontWeight: 700 }}>{label(r)}</div><div className="text-xs muted">{veh(r)} · {r.catLabel} · {r.myCount} {r.myCount === 1 ? 'opción' : 'opciones'}</div></div><span className={`badge ${bCls}`}><i className={`fa-solid ${bIcon}`}></i> {bTxt}</span></div>
                    {esPago ? (
                      <div className="flex-between text-sm mb-8"><span className="muted">Eligió tu precio</span><span className="text-yellow" style={{ fontWeight: 800 }}>{r.mySelectedPrice ? '$' + r.mySelectedPrice.toLocaleString('es-AR') : '—'}</span></div>
                    ) : (
                      <div className="flex-between text-sm mb-8"><span className="muted">Tus precios</span><span style={{ fontWeight: 700 }}>{(r.myPrices || []).map((p) => '$' + p.toLocaleString('es-AR')).join(' · ')}</span></div>
                    )}
                    <div className="text-xs muted mb-8"><i className="fa-regular fa-clock"></i> {esPago ? `eligió ${timeAgo(r.selectedAt)}` : timeAgo(r.createdAt)} · {fmtDateTime(esPago ? r.selectedAt : r.createdAt)}</div>
                    <button className="btn btn-ghost btn-block btn-sm mb-8" onClick={() => setDetalle(r)}><i className="fa-solid fa-circle-info"></i> Ver detalle</button>
                    {g.titulo === 'Esperando decisión' && r.myCount < 3 && <button className="btn btn-ghost btn-block btn-sm" onClick={() => setModal(r)}><i className="fa-solid fa-plus"></i> Agregar otra opción</button>}
                  </div>
                );
              })}</div>
            </div>
          ))
        ))}

        {tab === 'ent' && (!loaded ? <Loading label="Cargando tus ventas…" /> : sales.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-box"></i></div><div className="text-sm">Sin ventas concretadas todavía</div></div>
        ) : <div className="cards-grid">{sales.map((r) => <EntregaCard key={r.orderId} r={r} label={label(r)} veh={veh(r)} onChanged={load} onDetail={() => setDetalle(r)} />)}</div>)}
      </div>

      {modal && <CotizarModal lead={modal} label={label(modal)} veh={veh(modal)} onClose={() => setModal(null)} onSend={sendQuote} />}
      {detalle && <DetalleModal r={detalle} onClose={() => setDetalle(null)} />}
      {zoom && <div onClick={() => setZoom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 300, display: 'grid', placeItems: 'center', padding: 20, cursor: 'zoom-out' }}><img src={zoom} alt="" style={{ maxWidth: '92vw', maxHeight: '85vh', width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: 12 }} /></div>}
    </div>
  );
}

function DRow({ k, v }) {
  return <div className="flex-between" style={{ padding: '10px 0', borderTop: '1px solid var(--border)', gap: 12 }}><span className="text-sm" style={{ flexShrink: 0, color: '#fff' }}>{k}</span><span className="text-sm" style={{ fontWeight: 700, textAlign: 'right', color: '#fff' }}>{v}</span></div>;
}

// Detalle de un pedido (sirve para Pendientes, Cotizadas y Concretadas — muestra lo que haya).
function DetalleModal({ r, onClose }) {
  const [zoom, setZoom] = useState(null);
  const veh = `${r.brand || ''} ${r.model || ''} ${r.year || ''}`.trim();
  const isSale = !!r.orderId || !!r.orderStatus;
  const ESTADO = { PAID: r.hasDelivery ? 'Pagado · repartidor en camino' : 'Pagado · esperando repartidor', SHIPPED: 'Retirado · en camino al taller', DELIVERED: 'Entregado al mecánico', READY: 'Listo', REFUNDED: 'Reembolsado' };
  // estado de la cotización (cuando todavía no es venta concretada)
  const estadoCot = isSale ? null
    : r.status === 'CANCELLED' ? 'Cancelado — el mecánico no pagó'
    : r.status === 'CLOSED' ? (r.mySelected ? 'Esperando pago del mecánico' : 'No elegida')
    : r.myCount > 0 ? 'Esperando decisión del mecánico'
    : 'Pendiente — todavía no cotizaste';
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-handle"></div>
        <div className="flex-between mb-4"><h2 className="h-md">{r.desc || r.catLabel || 'Repuesto'}</h2>{r.code && <span className="badge badge-gray">#{r.code}</span>}</div>
        <p className="text-sm muted mb-16">{veh || 'Vehículo'}{r.plate ? ` · Patente ${r.plate}` : ''}{r.catLabel ? ` · ${r.catLabel}` : ''}</p>

        <div className="card mb-12" style={{ background: 'var(--bg-1)', paddingTop: 0 }}>
          <DRow k="Repuesto" v={r.desc || r.catLabel || '—'} />
          <DRow k="Categoría" v={r.catLabel || '—'} />
          <DRow k="Vehículo" v={veh || '—'} />
          <DRow k="Motorización" v={r.engine || 'No especificado'} />
          {r.vin && <DRow k="VIN / Chasis" v={r.vin} />}
          <DRow k="Urgencia" v={r.urgency || '—'} />
          <DRow k="Fecha del pedido" v={fmtDateTime(r.createdAt)} />
          <DRow k="Factura" v={r.invoiceType === 'factura_a' ? 'Factura A' : 'Consumidor Final'} />
          {r.invoiceType === 'factura_a' && <DRow k="A nombre de" v={`${r.solicRazon || '—'}${r.solicCuit ? ` · CUIT ${r.solicCuit}` : ''}`} />}
        </div>

        {estadoCot && (
          <div className="card mb-12" style={{ background: 'var(--bg-1)', paddingTop: 0 }}>
            <DRow k="Estado" v={estadoCot} />
            {r.mySelected && r.mySelectedPrice ? <DRow k="Precio elegido" v={'$' + r.mySelectedPrice.toLocaleString('es-AR')} /> : null}
          </div>
        )}

        {isSale && (
          <div className="card mb-12" style={{ background: 'var(--bg-1)', paddingTop: 0 }}>
            <DRow k="Mecánico" v={r.mechanicName || '—'} />
            <DRow k="Fecha de venta" v={fmtDateTime(r.soldAt)} />
            <DRow k="Monto de la venta" v={r.part ? '$' + r.part.toLocaleString('es-AR') : '—'} />
            <DRow k="Estado" v={ESTADO[r.orderStatus] || r.orderStatus || '—'} />
            {r.creditAccount && <DRow k="Cuenta corriente" v={r.creditSettledAt ? 'Sí · cobrada' : 'Sí · pendiente de pago'} />}
            {r.issue && <DRow k="Incidencia" v={r.issue} />}
          </div>
        )}

        {r.photoUrls?.length > 0 && (
          <div className="mb-12">
            <div className="text-xs muted mb-8">Fotos <span className="muted">(tocá para agrandar)</span></div>
            <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>{r.photoUrls.map((u, i) => <img key={i} src={u} alt="" onClick={() => setZoom(u)} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', cursor: 'zoom-in' }} />)}</div>
          </div>
        )}

        <button className="btn btn-ghost btn-block" onClick={onClose}>Cerrar</button>
      </div>
      {zoom && <div onClick={() => setZoom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 500, display: 'grid', placeItems: 'center', padding: 20, cursor: 'zoom-out' }}><img src={zoom} alt="" style={{ maxWidth: '92vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12 }} /></div>}
    </div>
  );
}

function PorCobrar({ sales, onChanged }) {
  const plataforma = sales.filter((r) => !r.creditAccount);
  const cc = sales.filter((r) => r.creditAccount);
  const sum = (xs) => xs.reduce((a, r) => a + (r.part || 0), 0);
  const pendientes = cc.filter((r) => !r.creditSettledAt);

  async function marcar(r, on) {
    const res = await markCreditSettled(r.orderId, on);
    if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
    toast({ title: on ? 'Cuenta corriente cobrada' : 'Vuelta a pendiente de pago', icon: on ? 'fa-check' : 'fa-rotate-left', type: 'green' });
    onChanged?.();
  }

  return (
    <div className="card mb-16">
      <div className="section-title"><h2>Por cobrar</h2></div>
      <div className="flex-between mb-8">
        <span className="text-sm subtle"><i className="fa-solid fa-building-columns text-purple"></i> Te liquida RepuestosAlToque</span>
        <span className="text-sm" style={{ fontWeight: 800 }}>{'$' + sum(plataforma).toLocaleString('es-AR')} <span className="text-xs muted">({plataforma.length} venta{plataforma.length === 1 ? '' : 's'})</span></span>
      </div>
      {cc.length > 0 && (
        <>
          <div className="flex-between mb-8">
            <span className="text-sm subtle"><i className="fa-solid fa-id-card-clip text-yellow"></i> En cuenta corriente (te debe el taller)</span>
            <span className="text-sm" style={{ fontWeight: 800 }}>{'$' + sum(cc).toLocaleString('es-AR')} <span className="text-xs muted">({pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'} de pago)</span></span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Producto</th><th>Fecha</th><th>Mecánico</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {cc.map((r) => (
                  <tr key={r.orderId} style={r.creditSettledAt ? { opacity: 0.55 } : {}}>
                    <td className="text-xs">{r.desc || r.catLabel || 'Repuesto'}{r.desc && r.catLabel ? <span className="muted"> · {r.catLabel}</span> : null}</td>
                    <td className="text-xs">{fmtDateTime(r.soldAt)}</td>
                    <td className="text-xs">{r.mechanicName}</td>
                    <td className="text-xs" style={{ fontWeight: 800 }}>{r.part ? '$' + r.part.toLocaleString('es-AR') : '—'}</td>
                    <td>{r.creditSettledAt
                      ? <span className="badge badge-green"><i className="fa-solid fa-circle-check"></i> Cobrada</span>
                      : <span className="badge badge-yellow"><i className="fa-solid fa-clock"></i> Pendiente de pago</span>}</td>
                    <td>{r.creditSettledAt
                      ? <button className="btn btn-ghost btn-sm" onClick={() => marcar(r, false)} title="Volver a pendiente de pago"><i className="fa-solid fa-rotate-left"></i> Deshacer</button>
                      : <button className="btn btn-yellow btn-sm" onClick={() => { if (window.confirm(`¿El mecánico ${r.mechanicName} ya te pagó esta cuenta corriente?\n\n${r.desc || r.catLabel || 'Repuesto'} · ${r.part ? '$' + r.part.toLocaleString('es-AR') : ''}`)) marcar(r, true); }}><i className="fa-solid fa-hand-holding-dollar"></i> Marcar cobrada</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="text-xs muted mt-8">Las ventas por plataforma te las liquida RepuestosAlToque (semanal). Las de cuenta corriente se las cobrás vos al taller — marcalas cuando las proceses internamente.</div>
    </div>
  );
}

function EntregaCard({ r, label, veh, onChanged, onDetail }) {
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false); // evita doble-confirmación + da feedback
  async function confirmar() {
    if (sending) return;
    setSending(true);
    try {
      const res = await storeConfirmPickup(r.orderId, pin);
      setPin('');
      if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
      toast({ title: 'Retiro confirmado', sub: 'La pieza va en camino al taller', icon: 'fa-truck-fast', type: 'green' });
      onChanged?.();
    } finally { setSending(false); }
  }
  return (
    <div className="card mb-12">
      <div className="flex-between mb-8">
        <div><div className="text-sm" style={{ fontWeight: 700 }}>{label}</div><div className="text-xs muted">{veh}</div></div>
        <div className="flex-center gap-8" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {r.creditAccount && <span className="badge badge-yellow"><i className="fa-solid fa-id-card-clip"></i> Cta. corriente{r.creditSettledAt ? ' · cobrada' : ''}</span>}
          <span className="badge badge-green"><i className="fa-solid fa-check"></i> Pagado</span>
        </div>
      </div>
      <div className="flex-between mb-12">
        <span className="text-sm muted">Venta <b className="text-green">{r.part ? '$' + r.part.toLocaleString('es-AR') : ''}</b></span>
        {r.orderStatus === 'SHIPPED' && <span className="badge badge-yellow"><i className="fa-solid fa-truck-fast"></i> Retirado · en camino al taller</span>}
        {r.orderStatus === 'DELIVERED' && <span className="badge badge-green"><i className="fa-solid fa-box-open"></i> Entregado al mecánico</span>}
        {r.orderStatus === 'PAID' && !r.hasDelivery && <span className="badge badge-gray"><i className="fa-solid fa-clock"></i> Esperando repartidor</span>}
        {r.orderStatus === 'PAID' && r.hasDelivery && <span className="badge badge-yellow"><i className="fa-solid fa-motorcycle"></i> Repartidor en camino a tu local</span>}
      </div>
      <div className="text-xs muted mb-12"><i className="fa-regular fa-clock"></i> {fmtDateTime(r.soldAt)}</div>
      {r.issue && <div className="float-notif mb-12" style={{ padding: '8px 12px', borderColor: 'rgba(239,68,68,0.4)' }}><i className="fa-solid fa-flag text-red"></i><span className="text-xs subtle"><b>Incidencia:</b> {r.issue}</span></div>}
      {r.orderStatus === 'PAID' && r.hasDelivery && (
        <div>
          {r.arrivedPickup
            ? <div className="float-notif mb-8" style={{ padding: '8px 12px', borderColor: 'rgba(250,204,21,0.45)' }}><i className="fa-solid fa-location-dot text-yellow"></i><span className="text-xs subtle"><b>El repartidor está en tu local</b> — pedile su PIN y confirmá el retiro</span></div>
            : <div className="text-xs muted mb-8"><i className="fa-solid fa-key"></i> Cuando venga el repartidor, pedile su PIN y confirmá el retiro</div>}
          <div className="flex gap-12">
            <input className="input" inputMode="numeric" maxLength={4} placeholder="PIN" aria-label="PIN de retiro que te muestra el repartidor" value={pin} onChange={(e) => setPin(e.target.value)} style={{ maxWidth: 110, textAlign: 'center', letterSpacing: '0.2em', fontWeight: 800 }} />
            <button className="btn btn-yellow btn-block" disabled={pin.length !== 4 || sending} onClick={confirmar}>{sending ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Confirmando…</> : <><i className="fa-solid fa-box"></i> Confirmar retiro</>}</button>
          </div>
        </div>
      )}
      <button className="btn btn-ghost btn-sm btn-block mt-8" onClick={onDetail}><i className="fa-solid fa-circle-info"></i> Ver detalle</button>
    </div>
  );
}

function CreditRequestsStore() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const load = async () => { try { const r = await getStoreCreditRequests(); setRows((p) => keep(p, r || [])); } catch {} };
  usePoll(load, 6000);
  if (!rows || rows.length === 0) return null;
  const pend = rows.filter((r) => r.storeStatus === 'PENDING');
  async function act(r, approve) {
    setBusy(r.id);
    await storeActOnCredit(r.id, approve);
    toast({ title: approve ? 'Cuenta corriente aprobada' : 'Solicitud rechazada', icon: approve ? 'fa-check' : 'fa-ban', type: approve ? 'green' : 'purple' });
    await load(); setBusy(null);
  }
  return (
    <div className="card mb-16">
      <div className="section-title"><h2>Solicitudes de Cuenta Corriente</h2>{pend.length > 0 && <span className="badge badge-yellow">{pend.length}</span>}</div>
      {rows.map((r) => (
        <div className="flex-between mb-12" key={r.id}>
          <div className="flex-center gap-12"><div className="store-avatar"><i className="fa-solid fa-screwdriver-wrench"></i></div><div><div className="text-sm" style={{ fontWeight: 700 }}>{r.mechanicName}</div><div className="text-xs muted">Solicita operar con cuenta corriente</div></div></div>
          {r.storeStatus === 'PENDING'
            ? <div className="flex gap-8"><button className="btn btn-success btn-sm" disabled={busy === r.id} onClick={() => act(r, true)}>{busy === r.id ? <span className="spinner" style={{ width: 14, height: 14 }}></span> : 'Aprobar'}</button><button className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => act(r, false)}>Rechazar</button></div>
            : <span className={`badge ${r.storeStatus === 'APPROVED' ? 'badge-green' : 'badge-red'}`}>{r.storeStatus === 'APPROVED' ? 'Aprobada' : 'Rechazada'}</span>}
        </div>
      ))}
    </div>
  );
}

function CotizarModal({ lead, label, veh, onClose, onSend }) {
  const [price, setPrice] = useState('');
  const [sending, setSending] = useState(false); // evita doble-envío mientras el request está en vuelo
  const [brand, setBrand] = useState(data.partBrands[0]);
  const [brandOther, setBrandOther] = useState('');
  const [opcion, setOpcion] = useState('Original / OEM');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  async function onPick(e) {
    const files = [...e.target.files].slice(0, 3 - photos.length);
    e.target.value = '';
    setUploading(true);
    for (const f of files) {
      try { const url = await uploadPhoto(f, 'cotizaciones'); setPhotos((p) => (p.length < 3 ? [...p, url] : p)); } catch (err) { toast({ title: 'No se pudo subir', icon: 'fa-triangle-exclamation', type: 'yellow' }); }
    }
    setUploading(false);
  }

  // Evita perder el borrador por un toque accidental (sobre todo en mobile): si hay algo cargado,
  // confirma antes de cerrar; y si una foto se está subiendo, no deja cerrar.
  function tryClose() {
    if (uploading) { toast({ title: 'Esperá un toque', sub: 'Se está subiendo la foto…', icon: 'fa-spinner', type: 'yellow' }); return; }
    const dirty = !!(String(price).trim() || photos.length || String(note).trim());
    if (dirty && !window.confirm('¿Descartar esta cotización? Vas a perder el precio y las fotos que cargaste.')) return;
    onClose();
  }

  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) tryClose(); }}>
      <div className="modal">
        <div className="modal-handle"></div>
        <h2 className="h-md mb-4">Enviar cotización{lead.myCount > 0 ? ` · opción ${lead.myCount + 1}` : ''}</h2>
        <p className="text-sm muted mb-16">{label} · {veh}{lead.myCount > 0 ? ' · podés ofrecer otra alternativa' : ''}</p>
        {lead.plate && <div className="float-notif mb-16" style={{ padding: '10px 12px' }}><i className="fa-solid fa-car-side text-yellow"></i><div className="text-sm subtle">Patente del vehículo: <b>{lead.plate}</b></div></div>}
        <div className="field"><label>Precio final</label><input className="input" inputMode="numeric" placeholder="$ 0" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div className="grid-2">
          <div className="field"><label>Marca de la pieza</label>
            <select className="select" value={brand} onChange={(e) => setBrand(e.target.value)}>
              {data.partBrands.map((b) => <option key={b}>{b}</option>)}
              <option>Otra marca</option>
            </select>
            {brand === 'Otra marca' && <input className="input mt-8" placeholder="¿Qué marca?" value={brandOther} onChange={(e) => setBrandOther(e.target.value)} />}
          </div>
          <div className="field"><label>Tipo de opción</label><select className="select" value={opcion} onChange={(e) => setOpcion(e.target.value)}><option>Original / OEM</option><option>Alternativa</option><option>Usado</option><option>Reacondicionado</option></select></div>
        </div>
        <div className="field">
          <label>Fotos de la pieza <span className="muted">(hasta 3, opcional)</span></label>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPick} />
          <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
            {photos.map((src, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={src} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
                <button onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>✕</button>
              </div>
            ))}
            {photos.length < 3 && <button type="button" className="upload-area" style={{ width: 64, height: 64, padding: 0, display: 'grid', placeItems: 'center' }} onClick={() => fileRef.current?.click()}><i className={`fa-solid ${uploading ? 'fa-spinner fa-spin' : 'fa-camera'}`}></i></button>}
          </div>
        </div>
        <div className="field"><label>Notas <span className="muted">(opcional)</span></label><textarea className="textarea" maxLength={300} placeholder="Stock disponible, garantía…" value={note} onChange={(e) => setNote(e.target.value)}></textarea></div>
        <div className="flex gap-12">
          <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} disabled={sending} onClick={tryClose}>Cancelar</button>
          <button className="btn btn-yellow btn-block" disabled={!price || sending} onClick={async () => { setSending(true); try { await onSend({ price, partBrand: brand === 'Otra marca' ? (brandOther.trim() || 'Otra') : brand, optionLabel: opcion, note, photoUrls: photos }); } finally { setSending(false); } }}>{sending ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Enviando…</> : <><i className="fa-solid fa-paper-plane"></i> Enviar Cotización</>}</button>
        </div>
      </div>
    </div>
  );
}
