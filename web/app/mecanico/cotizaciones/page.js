'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { data } from '@/lib/data';
import { money, ping, toast, fmtTime } from '@/lib/ui';
import Stars from '@/components/Stars';

// En producción la ventana es de 10 minutos. Acelerada para poder probar la demo.
const DEMO_SECONDS = 10;

export default function Cotizaciones() {
  const router = useRouter();
  const [secs, setSecs] = useState(DEMO_SECONDS);
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState(null);
  const [adIdx, setAdIdx] = useState(0);
  const [req, setReq] = useState(null);
  const done = useRef(false);

  // Ordenadas por calificación del vendedor (decisión de producto)
  const quotes = [...data.quotePool].sort((a, b) => b.rating - a.rating);

  useEffect(() => {
    try { setReq(JSON.parse(sessionStorage.getItem('rat_request'))); } catch {}
    const id = setInterval(() => {
      setSecs((s) => {
        if (s <= 1 && !done.current) {
          done.current = true;
          setRevealed(true);
          ping();
          toast({ title: 'Llegaron las cotizaciones', sub: `${quotes.length} comercios respondieron`, icon: 'fa-tags', type: 'yellow' });
          return 0;
        }
        return s > 0 ? s - 1 : 0;
      });
    }, 1000);
    const ad = setInterval(() => setAdIdx((i) => (i + 1) % data.ads.length), 2500);
    return () => { clearInterval(id); clearInterval(ad); };
  }, []);

  function choose(i) {
    setSelected(i);
    sessionStorage.setItem('rat_selectedQuote', JSON.stringify(quotes[i]));
  }

  const ad = data.ads[adIdx];
  const veh = req ? `${req.brand || 'Toyota'} ${req.model || 'Hilux'} ${req.year || '2019'}` : 'Toyota Hilux 2019';
  const cat = req ? `${req.catLabel || 'Frenos'} · ${(req.desc || 'Pastillas delanteras').slice(0, 40)}` : 'Frenos · Pastillas delanteras';

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="flex-center">
          <Link href="/mecanico" className="icon-btn"><i className="fa-solid fa-arrow-left"></i></Link>
          <div>
            <div style={{ fontWeight: 800 }}>Cotizaciones</div>
            <div className="text-xs muted">Pedido #1042 · Pastillas de freno</div>
          </div>
        </div>
        <div className="icon-btn"><i className="fa-solid fa-tower-broadcast text-purple"></i></div>
      </div>

      <div className="container">
        {/* Header ventana */}
        <div className="card glow mb-16" style={{ textAlign: 'center', background: 'linear-gradient(135deg,rgba(109,40,217,0.25),rgba(11,11,15,0.4))' }}>
          <div className="text-xs muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {revealed ? 'Ventana cerrada · ofertas recibidas' : 'Ventana de ofertas — se revelan al cerrarse'}
          </div>
          <div className="countdown-big text-yellow">{fmtTime(secs)}</div>
          <div className="flex-center" style={{ justifyContent: 'center', gap: 18, marginTop: 14 }}>
            <span className="badge badge-purple"><i className="fa-solid fa-store"></i> 3 comercios notificados</span>
            <span className="badge badge-yellow"><i className="fa-solid fa-bolt"></i> Necesito ahora</span>
          </div>
        </div>

        {/* Vehículo */}
        <div className="card mb-16" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
          <div className="store-avatar" style={{ width: 38, height: 38 }}><i className="fa-solid fa-car"></i></div>
          <div style={{ flex: 1 }}><div className="text-sm" style={{ fontWeight: 700 }}>{veh}</div><div className="text-xs muted">{cat}</div></div>
          <span className="badge badge-gray">#1042</span>
        </div>

        {!revealed ? (
          <>
            {/* Promo durante la espera (marca + descuento) */}
            <div className="mb-16">
              <div className="promo-card promo-fade">
                <div className="promo-img" style={{ background: ad.color }}><i className={`fa-solid ${ad.icon}`}></i></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-sm" style={{ fontWeight: 700 }}>{ad.store}</div>
                  <span className="badge badge-yellow" style={{ marginTop: 5 }}>{ad.discount}</span>
                </div>
                <span className="promo-tag">Promocionado</span>
              </div>
            </div>
            <div className="card text-center" style={{ padding: 28 }}>
              <div className="spinner" style={{ margin: '0 auto 14px' }}></div>
              <div className="text-sm" style={{ fontWeight: 700 }}>Los comercios están cotizando…</div>
              <div className="text-xs muted mt-4">Para que sea parejo, las ofertas se muestran todas juntas al cerrarse la ventana.</div>
            </div>
          </>
        ) : (
          <>
            <div className="section-title"><h2>Ofertas recibidas ({quotes.length})</h2><span className="text-xs muted">orden por calificación</span></div>
            <div className="flex-col gap-12">
              {quotes.map((q, i) => (
                <div key={i} className={`quote-card animate-in ${selected === i ? 'selected' : ''}`}>
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
      </div>

      {selected !== null && (
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, padding: '14px 16px', background: 'linear-gradient(0deg,var(--bg-0),transparent)' }}>
          <button className="btn btn-yellow btn-block btn-lg" onClick={() => router.push('/mecanico/pago')}>
            <i className="fa-solid fa-lock"></i> Continuar al pago
          </button>
        </div>
      )}
    </div>
  );
}
