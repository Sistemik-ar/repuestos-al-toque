'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast, ping, tierFor } from '@/lib/ui';
import { getMe, getOpenRequestsForStore, getStoreSales, createQuote } from '@/app/actions/data';
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
  const badge = tierFor('store', 312);

  const load = async () => {
    const [m, o, s] = await Promise.all([getMe(), getOpenRequestsForStore(), getStoreSales()]);
    setMe(m); setOpen(o); setSales(s);
  };
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  const pend = open.filter((r) => !r.mineQuoted && !dismissed.includes(r.id));
  const cot = open.filter((r) => r.mineQuoted);
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

        <div className="pill-tabs mb-16">
          <button className={tab === 'pend' ? 'active' : ''} onClick={() => setTab('pend')}>Pendientes <span className="badge badge-yellow" style={{ marginLeft: 4 }}>{pend.length}</span></button>
          <button className={tab === 'cot' ? 'active' : ''} onClick={() => setTab('cot')}>Cotizadas</button>
          <button className={tab === 'ent' ? 'active' : ''} onClick={() => setTab('ent')}>Concretadas</button>
        </div>

        {tab === 'pend' && (pend.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-inbox"></i></div><div className="text-sm">Sin solicitudes pendientes</div><div className="text-xs">Cuando un mecánico pida un repuesto, aparece acá</div></div>
        ) : pend.map((r) => (
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
              <div className="float-notif mb-12" style={{ padding: '10px 12px' }}><i className="fa-solid fa-file-invoice text-yellow"></i><div className="text-xs subtle"><b>Factura A.</b> Emisor: {r.emisorRazon} (CUIT {r.emisorCuit}) · Solicitante: {r.solicRazon} (CUIT {r.solicCuit})</div></div>
            )}
            {r.photoUrls?.length > 0 && <div className="flex gap-8 mb-12">{r.photoUrls.map((u, i) => <img key={i} src={u} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />)}</div>}
            <div className="locked-info mb-12"><i className="fa-solid fa-user-secret"></i> Mecánico anónimo hasta concretar</div>
            <div className="flex gap-12">
              <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto' }} onClick={() => { setDismissed((d) => [...d, r.id]); toast({ title: 'Marcado sin stock', sub: 'No penaliza tu balance', icon: 'fa-ban', type: 'purple' }); }}><i className="fa-solid fa-ban"></i> Sin stock</button>
              <button className="btn btn-yellow btn-block" onClick={() => setModal(r)}><i className="fa-solid fa-tag"></i> Cotizar</button>
            </div>
          </div>
        )))}

        {tab === 'cot' && (cot.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-tags"></i></div><div className="text-sm">Todavía no cotizaste nada</div></div>
        ) : cot.map((r) => (
          <div className="card mb-12" key={r.id}>
            <div className="flex-between mb-8"><div><div className="text-sm" style={{ fontWeight: 700 }}>{label(r)}</div><div className="text-xs muted">{veh(r)} · {r.catLabel}</div></div><span className="badge badge-purple">Esperando decisión</span></div>
            <div className="flex-between text-sm"><span className="muted">Cotizaste</span><span style={{ fontWeight: 700 }}>{r.myPrice ? '$' + r.myPrice.toLocaleString('es-AR') : '—'}</span></div>
          </div>
        )))}

        {tab === 'ent' && (sales.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-box"></i></div><div className="text-sm">Sin ventas concretadas todavía</div></div>
        ) : sales.map((r) => <EntregaCard key={r.orderId} r={r} label={label(r)} veh={veh(r)} />))}
      </div>

      {modal && <CotizarModal lead={modal} label={label(modal)} veh={veh(modal)} onClose={() => setModal(null)} onSend={sendQuote} />}
    </div>
  );
}

function EntregaCard({ r, label, veh }) {
  const [salio, setSalio] = useState(false);
  return (
    <div className="card mb-12">
      <div className="flex-between mb-8"><div><div className="text-sm" style={{ fontWeight: 700 }}>{label}</div><div className="text-xs muted">{veh}</div></div><span className="badge badge-green"><i className="fa-solid fa-check"></i> Pagado</span></div>
      <div className="flex-between">
        <span className="text-sm muted">Venta <b className="text-green">{r.part ? '$' + r.part.toLocaleString('es-AR') : ''}</b></span>
        {salio ? <span className="badge badge-yellow"><i className="fa-solid fa-truck-fast"></i> Retira el flete</span> : <button className="btn btn-yellow btn-sm" onClick={() => { setSalio(true); toast({ title: 'Pedido listo', sub: 'Avisamos a la empresa de envíos', icon: 'fa-box', type: 'green' }); }}><i className="fa-solid fa-box"></i> Salió el pedido</button>}
      </div>
    </div>
  );
}

function CotizarModal({ lead, label, veh, onClose, onSend }) {
  const [price, setPrice] = useState('');
  const [brand, setBrand] = useState('Bosch');
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
        <h2 className="h-md mb-4">Enviar cotización</h2>
        <p className="text-sm muted mb-16">{label} · {veh}</p>
        <div className="field"><label>Precio final</label><input className="input" inputMode="numeric" placeholder="$ 0" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div className="field"><label>Marca de la pieza</label><select className="select" value={brand} onChange={(e) => setBrand(e.target.value)}><option>Bosch</option><option>TRW</option><option>Ferodo</option><option>Original / OEM</option><option>Alternativa</option></select></div>
        <div className="field">
          <label>Fotos de la pieza <span className="muted">(hasta 3, opcional)</span></label>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
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
          <button className="btn btn-yellow btn-block" disabled={!price} onClick={() => onSend({ price, partBrand: brand, note, photoUrls: photos })}><i className="fa-solid fa-paper-plane"></i> Enviar Cotización</button>
        </div>
      </div>
    </div>
  );
}
