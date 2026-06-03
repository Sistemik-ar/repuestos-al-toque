'use client';
import { useState } from 'react';
import Link from 'next/link';
import { toast, ping, tierFor } from '@/lib/ui';
import { useRequests, addQuote, getQuotes, storeQuotedRequestIds, setRequestStatus } from '@/lib/store';

const STORE = 'Repuestos Centro';

export default function Comercio() {
  const [tab, setTab] = useState('pend');
  const [modal, setModal] = useState(null);
  const [dismissed, setDismissed] = useState([]);
  const requests = useRequests();
  const badge = tierFor('store', 312);

  const quoted = storeQuotedRequestIds(STORE);
  const open = requests.filter((r) => r.status === 'open');
  const pend = open.filter((r) => !quoted.has(r.id) && !dismissed.includes(r.id));
  const cot = requests.filter((r) => quoted.has(r.id) && r.status !== 'paid');
  const ent = requests.filter((r) => r.status === 'paid');

  const label = (r) => r.desc || r.catLabel || 'Repuesto';
  const veh = (r) => `${r.brand || ''} ${r.model || ''} ${r.year || ''}`.trim();

  function sendQuote(price, partBrand, note) {
    addQuote({ requestId: modal.id, storeName: STORE, rating: 4.8, zone: 'Centro', partBrand, price: Number(String(price).replace(/\D/g, '')) || 0, note });
    setModal(null);
    ping();
    toast({ title: 'Cotización enviada', sub: 'Se revela al mecánico al cerrarse la ventana', icon: 'fa-paper-plane', type: 'green' });
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Panel Comercio</span></Link>
        <div className="topbar-actions">
          <div className="avatar" style={{ background: 'linear-gradient(135deg,var(--yellow),var(--purple))' }}>RC</div>
        </div>
      </div>

      <div className="container">
        <div className="mb-16">
          <div className="eyebrow">Repuestos Centro</div>
          <h1 className="h-lg">Solicitudes entrantes</h1>
          <p className="text-sm muted">Respondé rápido = ganás la venta</p>
        </div>

        <div className="card glow mb-16" style={{ background: 'linear-gradient(135deg,rgba(250,204,21,0.16),rgba(31,41,55,0.6))' }}>
          <div className="flex-between mb-12">
            <div className="flex-center gap-12">
              <div className="avatar" style={{ width: 46, height: 46, fontSize: 16, background: 'linear-gradient(135deg,var(--yellow),var(--purple))' }}>RC</div>
              <div><div style={{ fontWeight: 800 }}>Repuestos Centro</div><div className="mt-4"><span className={`rep-badge ${badge.cls}`}><i className={`fa-solid ${badge.icon}`}></i> {badge.label}</span></div></div>
            </div>
            <div style={{ textAlign: 'right' }}><div className="text-xs muted">Puntos</div><div className="h-md text-yellow">6.180</div></div>
          </div>
          <div className="rep-stats card" style={{ background: 'var(--bg-1)', padding: 12 }}>
            <div><div className="v">312</div><div className="l">Ventas</div></div>
            <div><div className="v">⭐ 4.8</div><div className="l">Calificación</div></div>
            <div><div className="v">3 min</div><div className="l">Resp. prom.</div></div>
          </div>
        </div>

        <div className="grid-3 mb-16">
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value text-yellow">{pend.length}</div><div className="stat-label">Solicitudes</div></div>
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value text-green">{ent.length}</div><div className="stat-label">Concretados</div></div>
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value">{cot.length}</div><div className="stat-label">Cotizadas</div></div>
        </div>

        <div className="pill-tabs mb-16">
          <button className={tab === 'pend' ? 'active' : ''} onClick={() => setTab('pend')}>Pendientes <span className="badge badge-yellow" style={{ marginLeft: 4 }}>{pend.length}</span></button>
          <button className={tab === 'cot' ? 'active' : ''} onClick={() => setTab('cot')}>Cotizadas</button>
          <button className={tab === 'ent' ? 'active' : ''} onClick={() => setTab('ent')}>Concretadas</button>
        </div>

        {tab === 'pend' && (
          pend.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-inbox"></i></div><div className="text-sm">Sin solicitudes pendientes</div><div className="text-xs">Generá un pedido desde el panel del Mecánico para verlo acá</div></div>
          ) : (
            pend.map((r) => (
              <div className="card mb-12" key={r.id}>
                <div className="flex-between mb-12">
                  <div className="flex-center gap-12">
                    <div className="store-avatar" style={r.urgency === 'Necesito ahora' ? { background: 'rgba(239,68,68,0.16)', color: '#FCA5A5' } : {}}><i className="fa-solid fa-bolt"></i></div>
                    <div><div className="text-sm" style={{ fontWeight: 700 }}>{label(r)}</div><div className="text-xs muted">{veh(r)} · {r.catLabel}</div></div>
                  </div>
                  <span className="badge badge-gray">#{r.id}</span>
                </div>
                <div className="flex-between mb-12">
                  <div className="flex-center gap-8">
                    <span className="badge badge-gray"><i className="fa-solid fa-layer-group"></i> {r.catLabel}</span>
                    {r.urgency === 'Necesito ahora' && <span className="badge badge-red"><i className="fa-solid fa-bolt"></i> Urgente</span>}
                  </div>
                  {r.photo && <span className="badge badge-purple"><i className="fa-solid fa-image"></i> con foto</span>}
                </div>
                <div className="locked-info mb-12"><i className="fa-solid fa-user-secret"></i> Mecánico anónimo hasta concretar</div>
                <div className="flex gap-12">
                  <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto' }} onClick={() => { setDismissed((d) => [...d, r.id]); toast({ title: 'Marcado sin disponibilidad', sub: 'No penaliza tu balance', icon: 'fa-ban', type: 'purple' }); }}><i className="fa-solid fa-ban"></i> Sin disponibilidad</button>
                  <button className="btn btn-yellow btn-block" onClick={() => setModal(r)}><i className="fa-solid fa-tag"></i> Cotizar</button>
                </div>
              </div>
            ))
          )
        )}

        {tab === 'cot' && (
          cot.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-tags"></i></div><div className="text-sm">Todavía no cotizaste nada</div></div>
          ) : (
            cot.map((r) => {
              const my = getQuotes(r.id).filter((q) => q.storeName === STORE)[0];
              return (
                <div className="card mb-12" key={r.id}>
                  <div className="flex-between mb-8"><div><div className="text-sm" style={{ fontWeight: 700 }}>{label(r)}</div><div className="text-xs muted">{veh(r)} · {r.catLabel}</div></div><span className="badge badge-purple">Esperando decisión</span></div>
                  <div className="flex-between text-sm"><span className="muted">Cotizaste</span><span style={{ fontWeight: 700 }}>{my ? '$' + my.price.toLocaleString('es-AR') : '—'}</span></div>
                </div>
              );
            })
          )
        )}

        {tab === 'ent' && (
          ent.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-box"></i></div><div className="text-sm">Sin ventas concretadas todavía</div></div>
          ) : (
            ent.map((r) => <EntregaCard key={r.id} r={r} label={label(r)} veh={veh(r)} />)
          )
        )}
      </div>

      {modal && <CotizarModal lead={modal} label={label(modal)} veh={veh(modal)} onClose={() => setModal(null)} onSend={sendQuote} />}
    </div>
  );
}

