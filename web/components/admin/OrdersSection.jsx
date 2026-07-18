import { useState, useEffect, useMemo } from 'react';
import { money, fmtDateTime, toast } from '@/lib/ui';
import Loading from '@/components/Loading';
import { getRequestQuotes, getRequestTimeline, adminAdvanceInternalOrder } from '@/app/actions/data';
import { adminCancelUnpaidRequest } from '@/app/actions/admin-jobs';
import { useTable, Search, SortBar, Thead, Pager } from './table';

const ORDER_COLS = [
  { label: '#', key: 'code', type: 'str' },
  { label: 'Mecánico', key: 'mechanicName', type: 'str' },
  { label: 'Repuesto', key: 'label', type: 'str' },
  { label: 'Vehículo', key: 'vehicle', type: 'str' },
  { label: 'Total', key: 'total', type: 'num' },
  { label: 'Estado', key: 'status', type: 'str' },
  { label: 'Cotizaciones', key: 'quoteCount', type: 'num' },
  { label: 'Creado', key: 'created', type: 'num', date: true },
  { label: 'Concretada', key: 'concretada', type: 'num', date: true },
  { label: 'Línea de tiempo', key: 'tripRank', type: 'num' },
];

const ORDER_SEARCH = ['code', 'mechanicName', 'mechanicEmail', 'label', 'vehicle', 'status', 'total'];

