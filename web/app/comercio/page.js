'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast, ping, tierFor } from '@/lib/ui';
import { useRequests, addQuote, getQuotes, storeQuotedRequestIds, getSellerName, setSellerName, getRequest, updateRequest } from '@/lib/store';
import { fileToThumb } from '@/lib/img';

export default function Comercio() {
  const [store, setStore] = useState(null);
  useEffect(() => { setStore(getSellerName()); }, []);
  if (store === null) return <Setup onReady={setStore} />;
  return <Panel store={store} onChange={() => setStore(getSellerName())} />;
}

function Setup({ onReady }) {
  const [name, setName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const sug = ['Repuestos Centro', 'Andina Parts', 'Patagonia Frenos', 'Sur Repuestos'];
  function enter() { const v = name.trim(); if (!v || !accepted) return; setSellerName(v); onReady(v); }
  return (
    <div className="app-shell">
      <div className="container" style={{ paddingTop: 40 }}>
        <div className="text-center mb-24">
          <div className="store-avatar" style={{ width: 56, height: 56, margin: '0 auto 12px', background: 'rgba(250,204,21,0.18)', color: 'var(--yellow)' }}><i className="fa-solid fa-store"></i></div>
          <h1 className="h-lg">¿Cómo se llama tu comercio?</h1>
          <p className="text-sm muted">Así aparecés ante la plataforma (el mecánico te ve anónimo).</p>
        </div>
        <div className="field"><input className="input" placeholder="Nombre del comercio" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="chip-row mb-16">{sug.map((s) => <button key={s} className="chip" onClick={() => setName(s)}>{s}</button>)}</div>
        <label className="flex-center gap-8 mb-16" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span className="text-sm subtle">Acepto los <Link href="/terminos" className="text-purple" style={{ fontWeight: 600 }}>Términos y Condiciones</Link></span>
        </label>
        <button className="btn btn-yellow btn-block btn-lg" disabled={!name.trim() || !accepted} onClick={enter}>Entrar</button>
      </div>
    </div>
  );
}

function Panel({ store, onChange }) {
  const [tab, setTab] = useState('pend');
  const [modal, setModal] = useState(null);
  const [info, setInfo] = useState(null);
  const [help, setHelp] = useState(false);
  const [dismissed, setDismissed] = useState([]);
  const requests = useRequests();
  const badge = tierFor('store', 312);

  const quoted = storeQuotedRequestIds(store);
  const open = requests.filter((r) => r.status === 'open');
  const pend = open.filter((r) => !quoted.has(r.id) && !dismissed.includes(r.id));
  const cot = requests.filter((r) => quoted.has(r.id) && r.status !== 'paid');
  const ent = requests.filter((r) => r.status === 'paid' && quoted.has(r.id));
  const initials = store.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  const label = (r) => r.desc || r.catLabel || 'Repuesto';
  const veh = (r) => `${r.brand || ''} ${r.model || ''} ${r.year || ''}`.trim();

  async function sendQuote(price, partBrand, note, photos) {
    await addQuote({ requestId: modal.id, storeName: store, partBrand, price: Number(String(price).replace(/\D/g, '')) || 0, note, photos });
    setModal(null);
    ping();
    toast({ title: 'Cotización enviada', sub: 'Se revela al mecánico al cerrarse la ventana', icon: 'fa-paper-plane', type: 'green' });
  }

  async function askInfo(r, items, text) {
    const prev = getRequest(r.id)?.infoRequests || [];
    await updateRequest(r.id, { infoRequests: [...prev, { store, items, text, at: Date.now() }] });
    setInfo(null);
    toast({ title: 'Le pedimos más info al mecánico', sub: 'Te avisamos cuando responda', icon: 'fa-circle-question', type: 'purple' });
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Panel Comercio</span></Link>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={() => setHelp(true)} title="Ayuda"><i className="fa-regular fa-circle-question"></i></button>
          <button className="icon-btn" onClick={() => { setSellerName(''); onChange(); }} title="Cambiar comercio"><i className="fa-solid fa-right-left"></i></button>
          <div className="avatar" style={{ background: 'linear-gradient(135deg,var(--yellow),var(--purple))' }}>{initials}</div>
        </div>
      </div>

      <div className="container">
        <div className="mb-16">
          <div className="eyebrow">{store}</div>
          <h1 className="h-lg">Solicitudes entrantes</h1>
          <p className="text-sm muted">Respondé rápido = ganás la venta</p>
        </div>

        <div className="card glow mb-16" style={{ background: 'linear-gradient(135deg,rgba(250,204,21,0.16),rgba(31,41,55,0.6))' }}>
          <div className="flex-between mb-12">
            <div className="flex-center gap-12">
              <div className="avatar" style={{ width: 46, height: 46, fontSize: 16, background: 'linear-gradient(135deg,var(--yellow),var(--purple))' }}>{initials}</div>
              <div><div style={{ fontWeight: 800 }}>{store}</div><div className="mt-4"><span className={`rep-badge ${badge.cls}`}><i className={`fa-solid ${badge.icon}`}></i> {badge.label}</span></div></div>
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
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value">{cot.length}</div><div className="stat-label">Cotizadas</div></div>
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value text-green">{ent.length}</div><div className="stat-label">Concretadas</div></div>
        </div>

        <div className="pill-tabs mb-16">
          <button className={tab === 'pend' ? 'active' : ''} onClick={() => setTab('pend')}>Pendientes <span className="badge badge-yellow" style={{ marginLeft: 4 }}>{pend.length}</span></button>
          <button className={tab === 'cot' ? 'active' : ''} onClick={() => setTab('cot')}>Cotizadas</button>
          <button className={tab === 'ent' ? 'active' : ''} onClick={() => setTab('ent')}>Concretadas</button>
        </div>

        {tab === 'pend' && (
          pend.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-inbox"></i></div><div className="text-sm">Sin solicitudes pendientes</div><div className="text-xs">Cuando un mecánico genere un pedido, aparece acá</div></div>
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
                  <div className="flex-center gap-8" style={{ flexWrap: 'wrap' }}>
                    <span className="badge badge-gray"><i className="fa-solid fa-layer-group"></i> {r.catLabel}</span>
                    <span className="badge badge-gray"><i className="fa-solid fa-file-invoice"></i> {r.invoiceType === 'factura_a' ? 'Factura A' : 'Cons. Final'}</span>
                    {r.urgency === 'Necesito ahora' && <span className="badge badge-red"><i className="fa-solid fa-bolt"></i> Urgente</span>}
                  </div>
                  {r.photo && <span className="badge badge-purple"><i className="fa-solid fa-image"></i> con foto</span>}
                </div>

                {r.invoiceType === 'factura_a' && (
                  <div className="float-notif mb-12" style={{ padding: '10px 12px' }}>
                    <i className="fa-solid fa-file-invoice text-yellow"></i>
                    <div className="text-xs subtle"><b>Factura A.</b> Emisor: {r.emisorRazon} (CUIT {r.emisorCuit}) · Solicitante: {r.solicRazon} (CUIT {r.solicCuit})</div>
                  </div>
                )}

                {r.extraInfo && (
                  <div className="float-notif mb-12" style={{ padding: '10px 12px' }}>
                    <i className="fa-solid fa-circle-info text-green"></i>
                    <div className="text-xs subtle"><b>Info extra del mecánico:</b> {r.extraInfo}</div>
                  </div>
                )}

                <div className="locked-info mb-12"><i className="fa-solid fa-user-secret"></i> Mecánico anónimo hasta concretar</div>

                <div className="flex-between mb-12">
                  <button className="btn btn-ghost btn-sm" onClick={() => setInfo(r)}><i className="fa-regular fa-circle-question"></i> ¿Dudas? Pedir info</button>
                  {r.infoRequests?.length ? <span className="badge badge-purple"><i className="fa-solid fa-clock"></i> info pedida</span> : null}
                </div>

                <div className="flex gap-12">
                  <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto' }} onClick={() => { setDismissed((d) => [...d, r.id]); toast({ title: 'Marcado sin disponibilidad', sub: 'No penaliza tu balance', icon: 'fa-ban', type: 'purple' }); }}><i className="fa-solid fa-ban"></i> Sin stock</button>
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
              const my = getQuotes(r.id).filter((q) => q.storeName === store)[0];
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
            ent.map((r) => <EntregaCard key={r.id} r={r} store={store} label={label(r)} veh={veh(r)} />)
          )
        )}
      </div>

      {modal && <CotizarModal lead={modal} label={label(modal)} veh={veh(modal)} onClose={() => setModal(null)} onSend={sendQuote} />}
      {info && <PedirInfoModal lead={info} label={label(info)} onClose={() => setInfo(null)} onSend={(items, text) => askInfo(info, items, text)} />}
      {help && <HelpSheet onClose={() => setHelp(false)} />}
    </div>
  );
}