function EntregaCard({ r, label, veh }) {
  const my = getQuotes(r.id).filter((q) => q.storeName === STORE)[0];
  const [salio, setSalio] = useState(false);
  return (
    <div className="card mb-12">
      <div className="flex-between mb-8"><div><div className="text-sm" style={{ fontWeight: 700 }}>{label}</div><div className="text-xs muted">{veh}</div></div><span className="badge badge-green"><i className="fa-solid fa-check"></i> Pagado</span></div>
      <div className="flex-between">
        <span className="text-sm muted">Venta <b className="text-green">{my ? '$' + my.price.toLocaleString('es-AR') : ''}</b></span>
        {salio ? <span className="badge badge-yellow"><i className="fa-solid fa-truck-fast"></i> Retira el flete</span> : <button className="btn btn-yellow btn-sm" onClick={() => { setSalio(true); toast({ title: 'Pedido marcado como listo', sub: 'Avisamos a la empresa de envíos', icon: 'fa-box', type: 'green' }); }}><i className="fa-solid fa-box"></i> Salió el pedido</button>}
      </div>
    </div>
  );
}

function CotizarModal({ lead, label, veh, onClose, onSend }) {
  const [price, setPrice] = useState('');
  const [brand, setBrand] = useState('Bosch');
  const [note, setNote] = useState('');
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-handle"></div>
        <h2 className="h-md mb-4">Enviar cotización</h2>
        <p className="text-sm muted mb-16">{label} · {veh}</p>
        <div className="field"><label>Precio final</label><input className="input" inputMode="numeric" placeholder="$ 0" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div className="field"><label>Marca de la pieza</label>
          <select className="select" value={brand} onChange={(e) => setBrand(e.target.value)}><option>Bosch</option><option>TRW</option><option>Ferodo</option><option>Original / OEM</option><option>Alternativa</option></select>
        </div>
        <div className="field"><label>Notas <span className="muted">(opcional)</span></label><textarea className="textarea" placeholder="Stock disponible, garantía, etc." value={note} onChange={(e) => setNote(e.target.value)}></textarea></div>
        <div className="flex gap-12">
          <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-yellow btn-block" disabled={!price} onClick={() => onSend(price, brand, note)}><i className="fa-solid fa-paper-plane"></i> Enviar Cotización</button>
        </div>
      </div>
    </div>
  );
}
