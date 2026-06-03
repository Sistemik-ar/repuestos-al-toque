'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { data } from '@/lib/data';
import { money, ping, toast } from '@/lib/ui';

export default function Pago() {
  const [q, setQ] = useState(data.quotePool[2]);
  const [phase, setPhase] = useState('pre'); // pre | processing | done
  const [payMode, setPayMode] = useState('self');

  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem('rat_selectedQuote'));
      if (s) setQ(s);
    } catch {}
  }, []);

  const part = q.price;
  const fee = Math.round(part * 0.05); // comisión 5% (la paga el cliente)
  const total = part + fee;

  function pay() {
    if (payMode === 'link') {
      toast({ title: 'Link de pago generado', sub: 'mpago.la/RAToque/1042 · enviado al cliente', icon: 'fa-link', type: 'yellow' });
      return;
    }
    setPhase('processing');
    setTimeout(() => {
      setPhase('done');
      ping();
      toast({ title: 'Pago aprobado', sub: 'Mercado Pago reparte automáticamente', icon: 'fa-circle-check', type: 'green' });
    }, 2200);
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="flex-center">
          <Link href="/mecanico/cotizaciones" className="icon-btn"><i className="fa-solid fa-arrow-left"></i></Link>
          <div><div style={{ fontWeight: 800 }}>Confirmar y pagar</div><div className="text-xs muted">Pedido #1042</div></div>
        </div>
        <div className="flex-center gap-8"><i className="fa-solid fa-lock text-green"></i><span className="text-xs muted">Pago seguro</span></div>
      </div>

      {phase === 'pre' && (
        <div className="container">
          <div className="section-title"><h2>Oferta elegida</h2></div>
          <div className="card mb-16">
            <div className="flex-between mb-12">
              <div className="flex-center gap-12">
                <div className="store-avatar"><i className="fa-solid fa-user-secret"></i></div>
                <div><div style={{ fontWeight: 700 }}>{q.alias}</div><div className="text-xs muted">{q.partBrand} · <i className="fa-solid fa-circle-check text-green"></i> En stock</div></div>
              </div>
              <span className="badge badge-green"><i className="fa-solid fa-shield-halved"></i> {q.warranty}</span>
            </div>
            <div className="locked-info"><i className="fa-solid fa-lock"></i> Vendedor anónimo <span className="badge badge-gray">se identifica en el remito de entrega</span></div>
          </div>

          <div className="section-title"><h2>¿Quién paga?</h2></div>
          <div className="grid-2 mb-16">
            <button className={`card hoverable text-center ${payMode === 'self' ? 'glow' : ''}`} style={{ cursor: 'pointer', padding: '16px 8px' }} onClick={() => setPayMode('self')}>
              <i className="fa-solid fa-wallet text-purple" style={{ fontSize: 20 }}></i>
              <div className="text-sm mt-8" style={{ fontWeight: 700 }}>Pago yo</div>
              <div className="text-xs muted">Como mecánico</div>
            </button>
            <button className={`card hoverable text-center ${payMode === 'link' ? 'glow' : ''}`} style={{ cursor: 'pointer', padding: '16px 8px' }} onClick={() => setPayMode('link')}>
              <i className="fa-solid fa-link text-yellow" style={{ fontSize: 20 }}></i>
              <div className="text-sm mt-8" style={{ fontWeight: 700 }}>Link al cliente</div>
              <div className="text-xs muted">Lo paga el dueño</div>
            </button>
          </div>

          <div className="section-title"><h2>Detalle</h2></div>
          <div className="card mb-16">
            <div className="flex-between mb-12"><span className="subtle">Repuesto ({q.partBrand})</span><span style={{ fontWeight: 700 }}>{money(part)}</span></div>
            <div className="flex-between mb-12"><span className="subtle">Comisión RepuestosAlToque <span className="badge badge-purple" style={{ marginLeft: 4 }}>5%</span></span><span style={{ fontWeight: 700 }}>{money(fee)}</span></div>
            <div className="divider"></div>
            <div className="flex-between"><span className="h-md">Total</span><span className="h-md text-yellow">{money(total)}</span></div>
            <div className="text-xs muted mt-8"><i className="fa-solid fa-truck-fast"></i> El flete lo coordina la empresa de envíos (se abona según tarifa).</div>
          </div>

          <div className="card mb-16" style={{ display: 'flex', alignItems: 'center', gap: 12, borderColor: 'rgba(0,158,227,0.4)' }}>
            <div className="store-avatar" style={{ background: '#009EE3', color: 'white' }}><i className="fa-solid fa-credit-card"></i></div>
            <div style={{ flex: 1 }}><div className="text-sm" style={{ fontWeight: 700 }}>Mercado Pago</div><div className="text-xs muted">Reparte automático: vendedor + comisión</div></div>
            <i className="fa-solid fa-circle-check text-green"></i>
          </div>
        </div>
      )}

      {phase === 'processing' && (
        <div className="container" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div className="radar-wrap mb-24"><div className="radar-ring"></div><div className="radar-ring"></div><div className="radar-core" style={{ background: '#009EE3' }}><i className="fa-solid fa-credit-card"></i></div></div>
          <h2 className="h-lg mb-8">Procesando pago…</h2>
          <p className="subtle">Conectando con Mercado Pago</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="container">
          <div className="text-center" style={{ padding: '24px 0 16px' }}>
            <div className="success-check mb-16"><i className="fa-solid fa-check"></i></div>
            <h2 className="h-lg">¡Pago aprobado!</h2>
            <p className="subtle">Comprobante #MP-90432187 · {money(total)}</p>
          </div>
          <div className="float-notif mb-16" style={{ borderColor: 'rgba(34,197,94,0.35)', background: 'linear-gradient(135deg,rgba(34,197,94,0.14),rgba(31,41,55,0.5))' }}>
            <i className="fa-solid fa-truck-fast text-green"></i>
            <div className="text-sm subtle">Tu repuesto sale en camino. <b>Te llega con la factura/remito</b> a través de la empresa de envíos.</div>
          </div>
          <div className="card mb-16">
            <div className="flex-between mb-12">
              <div className="text-sm" style={{ fontWeight: 700 }}>Estado del envío</div>
              <span className="badge badge-yellow"><i className="fa-solid fa-truck-fast"></i> Preparando</span>
            </div>
            <div className="progress-track mb-8"><div className="progress-fill" style={{ width: '25%' }}></div></div>
            <div className="text-xs muted">El comercio confirma "salió el pedido" y la empresa de envíos lo retira.</div>
          </div>
          <Link href="/mecanico" className="btn btn-primary btn-block btn-lg"><i className="fa-solid fa-house"></i> Volver al inicio</Link>
        </div>
      )}

      {phase === 'pre' && (
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, padding: '14px 16px', background: 'linear-gradient(0deg,var(--bg-0),transparent)' }}>
          <button className="btn btn-block btn-lg" style={{ background: '#009EE3', color: 'white' }} onClick={pay}>
            <i className={`fa-solid ${payMode === 'link' ? 'fa-link' : 'fa-credit-card'}`}></i> {payMode === 'link' ? 'Generar link de pago' : 'Pagar con Mercado Pago'}
          </button>
        </div>
      )}
    </div>
  );
}