// Estado del pedido legible + color (sobre el RequestStatus crudo).
const STATUS_ST = {
  OPEN: ['badge-gray', 'Abierto'],
  QUOTED: ['badge-purple', 'Cotizado'],
  CLOSED: ['badge-yellow', 'Elegido · sin pagar'],
  PAID: ['badge-green', 'Pagado'],
  SHIPPED: ['badge-yellow', 'En camino'],
  DELIVERED: ['badge-green', 'Entregado'],
  CANCELLED: ['badge-red', 'Cancelado'],
  EXPIRED: ['badge-gray', 'Vencido'],
};
const StatusBadge = ({ status }) => { const [c, l] = STATUS_ST[status] || ['badge-gray', status]; return <span className={`badge ${c}`}>{l}</span>; };
// "tiempo de respuesta" legible (minutos -> min/h/días)
const fmtDelta = (min) => (min == null ? '' : min < 1 ? 'al toque' : min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`);

// Estados que el admin todavía puede dar de baja: nadie pagó, así que no hay plata que devolver.
const CANCELABLE = ['OPEN', 'QUOTED', 'CLOSED', 'EXPIRED'];

// Filtro por estado del listado.
const ESTADO_TABS = [
  ['todos', 'Todos', null],
  ['activos', 'Activos', ['OPEN', 'QUOTED', 'CLOSED', 'EXPIRED']],
  ['curso', 'En curso', ['PAID', 'SHIPPED']],
  ['concretados', 'Concretados', ['DELIVERED']],
  ['cancelados', 'Cancelados', ['CANCELLED']],
];

function OrdersSection({ orders, loading, onReload }) {
  const [timelineReq, setTimelineReq] = useState(null);
  const [detail, setDetail] = useState(null); // pedido cuyo desglose (comisión/envío/MP) se muestra
  const [quotesReq, setQuotesReq] = useState(null); // pedido cuyas cotizaciones recibidas se muestran
  const [estado, setEstado] = useState('todos');
  const [advancing, setAdvancing] = useState(null); // orderId cuya coordinación interna se está avanzando
  const [cancelling, setCancelling] = useState(null); // pedido impago que se está dando de baja

  // Baja de un pedido SIN pagar: cancela el trabajo completo y desactiva el link de Mercado Pago.
  async function cancelar(o) {
    const msg = `¿Cancelar el pedido #${o.code}?\n\n${o.label}${o.vehicle ? ` · ${o.vehicle}` : ''}\n\n`
      + 'Se dan de baja todos los ítems del trabajo y el link de Mercado Pago deja de ser pagable. No se puede deshacer.';
    if (!window.confirm(msg)) return;
    setCancelling(o.id);
    const res = await adminCancelUnpaidRequest(o.id);
    setCancelling(null);
    if (res?.error) { toast({ title: res.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
    // el link solo se puede desactivar si el trabajo tenía uno generado; si MP rechazó la baja,
    // avisamos: el pago queda igualmente frenado del lado nuestro, pero conviene revisarlo.
    const sub = !res.hadLink ? 'No tenía link de pago generado'
      : res.linkDisabled ? 'El link de Mercado Pago quedó vencido'
      : 'Ojo: no se pudo vencer el link en Mercado Pago';
    toast({ title: `Pedido ${res.ref} cancelado`, sub, icon: 'fa-ban', type: res.hadLink && !res.linkDisabled ? 'yellow' : 'green' });
    onReload?.();
  }

  // Coordinación interna (zona sin delivery): el admin registra el movimiento (retirado/entregado).
  async function avanzar(o) {
    const next = o.orderStatus === 'PAID' ? '¿Registrar la pieza como RETIRADA del comercio?' : '¿Registrar la pieza como ENTREGADA al mecánico?';
    if (!window.confirm(`${next}\nPedido #${o.code} · ${o.label}`)) return;
    setAdvancing(o.orderId);
    const res = await adminAdvanceInternalOrder(o.orderId);
    setAdvancing(null);
    if (res?.error) { toast({ title: res.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
    toast({ title: res.status === 'SHIPPED' ? 'Retiro registrado' : 'Entrega registrada', sub: `#${o.code}`, icon: 'fa-truck-fast', type: 'green' });
    onReload?.();
  }
  const rows = useMemo(() => {
    const g = ESTADO_TABS.find(([k]) => k === estado)?.[2];
    return (orders || []).filter((o) => !g || g.includes(o.status)).map((o) => ({ ...o, tripRank: o.hasTrip ? 1 : 0, totalStr: o.total ? money(o.total) : '—' }));
  }, [orders, estado]);
  const t = useTable(rows, ORDER_COLS, ORDER_SEARCH, { key: 'created', dir: 'desc' });

  return (
    <div className="card">
      <div className="section-title"><h2>Últimos pedidos</h2><span className="text-xs muted">{t.total}</span></div>
      <div className="pill-tabs mb-12" style={{ flexWrap: 'wrap' }}>
        {ESTADO_TABS.map(([k, l]) => <button key={k} type="button" className={estado === k ? 'active' : ''} onClick={() => setEstado(k)}>{l}</button>)}
      </div>
      <Search value={t.query} onChange={t.setQuery} placeholder="Buscar mecánico, repuesto, vehículo o total…" />
      <SortBar sortUI={t.sortUI} />
      <div style={{ overflowX: 'auto' }}>
        <table className="table rat-table">
          <Thead headers={t.headers} />
          <tbody>
            {loading && <tr><td colSpan={10} className="muted" style={{ textAlign: 'center', padding: 16 }}>Cargando…</td></tr>}
            {!loading && t.total === 0 && <tr><td colSpan={10} className="muted" style={{ textAlign: 'center', padding: 16 }}>Sin resultados</td></tr>}
            {t.visible.map((o) => (
              <tr key={o.id}>
                <td data-label="#" className="text-xs">{o.code}</td>
                <td data-label="Mecánico">{o.mechanicName}{o.mechanicEmail && o.mechanicEmail !== o.mechanicName && <div className="text-xs muted">{o.mechanicEmail}</div>}</td>
                <td data-label="Repuesto">{o.label}</td>
                <td data-label="Vehículo">{o.vehicle}</td>
                <td data-label="Total">{o.total ? <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 10px' }} onClick={() => setDetail(o)} title="Ver desglose">{o.totalStr} <i className="fa-solid fa-circle-info" style={{ fontSize: 11, opacity: 0.6 }}></i></button> : <span className="muted">—</span>}</td>
                <td data-label="Estado">
                  <StatusBadge status={o.status} />
                  {o.internalFreight && <div className="mt-4"><span className="badge badge-yellow" title="Zona sin delivery: la entrega se coordina internamente"><i className="fa-solid fa-handshake"></i> Coordinación interna</span></div>}
                  {o.internalFreight && ['PAID', 'SHIPPED'].includes(o.orderStatus) && (
                    <div className="mt-4">
                      <button className="btn btn-yellow btn-sm" disabled={advancing === o.orderId} onClick={() => avanzar(o)}>
                        {advancing === o.orderId ? <span className="spinner" style={{ width: 14, height: 14 }}></span> : o.orderStatus === 'PAID' ? <><i className="fa-solid fa-box"></i> Registrar retiro</> : <><i className="fa-solid fa-circle-check"></i> Registrar entrega</>}
                      </button>
                    </div>
                  )}
                  {CANCELABLE.includes(o.status) && (
                    <div className="mt-4">
                      <button className="btn btn-danger btn-sm" disabled={cancelling === o.id} onClick={() => cancelar(o)} title="Cancelar el pedido y vencer el link de pago">
                        {cancelling === o.id ? <span className="spinner" style={{ width: 14, height: 14 }}></span> : <><i className="fa-solid fa-ban"></i> Cancelar</>}
                      </button>
                    </div>
                  )}
                </td>
                <td data-label="Cotizaciones">{(o.quoteCount > 0 || o.dismissCount > 0)
                  ? <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 10px' }} onClick={() => setQuotesReq(o)} title="Ver cotizaciones y respuestas"><i className="fa-solid fa-tags"></i> {o.quoteCount}{o.dismissCount > 0 && <span style={{ marginLeft: 7, color: '#FCA5A5' }} title={`${o.dismissCount} marcó sin stock`}><i className="fa-solid fa-ban" style={{ fontSize: 11 }}></i> {o.dismissCount}</span>}</button>
                  : <span className="muted">0</span>}</td>
                <td data-label="Creado" className="text-xs muted rat-th-date">{fmtDateTime(o.created)}</td>
                <td data-label="Concretada" className="text-xs muted rat-th-date">{fmtDateTime(o.concretada)}</td>
                <td data-label="Línea de tiempo"><button className="btn btn-ghost btn-sm" onClick={() => setTimelineReq(o)} title="Ver la línea de tiempo del pedido"><i className="fa-solid fa-timeline"></i> Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager pager={t.pager} />
      {timelineReq && <TimelineModal req={timelineReq} onClose={() => setTimelineReq(null)} />}
      {detail && <OrderBreakdownModal o={detail} onClose={() => setDetail(null)} />}
      {quotesReq && <RequestQuotesModal req={quotesReq} onClose={() => setQuotesReq(null)} />}
    </div>
  );
}

function OrderBreakdownModal({ o, onClose }) {
  const line = (icon, label, value, strong) => (
    <div className="flex-between" style={{ padding: '11px 0', borderBottom: strong ? 'none' : '1px solid var(--border)' }}>
      <span className="text-sm muted"><i className={`fa-solid ${icon}`} style={{ width: 18, marginRight: 8 }}></i>{label}</span>
      <span className="text-sm" style={{ fontWeight: strong ? 800 : 600 }}>{value}</span>
    </div>
  );
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-handle"></div>
        <div className="flex-between mb-4"><h2 className="h-md">Comprobante de pago</h2><button className="icon-btn" type="button" onClick={onClose} title="Cerrar"><i className="fa-solid fa-xmark"></i></button></div>
        <p className="text-sm muted mb-16">{o.code} · {o.label}{o.vehicle ? ` · ${o.vehicle}` : ''}</p>
        <div className="card mb-12" style={{ background: 'var(--bg-1)' }}>
          {line('fa-user', 'Mecánico', o.mechanicName || '—')}
          {line('fa-store', 'Vendido por', o.storeName || '—')}
          {line('fa-calendar-check', 'Pagado el', o.concretada ? fmtDateTime(o.concretada) : '—')}
          {line('fa-money-bill-wave', 'Medio de pago', o.creditAccount ? 'Cuenta corriente' : 'Mercado Pago', true)}
        </div>
        <div className="section-title"><h2 style={{ fontSize: 15 }}>Desglose</h2></div>
        <div className="card" style={{ background: 'var(--bg-1)' }}>
          {line('fa-box', 'Repuesto', money(o.part))}
          {line('fa-percent', `Comisión (${o.commissionPct != null ? o.commissionPct : '—'}%)`, money(o.commission))}
          {line('fa-truck-fast', 'Envío', money(o.freight))}
          {line('fa-credit-card', 'Recargo Mercado Pago', o.mpFee ? money(o.mpFee) : 'No aplicado')}
          {o.creditAccount && line('fa-id-card-clip', 'Cuenta corriente', 'Sí · repuesto no cobrado acá')}
          {line('fa-receipt', 'Total cobrado', money(o.total), true)}
        </div>
        <div className="section-title"><h2 style={{ fontSize: 15 }}>Cómo se divide (split MP)</h2></div>
        <div className="card" style={{ background: 'var(--bg-1)' }}>
          <div className="mp-split-row">
            <span className="ic store"><i className="fa-solid fa-store"></i></span>
            <div style={{ minWidth: 0 }}><div className="text-sm" style={{ fontWeight: 700 }}>{o.storeName || 'Comercio'}</div><div className="text-xs muted">a su cuenta de Mercado Pago</div></div>
            <span className="amt" style={{ color: '#4ADE80' }}>{money(o.creditAccount ? 0 : o.part)}</span>
          </div>
          <div className="mp-split-row">
            <span className="ic plat"><i className="fa-solid fa-gear"></i></span>
            <div style={{ minWidth: 0 }}><div className="text-sm" style={{ fontWeight: 700 }}>RepuestosAlToque</div><div className="text-xs muted">comisión + flete + recargo (marketplace_fee)</div></div>
            <span className="amt" style={{ color: 'var(--purple-light)' }}>{money(o.total - (o.creditAccount ? 0 : o.part))}</span>
          </div>
        </div>
        <div className="text-xs muted mt-8"><i className="fa-solid fa-circle-info"></i> Si el comercio tiene Mercado Pago conectado, el cobro se divide así automáticamente. Si no, entra centralizado (cuenta de la plataforma).</div>
        <div className="text-xs muted mt-8"><i className="fa-solid fa-circle-info"></i> Valores congelados al crearse el pedido. Cambiar la comisión/recargo en Ajustes solo afecta pedidos nuevos.</div>
      </div>
    </div>
  );
}

// Línea de tiempo completa del pedido: publicado -> cotizado -> elegido -> pagado -> ...reparto.
function TimelineModal({ req, onClose }) {
  const [tl, setTl] = useState(null);
  useEffect(() => { let alive = true; getRequestTimeline(req.id).then((r) => { if (alive) setTl(r || { events: [] }); }); return () => { alive = false; }; }, [req.id]);
  const ST = { PAID: ['badge-green', 'Pagado'], SHIPPED: ['badge-yellow', 'En camino'], DELIVERED: ['badge-green', 'Entregado'], DONE: ['badge-green', 'Entregado'], CANCELLED: ['badge-red', 'Cancelado'] };
  const stBadge = tl ? (ST[tl.status] || ['badge-gray', tl.status]) : null;
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-handle"></div>
        <div className="flex-between mb-4" style={{ gap: 10, alignItems: 'flex-start' }}>
          <h2 className="h-md" style={{ minWidth: 0 }}>Línea de tiempo</h2>
          <button className="icon-btn" type="button" onClick={onClose} title="Cerrar" style={{ flexShrink: 0 }}><i className="fa-solid fa-xmark"></i></button>
        </div>
        {!tl ? <Loading label="Cargando línea de tiempo…" /> : (
          <>
            <div className="flex-between mb-16" style={{ gap: 10, alignItems: 'flex-start' }}>
              <p className="text-sm muted" style={{ minWidth: 0 }}>{tl.code} · {tl.label}{tl.vehicle ? ` · ${tl.vehicle}` : ''}</p>
              {stBadge && <span className={`badge ${stBadge[0]}`} style={{ flexShrink: 0 }}>{stBadge[1]}</span>}
            </div>
            {tl.courier && (
              <div className="card mb-16" style={{ background: 'var(--bg-1)' }}>
                <div className="flex-center gap-12">
                  <div className="store-avatar"><i className="fa-solid fa-motorcycle"></i></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-sm" style={{ fontWeight: 700 }}>{tl.courier}</div>
                    {tl.plate && <div className="text-xs muted">Patente {tl.plate}</div>}
                  </div>
                </div>
                {tl.consolidated && (
                  <div className="float-notif mt-12" style={{ padding: '10px 12px' }}><i className="fa-solid fa-layer-group text-purple"></i><div className="text-xs subtle">Viaje <b>consolidado</b>: el repartidor retira piezas de más de un comercio en el mismo recorrido.</div></div>
                )}
              </div>
            )}
            <div className="timeline">
              {tl.events.map((e, i) => (
                <div key={i} className={`timeline-item ${e.state}`}>
                  <span className="dot"><i className={`fa-solid ${e.icon}`}></i></span>
                  <div className="t-title">{e.title}</div>
                  <div className="text-xs muted">{e.sub}</div>
                  <div className="t-time">{e.time ? fmtDateTime(e.time) : '—'}</div>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-block mt-16" type="button" onClick={onClose}>Cerrar</button>
          </>
        )}
      </div>
    </div>
  );
}

// Respuestas que recibió un pedido: las cotizaciones (comercio, precio, estado, cuándo) y los
// comercios que marcaron "sin stock".
function RequestQuotesModal({ req, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    getRequestQuotes(req.id).then((r) => { if (alive) setData(r || { quotes: [], dismissals: [] }); }).catch(() => { if (alive) setData({ quotes: [], dismissals: [] }); });
    return () => { alive = false; };
  }, [req.id]);
  const ST = { SENT: ['badge-purple', 'Enviada'], SELECTED: ['badge-green', 'Elegida'], REJECTED: ['badge-gray', 'No elegida'] };
  const quotes = data?.quotes || [];
  const dismissals = data?.dismissals || [];
  const noResponded = data?.noResponded || [];
  const comercios = new Set(quotes.map((r) => r.storeName)).size;
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-handle"></div>
        <div className="flex-between mb-4" style={{ gap: 10, alignItems: 'flex-start' }}><h2 className="h-md" style={{ minWidth: 0 }}>Cotizaciones recibidas</h2><button className="icon-btn" type="button" onClick={onClose} title="Cerrar" style={{ flexShrink: 0 }}><i className="fa-solid fa-xmark"></i></button></div>
        <p className="text-sm muted mb-16">{req.code} · {req.label}{req.vehicle ? ` · ${req.vehicle}` : ''}</p>
        {data === null ? <Loading label="Cargando cotizaciones…" />
          : (quotes.length === 0 && dismissals.length === 0) ? <div className="empty-state" style={{ padding: 28 }}><div className="empty-icon"><i className="fa-solid fa-tags"></i></div>Este pedido no recibió cotizaciones ni respuestas.</div>
          : (<div style={{ maxHeight: '64vh', overflowY: 'auto' }}>
            {quotes.length > 0 && (<>
              <p className="text-sm muted mb-12">{quotes.length} cotización{quotes.length === 1 ? '' : 'es'} · {comercios} comercio{comercios === 1 ? '' : 's'}</p>
              {quotes.map((q) => {
                const [cls, txt] = ST[q.status] || ['badge-gray', q.status];
                return (
                  <div key={q.id} className="card mb-8" style={{ background: 'var(--bg-1)' }}>
                    <div className="flex-between mb-4" style={{ gap: 10, alignItems: 'flex-start' }}>
                      <div className="text-sm flex-center gap-8" style={{ fontWeight: 700, minWidth: 0 }}><i className="fa-solid fa-store muted" style={{ fontSize: 12 }}></i><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.storeName}</span></div>
                      <span className="price" style={{ flexShrink: 0 }}>{money(q.price)}</span>
                    </div>
                    <div className="flex-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span className="text-xs muted">{q.optionLabel || 'Opción'}{q.partBrand ? ` · ${q.partBrand}` : ''} · {fmtDateTime(q.createdAt)}{q.respondedInMin != null ? ` · cotizó en ${fmtDelta(q.respondedInMin)}` : ''}</span>
                      <span className={`badge ${cls}`} style={{ flexShrink: 0 }}>{txt}</span>
                    </div>
                  </div>
                );
              })}
            </>)}
            {dismissals.length > 0 && (<>
              <div className="section-title" style={{ marginTop: quotes.length ? 18 : 0 }}><h2 style={{ fontSize: 15 }}><i className="fa-solid fa-ban" style={{ color: '#FCA5A5', marginRight: 7 }}></i>Marcaron sin stock</h2><span className="text-xs muted">{dismissals.length}</span></div>
              <div className="card" style={{ background: 'var(--bg-1)' }}>
                {dismissals.map((d, i) => (
                  <div key={i} className="flex-between" style={{ padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none', gap: 10 }}>
                    <span className="text-sm flex-center gap-8" style={{ minWidth: 0, fontWeight: 600 }}><i className="fa-solid fa-store muted" style={{ fontSize: 12 }}></i><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.storeName}</span></span>
                    <span className="text-xs muted" style={{ flexShrink: 0 }}>{fmtDateTime(d.createdAt)}</span>
                  </div>
                ))}
              </div>
            </>)}
            {noResponded.length > 0 && (<>
              <div className="section-title" style={{ marginTop: (quotes.length || dismissals.length) ? 18 : 0 }}><h2 style={{ fontSize: 15 }}><i className="fa-regular fa-clock muted" style={{ marginRight: 7 }}></i>No respondieron</h2><span className="text-xs muted">{noResponded.length}</span></div>
              <p className="text-xs muted mb-8">Comercios que reciben este rubro pero todavía no cotizaron ni marcaron sin stock.</p>
              <div className="flex" style={{ flexWrap: 'wrap', gap: 6 }}>{noResponded.map((d, i) => <span key={i} className="chip"><i className="fa-solid fa-store" style={{ fontSize: 10, opacity: 0.6 }}></i> {d.storeName}</span>)}</div>
            </>)}
          </div>)}
      </div>
    </div>
  );
}

export default OrdersSection;
