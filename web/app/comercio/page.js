'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast, ping, tierFor } from '@/lib/ui';
import { usePoll, keep } from '@/lib/usePoll';
import { getMe, getOpenRequestsForStore, getStoreSales, createQuote, getStoreCreditRequests, storeActOnCredit, storeConfirmPickup } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';
import { uploadPhoto } from '@/lib/upload';

export default function Comercio() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState([]);
  const [sales, setSales] = useState([]);
  const [tab, setTab] = useState('pend');
  const [modal, setModal] = useState(null);
  const [dismissed, setDismissed] = useState([]);
  const [zoom, setZoom] = useState(null);
  const badge = tierFor('store', 312);

  const load = async () => {
    try {
      const [m, o, s] = await Promise.all([getMe(), getOpenRequestsForStore(), getStoreSales()]);
      setMe((p) => keep(p, m || null));
      setOpen((p) => keep(p, o || []));
      setSales((p) => keep(p, s || []));
    } catch {} // si una action falla (red/DB), conservamos el último estado válido
  };
  usePoll(load, 4000);

  // pendientes: solo con la ventana de cotización todavía abierta.
  // Orden: la que VENCE ANTES primero (es donde hay que actuar ya); urgente desempata.
  const windowOpen = (r) => ['OPEN', 'QUOTED'].includes(r.status) && (!r.windowEndsAt || r.windowEndsAt > Date.now());
  const pend = open
    .filter((r) => r.myCount === 0 && windowOpen(r) && !dismissed.includes(r.id))
    .sort((a, b) => (a.windowEndsAt || Infinity) - (b.windowEndsAt || Infinity) || (a.urgency === 'Necesito ahora' ? -1 : 1));
  const cot = open.filter((r) => r.myCount > 0);
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
  const initials = (me?.name || 'RC').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const label = (r) => r.desc || r.catLabel || 'Repuesto';
  const veh = (r) => `${r.brand || ''} ${r.model || ''} ${r.year || ''}`.trim();

  async function sendQuote(payload) {
    const res = await createQuote(modal.id, payload);
    setModal(null);
    if (res?.error) { toast({ title: res.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
    ping(); toast({ title: 'Cotización enviada', sub: 'El mecánico la ve al cerrar la ventana', icon: 'fa-paper-plane', type: 'green' });
    load();
  }
  async function logout() { await logoutAction(); router.push('/login'); }

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Panel Comercio</span></Link>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={logout} title="Salir"><i className="fa-solid fa-right-from-bracket"></i></button>
          <div className="avatar" style={{ background: 'linear-gradient(135deg,var(--yellow),var(--purple))' }}>{initials}</div>
        </div>
      </div>

      <div className="container">
        <div className="mb-16"><div className="eyebrow">{me?.name || 'Comercio'}</div><h1 className="h-lg">Solicitudes entrantes</h1><p className="text-sm muted">Respondé rápido = ganás la venta</p></div>

        <div className="card glow mb-16" style={{ background: 'linear-gradient(135deg,rgba(250,204,21,0.16),rgba(31,41,55,0.6))' }}>
          <div className="flex-between mb-12">
            <div className="flex-center gap-12">
              <div className="avatar" style={{ width: 46, height: 46, fontSize: 16, background: 'linear-gradient(135deg,var(--yellow),var(--purple))' }}>{initials}</div>
              <div><div style={{ fontWeight: 800 }}>{me?.name || 'Comercio'}</div><div className="mt-4"><span className={`rep-badge ${badge.cls}`}><i className={`fa-solid ${badge.icon}`}></i> {badge.label}</span></div></div>
            </div>
            <div style={{ textAlign: 'right' }}><div className="text-xs muted">Puntos</div><div className="h-md text-yellow">6.180</div></div>
          </div>
          <div className="rep-stats card" style={{ background: 'var(--bg-1)', padding: 12 }}>
            <div><div className="v">{pend.length}</div><div className="l">Solicitudes</div></div>
            <div><div className="v">{cot.length}</div><div className="l">Cotizadas</div></div>
            <div><div className="v text-green">{sales.length}</div><div className="l">Concretadas</div></div>
          </div>
        </div>

        <CreditRequestsStore />

        {/* Por cobrar: quién le debe plata al vendedor */}
        {sales.length > 0 && (() => {
          const plataforma = sales.filter((r) => !r.creditAccount);
          const cc = sales.filter((r) => r.creditAccount);
          const sum = (xs) => xs.reduce((a, r) => a + (r.part || 0), 0);
          return (
            <div className="card mb-16">
              <div className="section-title"><h2>Por cobrar</h2></div>
              <div className="flex-between mb-8">
                <span className="text-sm subtle"><i className="fa-solid fa-building-columns text-purple"></i> Te liquida RepuestosAlToque</span>
                <span className="text-sm" style={{ fontWeight: 800 }}>{'$' + sum(plataforma).toLocaleString('es-AR')} <span className="text-xs muted">({plataforma.length} venta{plataforma.length === 1 ? '' : 's'})</span></span>
              </div>
              {cc.length > 0 && (
                <div className="flex-between">
                  <span className="text-sm subtle"><i className="fa-solid fa-id-card-clip text-yellow"></i> En cuenta corriente (te debe el taller)</span>
                  <span className="text-sm" style={{ fontWeight: 800 }}>{'$' + sum(cc).toLocaleString('es-AR')} <span className="text-xs muted">({cc.length})</span></span>
                </div>
              )}
              <div className="text-xs muted mt-8">Liquidación semanal de las ventas cobradas por la plataforma.</div>
            </div>
          );
        })()}

        <div className="pill-tabs mb-16">
          <button className={tab === 'pend' ? 'active' : ''} onClick={() => setTab('pend')}>Pendientes <span className="badge badge-yellow" style={{ marginLeft: 4 }}>{pend.length}</span></button>
          <button className={tab === 'cot' ? 'active' : ''} onClick={() => setTab('cot')}>Cotizadas</button>
          <button className={tab === 'ent' ? 'active' : ''} onClick={() => setTab('ent')}>Concretadas</button>
        </div>

        {tab === 'pend' && (pend.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-inbox"></i></div><div className="text-sm">Sin solicitudes pendientes</div><div className="text-xs">Cuando un mecánico pida un repuesto, aparece acá</div></div>
        ) : <div className="cards-grid">{pend.map((r) => (
          <div className="card mb-12" key={r.id}>
            <div className="flex-between mb-12">
              <div className="flex-center gap-12"><div className="store-avatar" style={r.urgency === 'Necesito ahora' ? { background: 'rgba(239,68,68,0.16)', color: '#FCA5A5' } : {}}><i className="fa-solid fa-bolt"></i></div><div><div className="text-sm" style={{ fontWeight: 700 }}>{label(r)}</div><div className="text-xs muted">{veh(r)} · {r.catLabel}</div></div></div>
              <span className="badge badge-gray">#{r.code}</span>
            </div>
            <div className="flex-between mb-12">
              <div className="flex-center gap-8" style={{ flexWrap: 'wrap' }}>
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
            <div className="locked-info mb-12"><i className="fa-solid fa-user-secret"></i> Mecánico anónimo hasta concretar</div>
            <div className="flex gap-12">
              <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto' }} onClick={() => { setDismissed((d) => [...d, r.id]); toast({ title: 'Marcado sin stock', sub: 'No penaliza tu balance', icon: 'fa-ban', type: 'purple' }); }}><i className="fa-solid fa-ban"></i> Sin stock</button>
              <button className="btn btn-yellow btn-block" onClick={() => setModal(r)}><i className="fa-solid fa-tag"></i> Cotizar</button>
            </div>
          </div>
        ))}</div>)}

        {tab === 'cot' && (cot.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-tags"></i></div><div className="text-sm">Todavía no cotizaste nada</div></div>
        ) : (
          // agrupado por estado; cada grupo con el orden que le sirve al comerciante:
          // esperando = más nuevas primero · pendiente de pago = vence antes primero ·
          // sin respuesta (zombies >24hs) = atenuadas abajo · resto = historial newest-first
          [
            ['Esperando decisión', vivas],
            ['Pendiente de pago', cot.filter((r) => r.status === 'CLOSED' && r.mySelected).sort((a, b) => (a.selectedAt || 0) - (b.selectedAt || 0))],
            ['Sin respuesta', sinRespuesta],
            ['No elegidas', cot.filter((r) => r.status === 'CLOSED' && !r.mySelected).sort((a, b) => b.createdAt - a.createdAt)],
            ['Canceladas', cot.filter((r) => r.status === 'CANCELLED').sort((a, b) => b.createdAt - a.createdAt)],
          ].filter(([, rows]) => rows.length > 0).map(([titulo, rows]) => (
            <div key={titulo} className="section">
              <div className="section-title"><h2>{titulo}</h2><span className="text-xs muted">{rows.length}</span></div>
              <div className="cards-grid">{rows.map((r) => {
                const [bCls, bIcon, bTxt] = titulo === 'Sin respuesta' ? ['badge-gray', 'fa-moon', 'Sin respuesta'] : cotBadge(r);
                return (
                  <div className="card mb-12" key={r.id} style={r.status === 'CANCELLED' || titulo === 'Sin respuesta' ? { opacity: 0.6 } : {}}>
                    <div className="flex-between mb-8"><div><div className="text-sm" style={{ fontWeight: 700 }}>{label(r)}</div><div className="text-xs muted">{veh(r)} · {r.catLabel} · {r.myCount} {r.myCount === 1 ? 'opción' : 'opciones'}</div></div><span className={`badge ${bCls}`}><i className={`fa-solid ${bIcon}`}></i> {bTxt}</span></div>
                    <div className="flex-between text-sm mb-12"><span className="muted">Tus precios</span><span style={{ fontWeight: 700 }}>{(r.myPrices || []).map((p) => '$' + p.toLocaleString('es-AR')).join(' · ')}</span></div>
                    {['OPEN', 'QUOTED'].includes(r.status) && r.myCount < 3 && <button className="btn btn-ghost btn-block btn-sm" onClick={() => setModal(r)}><i className="fa-solid fa-plus"></i> Agregar otra opción</button>}
                  </div>
                );
              })}</div>
            </div>
          ))
        ))}

        {tab === 'ent' && (sales.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-box"></i></div><div className="text-sm">Sin ventas concretadas todavía</div></div>
        ) : <div className="cards-grid">{sales.map((r) => <EntregaCard key={r.orderId} r={r} label={label(r)} veh={veh(r)} onChanged={load} />)}</div>)}
      </div>

      {modal && <CotizarModal lead={modal} label={label(modal)} veh={veh(modal)} onClose={() => setModal(null)} onSend={sendQuote} />}
      {zoom && <div onClick={() => setZoom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 300, display: 'grid', placeItems: 'center', padding: 20, cursor: 'zoom-out' }}><img src={zoom} alt="" style={{ maxWidth: '92vw', maxHeight: '85vh', width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: 12 }} /></div>}
    </div>
  );
}

