'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { money, toast, fmtDateTime } from '@/lib/ui';
import { usePoll, keep } from '@/lib/usePoll';
import { useRouter } from 'next/navigation';
import { getRequestDetail, rateOrder, getMyRatingsForOrder, duplicateRequest } from '@/app/actions/data';
import Loading from '@/components/Loading';
import BusyButton from '@/components/BusyButton';

const STEPS = [
  { key: 'OPEN', label: 'Pedido creado', icon: 'fa-clipboard-list' },
  { key: 'QUOTED', label: 'Cotizaciones recibidas', icon: 'fa-tags' },
  { key: 'PAID', label: 'Pagado', icon: 'fa-circle-check' },
  { key: 'SHIPPED', label: 'En camino', icon: 'fa-truck-fast' },
  { key: 'DELIVERED', label: 'Entregado', icon: 'fa-box-open' },
];
const ORDER_OF = { OPEN: 0, CLOSED: 1, QUOTED: 1, PAID: 2, SHIPPED: 3, DELIVERED: 4 };

export default function Detalle() {
  const router = useRouter();
  const [id, setId] = useState(null);
  const [r, setR] = useState(undefined); // undefined = cargando · null = no encontrado · obj = ok
  const [zoom, setZoom] = useState(null);
  const [duping, setDuping] = useState(false);

  async function volverAPedir() {
    setDuping(true);
    const res = await duplicateRequest(id);
    setDuping(false);
    if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
    toast({ title: 'Pedido republicado', sub: 'Nuevo trabajo creado', icon: 'fa-rotate-right', type: 'green' });
    router.push(`/mecanico/trabajo?id=${res.jobId}`);
  }

  useEffect(() => { setId(new URLSearchParams(window.location.search).get('id')); }, []);
  usePoll(async () => { if (id) { try { const d = await getRequestDetail(id); setR((p) => keep(p, d)); } catch {} } }, 5000);
  useEffect(() => { if (id) getRequestDetail(id).then(setR); }, [id]);

  const veh = r ? `${r.brand || ''} ${r.model || ''} ${r.year || ''}`.trim() : '';
  const stage = r ? (ORDER_OF[r.status] ?? 0) : 0;

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="flex-center">
          <Link href="/mecanico" className="icon-btn"><i className="fa-solid fa-arrow-left"></i></Link>
          <div><div style={{ fontWeight: 800 }}>Detalle del pedido</div><div className="text-xs muted">{r ? `#${r.code}` : 'Cargando…'}</div></div>
        </div>
      </div>

      <div className="container form-narrow">
        {r === undefined ? (
          <Loading label="Cargando el pedido…" />
        ) : !r ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-clipboard-question"></i></div><div className="text-sm">No encontramos el pedido</div></div>
        ) : (
          <>
            {/* Cancelado por falta de pago */}
            {r.status === 'CANCELLED' && (
              <div className="card mb-16" style={{ borderColor: 'rgba(239,68,68,0.4)' }}>
                <div className="flex-center gap-12 mb-12"><div className="store-avatar" style={{ background: 'rgba(239,68,68,0.16)', color: '#FCA5A5' }}><i className="fa-solid fa-ban"></i></div><div><div className="text-sm" style={{ fontWeight: 800 }}>Pedido cancelado</div><div className="text-xs muted">Pasaron más de 24hs sin completar el pago</div></div></div>
                <button className="btn btn-primary btn-block" disabled={duping} onClick={volverAPedir}>{duping ? <span className="spinner"></span> : <><i className="fa-solid fa-rotate-right"></i> Volver a pedir</>}</button>
              </div>
            )}

            {/* Seguimiento */}
            {r.status !== 'CANCELLED' && (
            <div className="card mb-16">
              <div className="section-title"><h2>Seguimiento</h2></div>
              {STEPS.map((st, i) => (
                <div key={st.key} className="flex-center gap-12" style={{ opacity: i <= stage ? 1 : 0.35, marginBottom: i < STEPS.length - 1 ? 10 : 0 }}>
                  <div className="store-avatar" style={{ width: 34, height: 34, background: i <= stage ? 'rgba(34,197,94,0.16)' : 'var(--bg-2)', color: i <= stage ? '#4ADE80' : 'var(--text-2)' }}>
                    <i className={`fa-solid ${i < stage ? 'fa-check' : st.icon}`}></i>
                  </div>
                  <div className="text-sm" style={{ fontWeight: i === stage ? 800 : 600 }}>{st.label}{i === stage && <span className="badge badge-purple" style={{ marginLeft: 8 }}>ahora</span>}</div>
                </div>
              ))}
            </div>
            )}

            {/* Datos del pedido */}
            <div className="card mb-16">
              <div className="section-title"><h2>Pedido</h2><span className="badge badge-gray">#{r.code}</span></div>
              <Row k="Repuesto" v={r.desc || r.catLabel} />
              <Row k="Vehículo" v={veh || '—'} />
              <Row k="Motorización" v={r.engine || '—'} />
              <Row k="Categoría" v={r.catLabel || '—'} />
              <Row k="Fecha del pedido" v={fmtDateTime(r.createdAt)} />
              <Row k="Urgencia" v={r.urgency} />
              <Row k="Factura" v={r.invoiceType === 'factura_a' ? `Factura A · ${r.solicRazon || ''} ${r.solicCuit ? '(CUIT ' + r.solicCuit + ')' : ''}` : 'Consumidor Final'} />
              {r.photoUrls?.length > 0 && (
                <div className="flex gap-8 mt-12">{r.photoUrls.map((u, i) => <img key={i} src={u} alt="" onClick={() => setZoom(u)} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', cursor: 'zoom-in' }} />)}</div>
              )}
            </div>

            {/* Oferta elegida */}
            {r.selected && (
              <div className="card mb-16">
                <div className="section-title"><h2>Oferta elegida</h2></div>
                <div className="flex-between mb-8">
                  <div className="flex-center gap-12"><div className="store-avatar"><i className="fa-solid fa-user-secret"></i></div><div><div className="text-sm" style={{ fontWeight: 700 }}>{r.selected.alias}</div><div className="text-xs muted">{r.selected.partBrand}{r.selected.optionLabel ? ` · ${r.selected.optionLabel}` : ''} · {r.selected.warranty}</div></div></div>
                  <span className="price" style={{ fontSize: 18 }}>{money(r.selected.price)}</span>
                </div>
              </div>
            )}

            {/* Totales */}
            {r.order && (
              <div className="card mb-16">
                <div className="section-title"><h2>Pago</h2>{r.order.creditAccount && <span className="badge badge-purple"><i className="fa-solid fa-id-card-clip"></i> Cuenta Corriente</span>}</div>
                <Row k={`Repuesto${r.order.creditAccount ? ' (a tu cuenta corriente)' : ''}`} v={money(r.order.part)} />
                <Row k={`Comisión (${r.order.commissionPct}%)`} v={money(r.order.commission)} />
                <Row k="Envío" v={money(r.order.ship)} />
                {r.order.mpFee > 0 && <Row k="Recargo Mercado Pago" v={money(r.order.mpFee)} />}
                <div className="divider" style={{ margin: '10px 0' }}></div>
                <div className="flex-between"><span className="h-md">Total{r.order.creditAccount ? ' pagado por la app' : ''}</span><span className="h-md text-yellow">{money(r.order.total)}</span></div>
                {r.status === 'PAID' && !r.order.hasDelivery && <div className="text-xs muted mt-8"><i className="fa-solid fa-clock"></i> Esperando que un repartidor tome el pedido</div>}
                {r.status === 'PAID' && r.order.hasDelivery && <div className="text-xs mt-8" style={{ color: 'var(--yellow)' }}><i className="fa-solid fa-motorcycle"></i> Repartidor asignado — yendo a retirar la pieza al comercio</div>}
                {r.status === 'SHIPPED' && <div className="text-xs mt-8" style={{ color: 'var(--yellow)' }}><i className="fa-solid fa-truck-fast"></i> El repartidor retiró la pieza y está en camino a tu taller</div>}
              </div>
            )}

            {/* PIN de entrega: el mecánico se lo da al repartidor cuando recibe la pieza */}
            {r.order?.arrivedDrop && r.status === 'SHIPPED' && (
              <div className="float-notif mb-12" style={{ borderColor: 'rgba(250,204,21,0.5)' }}><i className="fa-solid fa-location-dot text-yellow"></i><div className="text-sm subtle"><b>¡El repartidor llegó a tu taller!</b> Recibí la pieza y dale tu PIN de entrega.</div></div>
            )}
            {r.order?.deliveryPin && r.order.hasDelivery && (
              <div className="card glow mb-16" style={{ textAlign: 'center', borderColor: 'rgba(250,204,21,0.4)' }}>
                <div className="text-xs muted mb-4">Tu PIN de entrega</div>
                <div className="h-lg text-yellow" style={{ letterSpacing: '0.3em' }}>{r.order.deliveryPin}</div>
                <div className="text-xs muted mt-4">Dáselo al repartidor <b>solo cuando recibas la pieza</b> — con eso confirma la entrega</div>
              </div>
            )}

            {/* Calificaciones al cerrar el ciclo */}
            {r.status === 'DELIVERED' && <RatingSection requestId={r.id} />}

            {/* Acciones según estado */}
            {['OPEN', 'QUOTED', 'CLOSED'].includes(r.status) && (
              <Link href={`/mecanico/cotizaciones?id=${r.id}`} className="btn btn-primary btn-block btn-lg"><i className="fa-solid fa-tags"></i> Ver cotizaciones {r.quotesCount > 0 ? `(${r.quotesCount})` : ''}</Link>
            )}
            {r.status === 'DELIVERED' && (
              <button className="btn btn-ghost btn-block" disabled={duping} onClick={volverAPedir}>{duping ? <span className="spinner"></span> : <><i className="fa-solid fa-rotate-right"></i> Volver a pedir este repuesto</>}</button>
            )}
          </>
        )}
      </div>

      {zoom && <div onClick={() => setZoom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 300, display: 'grid', placeItems: 'center', padding: 20, cursor: 'zoom-out' }}><img src={zoom} alt="" style={{ maxWidth: '92vw', maxHeight: '85vh', width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: 12 }} /></div>}
    </div>
  );
}