function EntregaCard({ r, store, label, veh }) {
  const my = getQuotes(r.id).filter((q) => q.storeName === store)[0];
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
  const [photos, setPhotos] = useState([]);
  const fileRef = useRef(null);

  async function onPick(e) {
    const files = [...e.target.files].slice(0, 3 - photos.length);
    for (const f of files) {
      try { const t = await fileToThumb(f); setPhotos((p) => (p.length < 3 ? [...p, t] : p)); } catch (err) {}
    }
    e.target.value = '';
  }

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
        <div className="field">
          <label>Fotos de la pieza <span className="muted">(hasta 3, opcional)</span></label>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPick} />
          <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
            {photos.map((src, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={src} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
                <button onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>✕</button>
              </div>
            ))}
            {photos.length < 3 && (
              <button className="upload-area" style={{ width: 64, height: 64, padding: 0, display: 'grid', placeItems: 'center' }} onClick={() => fileRef.current?.click()}>
                <i className="fa-solid fa-camera"></i>
              </button>
            )}
          </div>
        </div>
        <div className="field"><label>Notas <span className="muted">(opcional)</span></label><textarea className="textarea" placeholder="Stock disponible, garantía, etc." value={note} onChange={(e) => setNote(e.target.value)}></textarea></div>
        <div className="flex gap-12">
          <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-yellow btn-block" disabled={!price} onClick={() => onSend(price, brand, note, photos)}><i className="fa-solid fa-paper-plane"></i> Enviar Cotización</button>
        </div>
      </div>
    </div>
  );
}

