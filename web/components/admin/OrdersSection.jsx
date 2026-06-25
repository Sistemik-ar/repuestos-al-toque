import { useState, useEffect, useMemo } from 'react';
import { money, fmtDateTime } from '@/lib/ui';
import Loading from '@/components/Loading';
import { getAdminTrip, getRequestQuotes } from '@/app/actions/data';
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
  { label: 'Reparto', key: 'tripRank', type: 'num' },
];

const ORDER_SEARCH = ['code', 'mechanicName', 'mechanicEmail', 'label', 'vehicle', 'status', 'total'];

function OrdersSection({ orders, loading }) {
  const [tripId, setTripId] = useState(null);
  const [detail, setDetail] = useState(null); // pedido cuyo desglose (comisión/envío/MP) se muestra
  const [quotesReq, setQuotesReq] = useState(null); // pedido cuyas cotizaciones recibidas se muestran
  const rows = useMemo(() => (orders || []).map((o) => ({ ...o, tripRank: o.hasTrip ? 1 : 0, totalStr: o.total ? money(o.total) : '—' })), [orders]);
  const t = useTable(rows, ORDER_COLS, ORDER_SEARCH, { key: 'created', dir: 'desc' });

  return (
    <div className="card">
      <div className="section-title"><h2>Últimos pedidos</h2><span className="text-xs muted">{t.total}</span></div>
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
                <td data-label="Estado"><span className="badge badge-gray">{o.status}</span></td>
                <td data-label="Cotizaciones">{o.quoteCount > 0
                  ? <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 10px' }} onClick={() => setQuotesReq(o)} title="Ver cotizaciones recibidas"><i className="fa-solid fa-tags"></i> {o.quoteCount}</button>
                  : <span className="muted">0</span>}</td>
                <td data-label="Creado" className="text-xs muted rat-th-date">{fmtDateTime(o.created)}</td>
                <td data-label="Concretada" className="text-xs muted rat-th-date">{fmtDateTime(o.concretada)}</td>
                <td data-label="Reparto">{o.hasTrip
                  ? <button className="btn btn-ghost btn-sm" onClick={() => setTripId(o.orderId)}><i className="fa-solid fa-truck-fast"></i> Ver reparto</button>
                  : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager pager={t.pager} />
      {tripId && <TripModal orderId={tripId} onClose={() => setTripId(null)} />}
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
        <div className="text-xs muted mt-12"><i className="fa-solid fa-circle-info"></i> Valores congelados al crearse el pedido. Cambiar la comisión/recargo en Ajustes solo afecta pedidos nuevos.</div>
      </div>
    </div>
  );
}

function TripModal({ orderId, onClose }) {
  const [trip, setTrip] = useState(null);
  useEffect(() => { let alive = true; getAdminTrip(orderId).then((r) => { if (alive) setTrip(r || { events: [] }); }); return () => { alive = false; }; }, [orderId]);
  const ST = { PAID: ['badge-yellow', 'Pagado'], SHIPPED: ['badge-yellow', 'En camino'], DELIVERED: ['badge-green', 'Entregado'], DONE: ['badge-green', 'Entregado'] };
  const stBadge = trip ? (ST[trip.status] || ['badge-gray', trip.status]) : null;
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-handle"></div>
        <div className="flex-between mb-4">
          <h2 className="h-md">Historial de reparto</h2>
          <button className="icon-btn" type="button" onClick={onClose} title="Cerrar"><i className="fa-solid fa-xmark"></i></button>
        </div>
        {!trip ? <Loading label="Cargando reparto…" /> : (
          <>
            <p className="text-sm muted mb-16">{trip.code} · {trip.label}{trip.vehicle ? ` · ${trip.vehicle}` : ''}</p>
            <div className="map-mock mb-16"><div className="map-route"></div><div className="map-pin start"></div><div className="map-pin driver"></div><div className="map-pin end"></div></div>
            <div className="card mb-16" style={{ background: 'var(--bg-1)' }}>
              <div className="flex-center gap-12">
                <div className="store-avatar"><i className="fa-solid fa-motorcycle"></i></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-sm" style={{ fontWeight: 700 }}>{trip.courier || 'Sin repartidor asignado'}</div>
                  {trip.plate && <div className="text-xs muted">Patente {trip.plate}</div>}
                </div>
                {stBadge && <span className={`badge ${stBadge[0]}`}>{stBadge[1]}</span>}
              </div>
              {trip.consolidated && (
                <div className="float-notif mt-12" style={{ padding: '10px 12px' }}><i className="fa-solid fa-layer-group text-purple"></i><div className="text-xs subtle">Viaje <b>consolidado</b>: el repartidor retira piezas de más de un comercio en el mismo recorrido.</div></div>
              )}
            </div>
            <div className="timeline">
              {trip.events.map((e, i) => (
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

// Todas las cotizaciones que recibió un pedido: comercio, precio, estado y cuándo cotizó.
function RequestQuotesModal({ req, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { let alive = true; getRequestQuotes(req.id).then((r) => { if (alive) setRows(r || []); }).catch(() => { if (alive) setRows([]); }); return () => { alive = false; }; }, [req.id]);
  const ST = { SENT: ['badge-purple', 'Enviada'], SELECTED: ['badge-green', 'Elegida'], REJECTED: ['badge-gray', 'No elegida'] };
  const comercios = rows ? new Set(rows.map((r) => r.storeName)).size : 0;
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-handle"></div>
        <div className="flex-between mb-4" style={{ gap: 10, alignItems: 'flex-start' }}><h2 className="h-md" style={{ minWidth: 0 }}>Cotizaciones recibidas</h2><button className="icon-btn" type="button" onClick={onClose} title="Cerrar" style={{ flexShrink: 0 }}><i className="fa-solid fa-xmark"></i></button></div>
        <p className="text-sm muted mb-16">{req.code} · {req.label}{req.vehicle ? ` · ${req.vehicle}` : ''}</p>
        {rows === null ? <Loading label="Cargando cotizaciones…" />
          : rows.length === 0 ? <div className="empty-state" style={{ padding: 28 }}><div className="empty-icon"><i className="fa-solid fa-tags"></i></div>Este pedido no recibió cotizaciones.</div>
          : (<>
            <p className="text-sm muted mb-12">{rows.length} cotización{rows.length === 1 ? '' : 'es'} · {comercios} comercio{comercios === 1 ? '' : 's'}</p>
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {rows.map((q) => {
                const [cls, txt] = ST[q.status] || ['badge-gray', q.status];
                return (
                  <div key={q.id} className="card mb-8" style={{ background: 'var(--bg-1)' }}>
                    <div className="flex-between mb-4" style={{ gap: 10, alignItems: 'flex-start' }}>
                      <div className="text-sm flex-center gap-8" style={{ fontWeight: 700, minWidth: 0 }}><i className="fa-solid fa-store muted" style={{ fontSize: 12 }}></i><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.storeName}</span></div>
                      <span className="price" style={{ flexShrink: 0 }}>{money(q.price)}</span>
                    </div>
                    <div className="flex-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span className="text-xs muted">{q.optionLabel || 'Opción'}{q.partBrand ? ` · ${q.partBrand}` : ''} · {fmtDateTime(q.createdAt)}</span>
                      <span className={`badge ${cls}`} style={{ flexShrink: 0 }}>{txt}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>)}
      </div>
    </div>
  );
}

export default OrdersSection;