function EntregaCard({ r, label, veh, onChanged }) {
  const [pin, setPin] = useState('');
  async function confirmar() {
    const res = await storeConfirmPickup(r.orderId, pin);
    setPin('');
    if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
    toast({ title: 'Retiro confirmado', sub: 'La pieza va en camino al taller', icon: 'fa-truck-fast', type: 'green' });
    onChanged?.();
  }
  return (
    <div className="card mb-12">
      <div className="flex-between mb-8"><div><div className="text-sm" style={{ fontWeight: 700 }}>{label}</div><div className="text-xs muted">{veh}</div></div><span className="badge badge-green"><i className="fa-solid fa-check"></i> Pagado</span></div>
      <div className="flex-between mb-12">
        <span className="text-sm muted">Venta <b className="text-green">{r.part ? '$' + r.part.toLocaleString('es-AR') : ''}</b></span>
        {r.orderStatus === 'SHIPPED' && <span className="badge badge-yellow"><i className="fa-solid fa-truck-fast"></i> Retirado · en camino al taller</span>}
        {r.orderStatus === 'DELIVERED' && <span className="badge badge-green"><i className="fa-solid fa-box-open"></i> Entregado al mecánico</span>}
        {r.orderStatus === 'PAID' && !r.hasDelivery && <span className="badge badge-gray"><i className="fa-solid fa-clock"></i> Esperando repartidor</span>}
        {r.orderStatus === 'PAID' && r.hasDelivery && <span className="badge badge-yellow"><i className="fa-solid fa-motorcycle"></i> Repartidor en camino a tu local</span>}
      </div>
      {r.issue && <div className="float-notif mb-12" style={{ padding: '8px 12px', borderColor: 'rgba(239,68,68,0.4)' }}><i className="fa-solid fa-flag text-red"></i><span className="text-xs subtle"><b>Incidencia:</b> {r.issue}</span></div>}
      {r.orderStatus === 'PAID' && r.hasDelivery && (
        <div>
          {r.arrivedPickup
            ? <div className="float-notif mb-8" style={{ padding: '8px 12px', borderColor: 'rgba(250,204,21,0.45)' }}><i className="fa-solid fa-location-dot text-yellow"></i><span className="text-xs subtle"><b>El repartidor está en tu local</b> — pedile su PIN y confirmá el retiro</span></div>
            : <div className="text-xs muted mb-8"><i className="fa-solid fa-key"></i> Cuando venga el repartidor, pedile su PIN y confirmá el retiro</div>}
          <div className="flex gap-12">
            <input className="input" inputMode="numeric" maxLength={4} placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} style={{ maxWidth: 110, textAlign: 'center', letterSpacing: '0.2em', fontWeight: 800 }} />
            <button className="btn btn-yellow btn-block" disabled={pin.length !== 4} onClick={confirmar}><i className="fa-solid fa-box"></i> Confirmar retiro</button>
          </div>
        </div>
      )}
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
  const [brand, setBrand] = useState('Bosch');
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

  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-handle"></div>
        <h2 className="h-md mb-4">Enviar cotización{lead.myCount > 0 ? ` · opción ${lead.myCount + 1}` : ''}</h2>
        <p className="text-sm muted mb-16">{label} · {veh}{lead.myCount > 0 ? ' · podés ofrecer otra alternativa' : ''}</p>
        <div className="field"><label>Precio final</label><input className="input" inputMode="numeric" placeholder="$ 0" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div className="grid-2">
          <div className="field"><label>Marca de la pieza</label><select className="select" value={brand} onChange={(e) => setBrand(e.target.value)}><option>Bosch</option><option>TRW</option><option>Ferodo</option><option>Original / OEM</option><option>Alternativa</option></select></div>
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
        <div className="field"><label>Notas <span className="muted">(opcional)</span></label><textarea className="textarea" placeholder="Stock disponible, garantía…" value={note} onChange={(e) => setNote(e.target.value)}></textarea></div>
        <div className="flex gap-12">
          <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-yellow btn-block" disabled={!price} onClick={() => onSend({ price, partBrand: brand, optionLabel: opcion, note, photoUrls: photos })}><i className="fa-solid fa-paper-plane"></i> Enviar Cotización</button>
        </div>
      </div>
    </div>
  );
}