const CANNED = [
  'Mandá una foto de la pieza',
  'Indicá el lado/posición (izq/der, del/tras)',
  'Pasá el número de parte (si lo tenés)',
  '¿Original o alternativo?',
  'Confirmá el motor / versión',
];

function PedirInfoModal({ lead, label, onClose, onSend }) {
  const [sel, setSel] = useState([]);
  const [text, setText] = useState('');
  const toggle = (q) => setSel((s) => (s.includes(q) ? s.filter((x) => x !== q) : [...s, q]));
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-handle"></div>
        <h2 className="h-md mb-4">Pedir más info</h2>
        <p className="text-sm muted mb-16">{label} · #{lead.id} — elegí qué necesitás saber</p>
        <div className="flex-col gap-8 mb-16">
          {CANNED.map((q) => (
            <button key={q} className={`card hoverable ${sel.includes(q) ? 'glow' : ''}`} style={{ padding: '12px 14px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }} onClick={() => toggle(q)}>
              <i className={`fa-${sel.includes(q) ? 'solid fa-circle-check text-yellow' : 'regular fa-circle'}`}></i>
              <span className="text-sm">{q}</span>
            </button>
          ))}
        </div>
        <div className="field"><label>Otra consulta <span className="muted">(opcional)</span></label><textarea className="textarea" placeholder="Escribí tu pregunta…" value={text} onChange={(e) => setText(e.target.value)}></textarea></div>
        <div className="flex gap-12">
          <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-block" disabled={!sel.length && !text.trim()} onClick={() => onSend(sel, text.trim())}><i className="fa-solid fa-paper-plane"></i> Pedir al mecánico</button>
        </div>
      </div>
    </div>
  );
}

function HelpSheet({ onClose }) {
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-handle"></div>
        <h2 className="h-md mb-4">Ayuda para cotizar</h2>
        <p className="text-sm muted mb-16">Tips rápidos para responder bien y ganar la venta.</p>
        <div className="flex-col gap-12 mb-16">
          <HelpRow icon="fa-bolt" t="Respondé rápido" d="La cotización más rápida y mejor calificada se muestra primero." />
          <HelpRow icon="fa-circle-question" t="¿No entendés el pedido?" d="Tocá “¿Dudas? Pedir info” en la solicitud y mandale preguntas al mecánico." />
          <HelpRow icon="fa-camera" t="Sumá fotos" d="Podés adjuntar hasta 3 fotos de la pieza para dar confianza." />
          <HelpRow icon="fa-ban" t="Sin stock" d="Si no la tenés, marcá “Sin stock”: no te penaliza." />
          <HelpRow icon="fa-user-secret" t="Anonimato" d="El mecánico no ve tu nombre hasta que se concreta la venta." />
        </div>
        <button className="btn btn-yellow btn-block" onClick={onClose}>Entendido</button>
      </div>
    </div>
  );
}
function HelpRow({ icon, t, d }) {
  return (
    <div className="flex-center gap-12">
      <div className="store-avatar" style={{ width: 38, height: 38 }}><i className={`fa-solid ${icon}`}></i></div>
      <div style={{ flex: 1 }}><div className="text-sm" style={{ fontWeight: 700 }}>{t}</div><div className="text-xs muted">{d}</div></div>
    </div>
  );
}