function Row({ k, v }) {
  return <div className="flex-between mb-8"><span className="text-sm muted">{k}</span><span className="text-sm" style={{ fontWeight: 700, textAlign: 'right' }}>{v}</span></div>;
}

function Estrellas({ value, onChange }) {
  return (
    <div className="flex gap-8">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: n <= value ? 'var(--yellow)' : 'var(--bg-3)' }}>
          <i className="fa-solid fa-star"></i>
        </button>
      ))}
    </div>
  );
}

function RatingSection({ requestId }) {
  const router = useRouter();
  const [seller, setSeller] = useState(0);
  const [product, setProduct] = useState(0);
  const [delivery, setDelivery] = useState(0);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    getMyRatingsForOrder(requestId).then((prev) => {
      if (prev && Object.keys(prev).length) {
        setSeller(prev.SELLER || 0); setProduct(prev.PRODUCT || 0); setDelivery(prev.DELIVERY || 0); setSent(true);
      }
    });
  }, [requestId]);

  async function enviar() {
    const res = await rateOrder(requestId, { seller, product, delivery, comment });
    if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
    setSent(true);
    toast({ title: '¡Gracias por calificar!', sub: 'Tu opinión mejora el ranking', icon: 'fa-star', type: 'green' });
    router.push('/mecanico'); // el toast sobrevive a la navegación (Toaster está en el layout)
  }

  return (
    <div className="card mb-16">
      <div className="section-title"><h2>Calificá tu experiencia</h2>{sent && <span className="badge badge-green"><i className="fa-solid fa-check"></i> Enviada</span>}</div>
      <div className="flex-between mb-12"><span className="text-sm">Vendedor</span><Estrellas value={seller} onChange={setSeller} /></div>
      <div className="flex-between mb-12"><span className="text-sm">Producto</span><Estrellas value={product} onChange={setProduct} /></div>
      <div className="flex-between mb-12"><span className="text-sm">Delivery</span><Estrellas value={delivery} onChange={setDelivery} /></div>
      <div className="field"><textarea className="textarea" placeholder="Comentario (opcional)" value={comment} onChange={(e) => setComment(e.target.value)}></textarea></div>
      <BusyButton className="btn btn-yellow btn-block" disabled={!seller && !product && !delivery} busyLabel="Enviando…" onClick={enviar}><i className="fa-solid fa-star"></i> {sent ? 'Actualizar calificación' : 'Enviar calificación'}</BusyButton>
    </div>
  );
}
