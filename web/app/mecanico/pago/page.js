'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { money, toast } from '@/lib/ui';
import { createMpCheckout, getOrderBreakdown } from '@/app/actions/data';

export default function Pago() {
  const [q, setQ] = useState(null);
  const [bd, setBd] = useState(null);
  const [payMode, setPayMode] = useState('self');
  const [loading, setLoading] = useState(false);
  const [linkCliente, setLinkCliente] = useState('');

  useEffect(() => {
    try { const s = JSON.parse(sessionStorage.getItem('rat_selectedQuote')); if (s) { setQ(s); getOrderBreakdown(s.requestId, s.id).then(setBd); } } catch {}
  }, []);

  if (!q) {
    return (
      <div className="app-shell">
        <div className="topbar"><div className="flex-center"><Link href="/mecanico" className="icon-btn"><i className="fa-solid fa-arrow-left"></i></Link><div style={{ fontWeight: 800 }}>Pago</div></div></div>
        <div className="container"><div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-receipt"></i></div><div className="text-sm">No hay una oferta elegida</div><Link href="/mecanico" className="btn btn-primary btn-sm mt-16">Volver</Link></div></div>
      </div>
    );
  }

  const part = bd?.part ?? q.price;
  const fee = bd?.commission ?? Math.round(q.price * 0.05);
  const ship = bd?.ship ?? 5000;
  const mpFee = bd?.mpFeeAmount ?? 0;
  const commissionPct = bd?.commissionPct ?? 5;
  const total = bd?.total ?? (part + fee + ship);

  async function pay() {
    setLoading(true);
    const res = await createMpCheckout(q.requestId, q.id);
    setLoading(false);
    if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
    if (payMode === 'link') {
      setLinkCliente(res.link);
      toast({ title: 'Link de pago generado', sub: 'Compartilo con el cliente', icon: 'fa-link', type: 'green' });
    } else {
      window.location.href = res.link; // a Mercado Pago
    }
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="flex-center"><Link href="/mecanico/cotizaciones" className="icon-btn"><i className="fa-solid fa-arrow-left"></i></Link><div><div style={{ fontWeight: 800 }}>Confirmar y pagar</div><div className="text-xs muted">Pedido #{q.requestId ? '' : '—'}</div></div></div>
        <div className="flex-center gap-8"><i className="fa-solid fa-lock text-green"></i><span className="text-xs muted">Pago seguro</span></div>
      </div>

      <div className="container">
        <div className="section-title"><h2>Oferta elegida</h2></div>
        <div className="card mb-16">
          <div className="flex-between mb-12">
            <div className="flex-center gap-12"><div className="store-avatar"><i className="fa-solid fa-user-secret"></i></div><div><div style={{ fontWeight: 700 }}>{q.alias}</div><div className="text-xs muted">{q.partBrand} · <i className="fa-solid fa-circle-check text-green"></i> En stock</div></div></div>
            <span className="badge badge-green"><i className="fa-solid fa-shield-halved"></i> {q.warranty}</span>
          </div>
          <div className="locked-info"><i className="fa-solid fa-lock"></i> Vendedor anónimo <span className="badge badge-gray">se revela con el remito de entrega</span></div>
        </div>

        <div className="section-title"><h2>¿Quién paga?</h2></div>
        <div className="grid-2 mb-16">
          <button className={`card hoverable text-center ${payMode === 'self' ? 'glow' : ''}`} style={{ cursor: 'pointer', padding: '16px 8px' }} onClick={() => setPayMode('self')}>
            <i className="fa-solid fa-wallet text-purple" style={{ fontSize: 20 }}></i><div className="text-sm mt-8" style={{ fontWeight: 700 }}>Pago yo</div><div className="text-xs muted">Como mecánico</div>
          </button>
          <button className={`card hoverable text-center ${payMode === 'link' ? 'glow' : ''}`} style={{ cursor: 'pointer', padding: '16px 8px' }} onClick={() => setPayMode('link')}>
            <i className="fa-solid fa-link text-yellow" style={{ fontSize: 20 }}></i><div className="text-sm mt-8" style={{ fontWeight: 700 }}>Link al cliente</div><div className="text-xs muted">Lo paga el dueño</div>
          </button>
        </div>

        <div className="section-title"><h2>Detalle</h2></div>
        <div className="card mb-16">
          <div className="flex-between mb-12"><span className="subtle">Repuesto ({q.partBrand})</span><span style={{ fontWeight: 700 }}>{money(part)}</span></div>
          <div className="flex-between mb-12"><span className="subtle">Comisión RepuestosAlToque <span className="badge badge-purple" style={{ marginLeft: 4 }}>{commissionPct}%</span></span><span style={{ fontWeight: 700 }}>{money(fee)}</span></div>
          <div className="flex-between mb-12"><span className="subtle">Envío <span className="text-xs muted">(empresa de fletes)</span></span><span style={{ fontWeight: 700 }}>{money(ship)}</span></div>
          {mpFee > 0 && <div className="flex-between mb-12"><span className="subtle">Recargo Mercado Pago</span><span style={{ fontWeight: 700 }}>{money(mpFee)}</span></div>}
          <div className="divider"></div>
          <div className="flex-between"><span className="h-md">Total</span><span className="h-md text-yellow">{money(total)}</span></div>
        </div>

        {linkCliente && (
          <div className="card glow mb-16">
            <div className="flex-center gap-8 mb-8"><i className="fa-solid fa-link text-yellow"></i><b className="text-sm">Link de pago para el cliente</b></div>
            <div className="card flex-between" style={{ padding: '10px 12px', background: 'var(--bg-1)' }}>
              <span className="text-xs" style={{ wordBreak: 'break-all', color: 'var(--purple-light)' }}>{linkCliente}</span>
            </div>
            <div className="flex gap-12 mt-12">
              <button className="btn btn-ghost btn-block btn-sm" onClick={() => { navigator.clipboard?.writeText(linkCliente); toast({ title: 'Link copiado', icon: 'fa-copy', type: 'green' }); }}><i className="fa-solid fa-copy"></i> Copiar</button>
              <a className="btn btn-success btn-block btn-sm" href={`https://wa.me/?text=${encodeURIComponent('Pagá tu repuesto acá: ' + linkCliente)}`} target="_blank" rel="noopener"><i className="fa-brands fa-whatsapp"></i> WhatsApp</a>
            </div>
          </div>
        )}

        <div className="card mb-16" style={{ display: 'flex', alignItems: 'center', gap: 12, borderColor: 'rgba(0,158,227,0.4)' }}>
          <div className="store-avatar" style={{ background: '#009EE3', color: 'white' }}><i className="fa-solid fa-credit-card"></i></div>
          <div style={{ flex: 1 }}><div className="text-sm" style={{ fontWeight: 700 }}>Mercado Pago</div><div className="text-xs muted">Tarjeta, dinero en cuenta o transferencia</div></div>
          <i className="fa-solid fa-circle-check text-green"></i>
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, padding: '14px 16px', background: 'linear-gradient(0deg,var(--bg-0),transparent)' }}>
        <button className="btn btn-block btn-lg" style={{ background: '#009EE3', color: 'white' }} onClick={pay} disabled={loading}>
          {loading ? <span className="spinner"></span> : <><i className={`fa-solid ${payMode === 'link' ? 'fa-link' : 'fa-credit-card'}`}></i> {payMode === 'link' ? 'Generar link de pago' : 'Pagar con Mercado Pago'}</>}
        </button>
      </div>
    </div>
  );
}
