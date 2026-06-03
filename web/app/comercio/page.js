'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { money, toast, ping, fmtTime, tierFor } from '@/lib/ui';

const initialLeads = [
  { id: 1042, part: 'Pastillas de freno delanteras', vehicle: 'Toyota Hilux 2019', cat: 'Frenos', zone: 'Centro', dist: '2,4 km', secs: 7 * 60 + 12, earn: '~$44.900', urgent: true },
  { id: 1043, part: 'Bomba de agua', vehicle: 'VW Amarok 2021', cat: 'Refrigeración', zone: 'Oeste', dist: '5,1 km', secs: 9 * 60 + 40, earn: '~$54.000', urgent: false },
];

export default function Comercio() {
  const [tab, setTab] = useState('pend');
  const [leads, setLeads] = useState(initialLeads);
  const [modal, setModal] = useState(null);
  const badge = tierFor('store', 312);

  useEffect(() => {
    const id = setInterval(() => setLeads((ls) => ls.map((l) => ({ ...l, secs: l.secs > 0 ? l.secs - 1 : 0 }))), 1000);
    const t = setTimeout(() => {
      ping();
      toast({ title: '🔥 Nueva solicitud · cerca tuyo', sub: 'Amortiguador · Renault Duster · 1,8 km', icon: 'fa-bolt', type: 'yellow' });
      setLeads((ls) => [{ id: 1044, part: 'Amortiguador delantero', vehicle: 'Renault Duster 2022', cat: 'Suspensión', zone: 'Centro', dist: '1,8 km', secs: 10 * 60, earn: '~$68.000', urgent: true }, ...ls]);
    }, 5000);
    return () => { clearInterval(id); clearTimeout(t); };
  }, []);

  function remove(id) { setLeads((ls) => ls.filter((l) => l.id !== id)); }

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Panel Comercio</span></Link>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={() => toast({ title: 'Nueva solicitud cercana', sub: 'Filtro de aire · Chevrolet S10 · Centro', icon: 'fa-bolt', type: 'yellow' })}><i className="fa-regular fa-bell"></i><span className="dot"></span></button>
          <div className="avatar" style={{ background: 'linear-gradient(135deg,var(--yellow),var(--purple))' }}>RC</div>
        </div>
      </div>

      <div className="container">
        <div className="mb-16">
          <div className="eyebrow">Repuestos Centro</div>
          <h1 className="h-lg">Solicitudes entrantes</h1>
          <p className="text-sm muted">Respondé rápido = ganás la venta</p>
        </div>

        {/* Reputación */}
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
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value text-yellow">7</div><div className="stat-label">Solicitudes hoy</div></div>
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value text-green">4</div><div className="stat-label">Concretados</div></div>
          <div className="card stat-card" style={{ padding: 14 }}><div className="stat-value">$182k</div><div className="stat-label">Vendido</div></div>
        </div>

        <div className="pill-tabs mb-16">
          <button className={tab === 'pend' ? 'active' : ''} onClick={() => setTab('pend')}>Pendientes <span className="badge badge-yellow" style={{ marginLeft: 4 }}>{leads.length}</span></button>
          <button className={tab === 'cot' ? 'active' : ''} onClick={() => setTab('cot')}>Cotizadas</button>
          <button className={tab === 'ent' ? 'active' : ''} onClick={() => setTab('ent')}>Entregadas</button>
        </div>

        {tab === 'pend' && (
          <div>
            {leads.length === 0 && (
              <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-inbox"></i></div><div className="text-sm">Sin solicitudes pendientes</div><div className="text-xs">Te avisamos apenas llegue una</div></div>
            )}
            {leads.map((l) => (
              <div className="card mb-12" key={l.id}>
                <div className="flex-between mb-12">
                  <div className="flex-center gap-12">
                    <div className="store-avatar" style={l.urgent ? { background: 'rgba(239,68,68,0.16)', color: '#FCA5A5' } : {}}><i className="fa-solid fa-bolt"></i></div>
                    <div><div className="text-sm" style={{ fontWeight: 700 }}>{l.part}</div><div className="text-xs muted">{l.vehicle} · {l.cat}</div></div>
                  </div>
                  <span className={`timer-pill ${l.secs <= 120 ? 'urgent' : ''}`}><i className="fa-solid fa-clock"></i> {fmtTime(l.secs)}</span>
                </div>
                <div className="flex-between mb-12">
                  <div className="flex-center gap-8">
                    <span className="badge badge-gray"><i className="fa-solid fa-location-dot"></i> {l.zone}</span>
                    <span className="badge badge-gray">{l.dist}</span>
                    {l.urgent && <span className="badge badge-red"><i className="fa-solid fa-bolt"></i> Urgente</span>}
                  </div>
                  <div style={{ textAlign: 'right' }}><div className="text-xs muted">Potencial</div><div className="text-sm" style={{ fontWeight: 700 }}>{l.earn}</div></div>
                </div>
                <div className="locked-info mb-12"><i className="fa-solid fa-user-secret"></i> Mecánico anónimo hasta concretar</div>
                <div className="flex gap-12">
                  <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto' }} onClick={() => { remove(l.id); toast({ title: 'Marcado sin disponibilidad', sub: 'No penaliza tu balance', icon: 'fa-ban', type: 'purple' }); }}><i className="fa-solid fa-ban"></i> Sin disponibilidad</button>
                  <button className="btn btn-yellow btn-block" onClick={() => setModal(l)}><i className="fa-solid fa-tag"></i> Cotizar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'cot' && (
          <div className="card">
            <div className="flex-between mb-8"><div><div className="text-sm" style={{ fontWeight: 700 }}>Filtro de aceite</div><div className="text-xs muted">Ford Ranger 2020 · Lubricación</div></div><span className="badge badge-purple">Esperando cierre de ventana</span></div>
            <div className="flex-between text-sm"><span className="muted">Cotizaste</span><span style={{ fontWeight: 700 }}>$12.800</span></div>
          </div>
        )}

        {tab === 'ent' && (
          <EntregadasTab />
        )}
      </div>

      {modal && <CotizarModal lead={modal} onClose={() => setModal(null)} onSend={() => { remove(modal.id); setModal(null); toast({ title: 'Cotización enviada', sub: 'Se revela al mecánico al cerrarse la ventana', icon: 'fa-paper-plane', type: 'green' }); }} />}
    </div>
  );
}

function EntregadasTab() {
  const [salio, setSalio] = useState(false);
  return (
    <div>
      <div className="card mb-12">
        <div className="flex-between mb-8"><div><div className="text-sm" style={{ fontWeight: 700 }}>Bomba de agua</div><div className="text-xs muted">VW Amarok 2021</div></div><span className="badge badge-green"><i className="fa-solid fa-check"></i> Pagado</span></div>
        <div className="flex-between">
          <span className="text-sm muted">Venta <b className="text-green">$54.200</b></span>
          {salio ? <span className="badge badge-yellow"><i className="fa-solid fa-truck-fast"></i> Retira el flete</span> : <button className="btn btn-yellow btn-sm" onClick={() => { setSalio(true); toast({ title: 'Pedido marcado como listo', sub: 'Avisamos a la empresa de envíos', icon: 'fa-box', type: 'green' }); }}><i className="fa-solid fa-box"></i> Salió el pedido</button>}
        </div>
      </div>
      <div className="card" style={{ opacity: 0.85 }}>
        <div className="flex-between mb-8"><div><div className="text-sm" style={{ fontWeight: 700 }}>Disco de embrague</div><div className="text-xs muted">Renault Kangoo 2018</div></div><span className="badge badge-green"><i className="fa-solid fa-check"></i> Entregado</span></div>
        <div className="flex-between text-sm"><span className="muted">Venta <b className="text-green">$71.000</b></span><span className="text-xs muted">⭐ 5 del mecánico</span></div>
      </div>
    </div>
  );
}

function CotizarModal({ lead, onClose, onSend }) {
  const [price, setPrice] = useState('');
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-handle"></div>
        <h2 className="h-md mb-4">Enviar cotización</h2>
        <p className="text-sm muted mb-16">{lead.part} · {lead.vehicle}</p>
        <div className="field"><label>Precio final</label><input className="input" inputMode="numeric" placeholder="$ 0" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div className="field"><label>Marca de la pieza</label>
          <select className="select"><option>Bosch</option><option>TRW</option><option>Ferodo</option><option>Original / OEM</option><option>Alternativa</option></select>
        </div>
        <div className="field"><label>Podés ofrecer otra opción (A, B…)</label><input className="input" placeholder="Opcional: 2da opción / alternativa" /></div>
        <div className="field"><label>Notas <span className="muted">(opcional)</span></label><textarea className="textarea" placeholder="Stock disponible, garantía, etc."></textarea></div>
        <div className="flex gap-12">
          <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-yellow btn-block" onClick={onSend}><i className="fa-solid fa-paper-plane"></i> Enviar Cotización</button>
        </div>
      </div>
    </div>
  );
}
