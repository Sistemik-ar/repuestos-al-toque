'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { money, toast, fmtTime } from '@/lib/ui';
import { usePoll, keep } from '@/lib/usePoll';
import { getJob, closeJobWindow, createJobCheckout, publishJob, setItemCredit } from '@/app/actions/data';

const ITEM_BADGE = {
  OPEN: ['badge-purple', 'Cotizando'], QUOTED: ['badge-purple', 'Cotizando'],
  CLOSED: ['badge-yellow', 'Pendiente de pago'], PAID: ['badge-green', 'Pagado'],
  SHIPPED: ['badge-yellow', 'En camino'], DELIVERED: ['badge-green', 'Entregado'],
  CANCELLED: ['badge-red', 'Cancelado'],
};

export default function Trabajo() {
  const [id, setId] = useState(null);
  const [j, setJ] = useState(null);
  const [now, setNow] = useState(0);
  const [paying, setPaying] = useState(false);
  const [link, setLink] = useState(null); // { link, breakdown }

  useEffect(() => {
    setNow(Date.now());
    setId(new URLSearchParams(window.location.search).get('id'));
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(c);
  }, []);
  usePoll(async () => { if (id) { try { const d = await getJob(id); setJ((p) => keep(p, d)); } catch {} } }, 4000);
  useEffect(() => { if (id) getJob(id).then(setJ); }, [id]);

  const ends = j?.windowEndsAt || 0;
  const secs = ends ? Math.max(0, Math.round((ends - now) / 1000)) : 0;
  const windowOpen = j?.status === 'OPEN' && ends && now < ends;
  const items = j?.items || [];
  const chosen = items.filter((i) => i.selected);
  // una vez generado el link (job CLOSED) o pagado, las elecciones quedan bloqueadas
  const locked = ['CLOSED', 'PAID', 'DONE'].includes(j?.status);

  async function toggleCC(it) {
    const res = await setItemCredit(it.id, !it.useCredit);
    if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
    setJ(await getJob(id));
  }

  async function cerrar() { await closeJobWindow(id); const d = await getJob(id); setJ(d); }
  async function pagar() {
    setPaying(true);
    const res = await createJobCheckout(id);
    setPaying(false);
    if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
    setLink(res);
    toast({ title: 'Link de pago generado', sub: 'Compartilo con el dueño del vehículo', icon: 'fa-link', type: 'green' });
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="flex-center">
          <Link href="/mecanico" className="icon-btn"><i className="fa-solid fa-arrow-left"></i></Link>
          <div><div style={{ fontWeight: 800 }}>{j ? `Trabajo #${j.code}` : 'Trabajo'}</div><div className="text-xs muted">{j ? `${j.brand || ''} ${j.model || ''} · ${j.plate || j.vin || ''}` : 'Cargando…'}</div></div>
        </div>
        {j && <span className="badge badge-gray">{items.length} ítem{items.length === 1 ? '' : 's'}</span>}
      </div>

      <div className="container form-narrow">
        {!j ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-car"></i></div><div className="text-sm">No encontramos el trabajo</div></div>
        ) : (
          <>
            {/* Ventana única del trabajo */}
            {windowOpen && (
              <div className="card glow mb-16" style={{ textAlign: 'center', background: 'linear-gradient(135deg,rgba(109,40,217,0.25),rgba(11,11,15,0.4))' }}>
                <div className="text-xs muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>Los comercios están cotizando todo el trabajo</div>
                <div className="countdown-big text-yellow">{fmtTime(secs)}</div>
                <button className="btn btn-ghost btn-sm mt-12" onClick={cerrar}><i className="fa-solid fa-flag-checkered"></i> Cerrar y elegir</button>
              </div>
            )}

            {j.status === 'DRAFT' && (
              <div className="card mb-16" style={{ borderColor: 'rgba(250,204,21,0.4)' }}>
                <div className="text-sm" style={{ fontWeight: 700 }}><i className="fa-solid fa-pen text-yellow"></i> Trabajo en armado</div>
                <div className="text-xs muted mt-4 mb-12">Los comercios todavía no lo ven. Publicalo cuando esté completo.</div>
                <div className="flex gap-12">
                  <Link href="/mecanico/pedido" className="btn btn-ghost btn-sm">Seguir agregando</Link>
                  <button className="btn btn-yellow btn-block btn-sm" onClick={async () => { await publishJob(id); setJ(await getJob(id)); }}><i className="fa-solid fa-paper-plane"></i> Publicar ahora</button>
                </div>
              </div>
            )}

            {/* Ítems */}
            <div className="section-title"><h2>Repuestos del trabajo</h2><span className="text-xs muted">{chosen.length}/{items.length} elegidos</span></div>
            {items.map((it) => {
              const [cls, txt] = ITEM_BADGE[it.status] || ['badge-gray', it.status];
              return (
                <div className="card mb-12" key={it.id}>
                  <div className="flex-between mb-8">
                    <div className="flex-center gap-12"><div className="store-avatar" style={{ width: 36, height: 36 }}><i className="fa-solid fa-box"></i></div><div><div className="text-sm" style={{ fontWeight: 700 }}>{it.desc || it.catLabel}</div><div className="text-xs muted">{it.catLabel} · {it.quotesCount} cotización{it.quotesCount === 1 ? '' : 'es'}</div></div></div>
                    <span className={`badge ${cls}`}>{txt}</span>
                  </div>
                  {it.selected ? (
                    <div className="flex-between">
                      <span className="text-xs muted"><i className="fa-solid fa-user-secret"></i> {it.selected.alias} · {it.selected.partBrand}</span>
                      <span className="price" style={{ fontSize: 16 }}>{money(it.selected.price)}{it.useCredit && <span className="badge badge-purple" style={{ marginLeft: 6 }}>CC</span>}</span>
                    </div>
                  ) : ['OPEN', 'QUOTED', 'CLOSED'].includes(it.status) && !locked ? (
                    <Link href={`/mecanico/cotizaciones?id=${it.id}&job=${j.id}`} className="btn btn-primary btn-sm btn-block"><i className="fa-solid fa-tags"></i> Ver cotizaciones {it.quotesCount > 0 ? `(${it.quotesCount})` : ''}</Link>
                  ) : <Link href={`/mecanico/detalle?id=${it.id}`} className="btn btn-ghost btn-sm btn-block">Ver detalle</Link>}
                  {/* cuenta corriente por ítem (solo antes de generar el link) */}
                  {it.selected && it.creditEligible && !locked && (
                    <label className="flex-between mt-12" style={{ cursor: 'pointer', gap: 10 }}>
                      <span className="text-xs subtle"><i className="fa-solid fa-id-card-clip text-purple"></i> Pagar este repuesto con Cuenta Corriente <span className="muted">(acá solo pagás comisión + envío)</span></span>
                      <input type="checkbox" checked={!!it.useCredit} onChange={() => toggleCC(it)} />
                    </label>
                  )}
                  {it.selected && ['OPEN', 'QUOTED', 'CLOSED'].includes(it.status) && !locked && (
                    <Link href={`/mecanico/cotizaciones?id=${it.id}&job=${j.id}`} className="text-xs text-purple" style={{ fontWeight: 700 }}>Cambiar elección →</Link>
                  )}
                </div>
              );
            })}

            {/* Checkout agrupado */}
            {chosen.length > 0 && j.status !== 'PAID' && (
              <div className="card glow mb-16">
                <div className="section-title"><h2>Pago del trabajo</h2><span className="text-xs muted">{chosen.length} ítem{chosen.length === 1 ? '' : 's'}</span></div>
                {locked && <div className="float-notif mb-12" style={{ padding: '10px 12px' }}><i className="fa-solid fa-lock text-yellow"></i><div className="text-xs subtle">Link generado: las elecciones quedaron bloqueadas. Si necesitás cambiar algo, cancelá y creá un trabajo nuevo.</div></div>}
                {link?.breakdown && (
                  <div className="mb-12">
                    <div className="flex-between mb-8"><span className="text-sm muted">Repuestos ({link.breakdown.items})</span><span className="text-sm" style={{ fontWeight: 700 }}>{money(link.breakdown.parts)}</span></div>
                    {link.breakdown.creditParts > 0 && <div className="flex-between mb-8"><span className="text-sm muted"><i className="fa-solid fa-id-card-clip text-purple"></i> A cuenta corriente (no se cobra acá)</span><span className="text-sm" style={{ fontWeight: 700, textDecoration: 'line-through', opacity: 0.6 }}>{money(link.breakdown.creditParts)}</span></div>}
                    <div className="flex-between mb-8"><span className="text-sm muted">Comisión</span><span className="text-sm" style={{ fontWeight: 700 }}>{money(link.breakdown.commission)}</span></div>
                    <div className="flex-between mb-8"><span className="text-sm muted">Envío ({link.breakdown.stores} comercio{link.breakdown.stores === 1 ? '' : 's'}, una sola visita)</span><span className="text-sm" style={{ fontWeight: 700 }}>{money(link.breakdown.ship)}</span></div>
                    {link.breakdown.mpFee > 0 && <div className="flex-between mb-8"><span className="text-sm muted">Recargo MP</span><span className="text-sm" style={{ fontWeight: 700 }}>{money(link.breakdown.mpFee)}</span></div>}
                    <div className="divider"></div>
                    <div className="flex-between mt-8"><span className="h-md">Total</span><span className="h-md text-yellow">{money(link.breakdown.total)}</span></div>
                  </div>
                )}
                {!link ? (
                  <button className="btn btn-yellow btn-block btn-lg" disabled={paying} onClick={pagar}>{paying ? <span className="spinner"></span> : <><i className="fa-solid fa-link"></i> Generar link de pago ({chosen.length} ítem{chosen.length === 1 ? '' : 's'})</>}</button>
                ) : (
                  <>
                    <div className="card flex-between mb-12" style={{ padding: '10px 12px', background: 'var(--bg-1)' }}><span className="text-xs" style={{ wordBreak: 'break-all', color: 'var(--purple-light)' }}>{link.link}</span></div>
                    <div className="flex gap-12">
                      <button className="btn btn-ghost btn-block btn-sm" onClick={() => { navigator.clipboard?.writeText(link.link); toast({ title: 'Link copiado', icon: 'fa-copy', type: 'green' }); }}><i className="fa-solid fa-copy"></i> Copiar</button>
                      <a className="btn btn-success btn-block btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`Hola! Los repuestos de tu ${j.brand || ''} ${j.model || ''} (${j.plate}) están listos para pagar: ${link.link}`)}`} target="_blank" rel="noopener"><i className="fa-brands fa-whatsapp"></i> Mandar al dueño</a>
                    </div>
                    <a className="btn btn-primary btn-block mt-12" href={link.link}><i className="fa-solid fa-credit-card"></i> O pagar yo ahora</a>
                  </>
                )}
                <div className="text-xs muted mt-8"><i className="fa-solid fa-clock"></i> El link vence a las 24hs; después el trabajo se cancela.</div>
              </div>
            )}

            {j.status === 'PAID' && (
              <div className="card glow mb-16" style={{ textAlign: 'center', borderColor: 'rgba(34,197,94,0.4)' }}>
                <div className="store-avatar" style={{ margin: '0 auto 10px', background: 'rgba(34,197,94,0.16)', color: '#4ADE80' }}><i className="fa-solid fa-check"></i></div>
                <div className="h-md">Trabajo pagado</div>
                <div className="text-xs muted mt-4">Tu pedido incluye productos de {[...new Set(chosen.map((c) => c.selected?.alias))].length} proveedor(es) y se entrega consolidado. Seguí cada ítem desde su detalle.</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
