'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { money, ping, toast, fmtTime } from '@/lib/ui';
import Stars from '@/components/Stars';
import { getRequestForMechanic, acceptQuote, reopenWindow, closeWindow } from '@/app/actions/data';

export default function Cotizaciones() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [id, setId] = useState(null);
  const [request, setRequest] = useState(null);
  const [now, setNow] = useState(0);
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(null);
  const announced = useRef(false);

  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    const rid = new URLSearchParams(window.location.search).get('id');
    setId(rid);
    if (!rid) return;
    let alive = true;
    const load = async () => { const r = await getRequestForMechanic(rid); if (alive) setRequest(r); };
    load();
    const t = setInterval(load, 3000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; clearInterval(t); clearInterval(c); };
  }, []);

  const endsAt = request?.windowEndsAt || 0;
  const secs = endsAt ? Math.max(0, Math.round((endsAt - now) / 1000)) : 0;
  const revealed = (!!endsAt && now >= endsAt) || ['CLOSED', 'PAID'].includes(request?.status);
  const quotes = (request?.quotes || []).slice().sort((a, b) => b.rating - a.rating);

  useEffect(() => {
    if (revealed && !announced.current && request) {
      announced.current = true; ping();
      toast({ title: quotes.length ? 'Ventana cerrada' : 'Ventana cerrada · sin ofertas', sub: quotes.length ? `${quotes.length} oferta(s)` : 'Podés reintentar', icon: 'fa-flag-checkered', type: quotes.length ? 'yellow' : 'purple' });
    }
  }, [revealed]); // eslint-disable-line

  async function choose(q) { setSelected(q.id); sessionStorage.setItem('rat_selectedQuote', JSON.stringify({ ...q, requestId: id })); }
  async function continuar() {
    const q = quotes.find((x) => x.id === selected); if (!q) return;
    const res = await acceptQuote(q.id);
    if (res?.error) { toast({ title: res.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
    router.push('/mecanico/pago');
  }
  async function retry() { announced.current = false; await reopenWindow(id); const r = await getRequestForMechanic(id); setRequest(r); }
  async function cerrar() { await closeWindow(id); const r = await getRequestForMechanic(id); setRequest(r); }

  const veh = request ? `${request.brand || ''} ${request.model || ''} ${request.year || ''}`.trim() : '—';
  const part = request ? (request.desc || request.catLabel) : '—';

  if (!mounted) {
    return <div className="app-shell"><div className="container" style={{ paddingTop: 80, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }}></div></div></div>;
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="flex-center">
          <Link href="/mecanico" className="icon-btn"><i className="fa-solid fa-arrow-left"></i></Link>
          <div><div style={{ fontWeight: 800 }}>Cotizaciones</div><div className="text-xs muted">{request ? `Pedido #${request.code}` : 'Cargando…'}</div></div>
        </div>
        <div className="icon-btn"><i className="fa-solid fa-tower-broadcast text-purple"></i></div>
      </div>

      <div className="container">
        {!request ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-clipboard-question"></i></div><div className="text-sm">No hay un pedido para mostrar</div><div className="text-xs mb-16">Creá un pedido para empezar</div><Link href="/mecanico/pedido" className="btn btn-primary btn-sm"><i className="fa-solid fa-plus"></i> Nuevo pedido</Link></div>
        ) : (
          <>
            <div className="card glow mb-16" style={{ textAlign: 'center', background: 'linear-gradient(135deg,rgba(109,40,217,0.25),rgba(11,11,15,0.4))' }}>
              <div className="text-xs muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>{revealed ? 'Ventana cerrada · ofertas' : 'Ventana de ofertas — se revelan al cerrarse'}</div>
              <div className="countdown-big text-yellow">{fmtTime(secs)}</div>
              {!revealed && <button className="btn btn-ghost btn-sm mt-12" onClick={cerrar}><i className="fa-solid fa-flag-checkered"></i> Cerrar y ver ofertas</button>}
            </div>

            <div className="card mb-16" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
              <div className="store-avatar" style={{ width: 38, height: 38 }}><i className="fa-solid fa-car"></i></div>
              <div style={{ flex: 1 }}><div className="text-sm" style={{ fontWeight: 700 }}>{veh}</div><div className="text-xs muted">{request.catLabel} · {part}</div></div>
              <span className="badge badge-gray">#{request.code}</span>
            </div>

            {!revealed ? (
              <div className="card text-center" style={{ padding: 28 }}>
                <div className="spinner" style={{ margin: '0 auto 14px' }}></div>
                <div className="text-sm" style={{ fontWeight: 700 }}>Esperando que los comercios coticen…</div>
                <div className="text-xs muted mt-4">Las ofertas se muestran todas juntas al cerrar la ventana.</div>
                {quotes.length > 0 && <div className="badge badge-yellow mt-12"><i className="fa-solid fa-tags"></i> {quotes.length} cotización(es) recibida(s)</div>}
              </div>
            ) : quotes.length === 0 ? (
              <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-inbox"></i></div><div className="text-sm">No llegaron ofertas</div><div className="text-xs mb-16">Podés reintentar otra ventana</div><button className="btn btn-primary btn-sm" onClick={retry}><i className="fa-solid fa-rotate-right"></i> Reintentar</button></div>
            ) : (
              <>
                <div className="section-title"><h2>Ofertas recibidas ({quotes.length})</h2><span className="text-xs muted">orden por calificación</span></div>
                <div className="flex-col gap-12">
                  {quotes.map((q) => (
                    <div key={q.id} className={`quote-card animate-in ${selected === q.id ? 'selected' : ''}`}>
                      <div className="flex-between mb-12">
                        <div className="flex-center gap-12">
                          <div className="store-avatar"><i className="fa-solid fa-user-secret"></i></div>
                          <div><div style={{ fontWeight: 700, fontSize: 15 }}>{q.alias}</div><div className="text-xs muted"><Stars rating={q.rating} /> {q.rating} · Zona {q.zone}</div></div>
                        </div>
                        <span className="badge badge-green"><i className="fa-solid fa-shield-halved"></i> {q.warranty}</span>
                      </div>
                      <div className="flex-between mb-12">
                        <div><div className="text-xs muted">Marca de la pieza</div><div className="text-sm" style={{ fontWeight: 700 }}>{q.partBrand}</div></div>
                        <div style={{ textAlign: 'right' }}><div className="text-xs muted">Disponibilidad</div><div className="text-sm" style={{ fontWeight: 700 }}><i className="fa-solid fa-circle-check text-green"></i> En stock</div></div>
                      </div>
                      {q.photoUrls?.length > 0 && <div className="flex gap-8 mb-12">{q.photoUrls.map((src, j) => <img key={j} src={src} alt="" onClick={() => setZoom(src)} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }} />)}</div>}
                      {q.note && <div className="text-xs muted mb-12"><i className="fa-solid fa-note-sticky"></i> {q.note}</div>}
                      <div className="divider" style={{ margin: '12px 0' }}></div>
                      <div className="flex-between">
                        <div><div className="text-xs muted">Precio final</div><div className="price">{money(q.price)}</div></div>
                        <button className={`btn btn-sm ${selected === q.id ? 'btn-success' : 'btn-primary'}`} onClick={() => choose(q)}>{selected === q.id ? <><i className="fa-solid fa-check"></i> Elegida</> : 'Elegir oferta'}</button>
                      </div>
                      <div className="locked-info mt-12"><i className="fa-solid fa-lock"></i> Vendedor: <span className="badge badge-gray" style={{ marginLeft: 4 }}>Anónimo hasta concretar</span></div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {selected !== null && (
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, padding: '14px 16px', background: 'linear-gradient(0deg,var(--bg-0),transparent)' }}>
          <button className="btn btn-yellow btn-block btn-lg" onClick={continuar}><i className="fa-solid fa-lock"></i> Continuar al pago</button>
        </div>
      )}

      {zoom && <div onClick={() => setZoom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'grid', placeItems: 'center', padding: 20 }}><img src={zoom} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12 }} /></div>}
    </div>
  );
}
