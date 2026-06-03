'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { money, ping, toast, fmtTime } from '@/lib/ui';
import Stars from '@/components/Stars';
import { getRequest, getQuotes, getOpenRequests, getRequests, updateRequest } from '@/lib/store';

// En producción la ventana es de 10 minutos. Botón "ver ahora" para no esperar en la demo.
const WINDOW = 600;

export default function Cotizaciones() {
  const router = useRouter();
  const [id, setId] = useState(null);
  const [request, setRequest] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [secs, setSecs] = useState(WINDOW);
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [infoText, setInfoText] = useState('');
  const revealedRef = useRef(false);

  async function addInfo() {
    if (!infoText.trim() || !id) return;
    await updateRequest(id, { extraInfo: infoText.trim(), infoRequests: [] });
    setInfoText('');
    toast({ title: 'Info enviada al vendedor', icon: 'fa-paper-plane', type: 'green' });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let rid = params.get('id');
    if (!rid) { rid = getOpenRequests()[0]?.id || getRequests()[0]?.id || null; }
    setId(rid);
    const load = () => {
      setRequest(getRequest(rid));
      setQuotes(getQuotes(rid).sort((a, b) => b.rating - a.rating));
    };
    load();
    window.addEventListener('rat-db', load);
    window.addEventListener('storage', load);
    return () => { window.removeEventListener('rat-db', load); window.removeEventListener('storage', load); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setSecs((s) => {
        if (s <= 1 && !revealedRef.current) { reveal(); return 0; }
        return s > 0 ? s - 1 : 0;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  function reveal() {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setRevealed(true);
    ping();
    const n = getQuotes(id || '').length;
    toast({ title: n ? 'Ventana cerrada' : 'Ventana cerrada · sin ofertas', sub: n ? `${n} oferta(s) recibidas` : 'Podés reintentar', icon: 'fa-flag-checkered', type: n ? 'yellow' : 'purple' });
  }
  function retry() { revealedRef.current = false; setRevealed(false); setSecs(WINDOW); }

  function choose(i) {
    setSelected(i);
    sessionStorage.setItem('rat_selectedQuote', JSON.stringify({ ...quotes[i], requestId: id }));
  }

  const veh = request ? `${request.brand || ''} ${request.model || ''} ${request.year || ''}`.trim() : '—';
  const part = request ? (request.desc || request.catLabel) : '—';

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="flex-center">
          <Link href="/mecanico" className="icon-btn"><i className="fa-solid fa-arrow-left"></i></Link>
          <div>
            <div style={{ fontWeight: 800 }}>Cotizaciones</div>
            <div className="text-xs muted">{id ? `Pedido #${id}` : 'Sin pedido'}</div>
          </div>
        </div>
        <div className="icon-btn"><i className="fa-solid fa-tower-broadcast text-purple"></i></div>
      </div>

      <div className="container">
        {!request ? (
          <div className="empty-state">
            <div className="empty-icon"><i className="fa-solid fa-clipboard-question"></i></div>
            <div className="text-sm">No hay un pedido para mostrar</div>
            <div className="text-xs mb-16">Creá un pedido para empezar a recibir ofertas</div>
            <Link href="/mecanico/pedido" className="btn btn-primary btn-sm"><i className="fa-solid fa-plus"></i> Nuevo pedido</Link>
          </div>
        ) : (
          <>
            <div className="card glow mb-16" style={{ textAlign: 'center', background: 'linear-gradient(135deg,rgba(109,40,217,0.25),rgba(11,11,15,0.4))' }}>
              <div className="text-xs muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {revealed ? 'Ventana cerrada · ofertas' : 'Ventana de ofertas — se revelan al cerrarse'}
              </div>
              <div className="countdown-big text-yellow">{fmtTime(secs)}</div>
              {!revealed && (
                <button className="btn btn-ghost btn-sm mt-12" onClick={reveal}><i className="fa-solid fa-eye"></i> Ver ofertas ahora (demo)</button>
              )}
            </div>

            <div className="card mb-16" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
              <div className="store-avatar" style={{ width: 38, height: 38 }}><i className="fa-solid fa-car"></i></div>
              <div style={{ flex: 1 }}><div className="text-sm" style={{ fontWeight: 700 }}>{veh}</div><div className="text-xs muted">{request.catLabel} · {part}</div></div>
              <span className="badge badge-gray">#{id}</span>
            </div>

            {request.infoRequests?.length > 0 && (
              <div className="card glow mb-16" style={{ borderColor: 'rgba(250,204,21,0.4)' }}>
                <div className="flex-center gap-8 mb-8"><i className="fa-solid fa-circle-question text-yellow"></i><b className="text-sm">Un vendedor te pide más info</b></div>
                <ul className="text-sm subtle" style={{ margin: '0 0 10px', paddingLeft: 18 }}>
                  {[...new Set(request.infoRequests.flatMap((x) => [...(x.items || []), ...(x.text ? [x.text] : [])]))].map((q, i) => <li key={i}>{q}</li>)}
                </ul>
                <div className="flex gap-8">
                  <input className="input" placeholder="Respondé o agregá info…" value={infoText} onChange={(e) => setInfoText(e.target.value)} />
                  <button className="btn btn-yellow btn-sm" style={{ flex: '0 0 auto' }} onClick={addInfo}><i className="fa-solid fa-paper-plane"></i></button>
                </div>
              </div>
            )}
            {request.extraInfo && (
              <div className="float-notif mb-16"><i className="fa-solid fa-circle-check text-green"></i><div className="text-xs subtle">Agregaste: <b>{request.extraInfo}</b></div></div>
            )}

            {!revealed ? (
              <div className="card text-center" style={{ padding: 28 }}>
                <div className="spinner" style={{ margin: '0 auto 14px' }}></div>
                <div className="text-sm" style={{ fontWeight: 700 }}>Esperando que los comercios coticen…</div>
                <div className="text-xs muted mt-4">Las ofertas se muestran todas juntas al cerrarse la ventana.</div>
              </div>
            ) : quotes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><i className="fa-solid fa-inbox"></i></div>
                <div className="text-sm">No llegaron ofertas en esta ventana</div>
                <div className="text-xs mb-16">Podés reintentar por otra ventana</div>
                <button className="btn btn-primary btn-sm" onClick={retry}><i className="fa-solid fa-rotate-right"></i> Reintentar</button>
              </div>
            ) : (
              <>
                <div className="section-title"><h2>Ofertas recibidas ({quotes.length})</h2><span className="text-xs muted">orden por calificación</span></div>
                <div className="flex-col gap-12">
                  {quotes.map((q, i) => (
                    <div key={q.id} className={`quote-card animate-in ${selected === i ? 'selected' : ''}`}>
                      <div className="flex-between mb-12">
                        <div className="flex-center gap-12">
                          <div className="store-avatar"><i className="fa-solid fa-user-secret"></i></div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{q.alias}</div>
                            <div className="text-xs muted"><Stars rating={q.rating} /> {q.rating} · Zona {q.zone}</div>
                          </div>
                        </div>
                        <span className="badge badge-green"><i className="fa-solid fa-shield-halved"></i> {q.warranty}</span>
                      </div>
                      <div className="flex-between mb-12">
                        <div><div className="text-xs muted">Marca de la pieza</div><div className="text-sm" style={{ fontWeight: 700 }}>{q.partBrand}</div></div>
                        <div style={{ textAlign: 'right' }}><div className="text-xs muted">Disponibilidad</div><div className="text-sm" style={{ fontWeight: 700 }}><i className="fa-solid fa-circle-check text-green"></i> En stock</div></div>
                      </div>
                      {q.photos?.length > 0 && (
                        <div className="flex gap-8 mb-12">
                          {q.photos.map((src, j) => <img key={j} src={src} alt="" onClick={() => setZoom(src)} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }} />)}
                        </div>
                      )}
                      {q.note && <div className="text-xs muted mb-12"><i className="fa-solid fa-note-sticky"></i> {q.note}</div>}
                      <div className="divider" style={{ margin: '12px 0' }}></div>
                      <div className="flex-between">
                        <div><div className="text-xs muted">Precio final</div><div className="price">{money(q.price)}</div></div>
                        <button className={`btn btn-sm ${selected === i ? 'btn-success' : 'btn-primary'}`} onClick={() => choose(i)}>
                          {selected === i ? <><i className="fa-solid fa-check"></i> Elegida</> : 'Elegir oferta'}
                        </button>
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
          <button className="btn btn-yellow btn-block btn-lg" onClick={() => router.push('/mecanico/pago')}>
            <i className="fa-solid fa-lock"></i> Continuar al pago
          </button>
        </div>
      )}

      {zoom && (
        <div onClick={() => setZoom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'grid', placeItems: 'center', padding: 20 }}>
          <img src={zoom} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12 }} />
        </div>
      )}
    </div>
  );
}
