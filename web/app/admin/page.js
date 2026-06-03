'use client';
import { useState } from 'react';
import Link from 'next/link';
import { toast, tierFor } from '@/lib/ui';

const users = [
  { name: 'Repuestos Centro', role: 'Comercio', icon: 'fa-store', completed: 312, rating: 4.8, points: 6180 },
  { name: 'Andina Parts', role: 'Comercio', icon: 'fa-store', completed: 148, rating: 4.7, points: 3010 },
  { name: 'Patagonia Frenos', role: 'Comercio', icon: 'fa-store', completed: 96, rating: 4.9, points: 2240 },
];
const bars = [30, 55, 80, 65, 90, 72, 48];

export default function Admin() {
  const [reset, setReset] = useState(null);

  return (
    <div className="app-shell wide">
      <div className="topbar">
        <Link href="/" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Admin · RepuestosAlToque</span></Link>
        <div className="topbar-actions">
          <span className="badge badge-gray"><i className="fa-solid fa-location-dot"></i> Bariloche</span>
          <div className="avatar" style={{ background: 'linear-gradient(135deg,#fff,var(--purple))', color: '#0B0B0F' }}>AD</div>
        </div>
      </div>

      <div className="container">
        <div className="mb-16"><div className="eyebrow">Panel de control</div><h1 className="h-lg">Resumen del día</h1></div>

        <div className="dash-grid grid-2 mb-16">
          <Kpi label="Pedidos hoy" value="38" icon="fa-receipt" trend="+12% vs ayer" />
          <Kpi label="Ingresos (comisión 5%)" value="$92.100" icon="fa-coins" trend="+8% vs ayer" yellow />
          <Kpi label="Tiempo prom. entrega" value="38 min" icon="fa-stopwatch" trend="-4 min" down />
          <Kpi label="Conversión" value="61%" icon="fa-bullseye" trend="+3 pts" />
        </div>

        <div className="dash-grid mb-16">
          <div className="card col-span-2">
            <div className="section-title"><h2>Pedidos por hora</h2><span className="badge badge-purple">Hoy</span></div>
            <div className="bar-chart">{bars.map((h, i) => <div className="bar" key={i} style={{ height: h + '%' }}></div>)}</div>
            <div className="bar-labels">{['9h', '11h', '13h', '15h', '17h', '19h', '21h'].map((l) => <span key={l}>{l}</span>)}</div>
          </div>
          <div className="card col-span-2">
            <div className="section-title"><h2>Ecosistema activo</h2></div>
            <Eco icon="fa-screwdriver-wrench" bg="rgba(109,40,217,0.18)" color="var(--purple-light)" title="Mecánicos" sub="28 conectados" n="142" />
            <Eco icon="fa-store" bg="rgba(250,204,21,0.18)" color="var(--yellow)" title="Casas de repuestos" sub="19 cotizando hoy" n="23" />
            <Eco icon="fa-truck-fast" bg="rgba(34,197,94,0.16)" color="#4ADE80" title="Envíos tercerizados" sub="empresa de fletes" n="1" last />
          </div>
        </div>

        <div className="card mb-16">
          <div className="section-title"><h2>Gestión de usuarios · reputación</h2><span className="text-xs muted">Comercios</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Usuario</th><th>Rol</th><th>Reputación</th><th>Calif.</th><th>Puntos</th><th>Acciones</th></tr></thead>
              <tbody>
                {users.map((u) => {
                  const b = tierFor('store', u.completed);
                  return (
                    <tr key={u.name}>
                      <td><div className="flex-center gap-8"><div className="store-avatar" style={{ width: 30, height: 30, fontSize: 12 }}><i className={`fa-solid ${u.icon}`}></i></div>{u.name}</div></td>
                      <td><span className="badge badge-gray">{u.role}</span></td>
                      <td><span className={`rep-badge ${b.cls}`}><i className={`fa-solid ${b.icon}`}></i> {b.label}</span></td>
                      <td>⭐ {u.rating}</td>
                      <td>{u.points.toLocaleString('es-AR')}</td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => setReset(u.name)}><i className="fa-solid fa-key"></i> Resetear</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="section-title"><h2>Últimos pedidos</h2><a href="#">Exportar</a></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>#</th><th>Repuesto</th><th>Vehículo</th><th>Total</th><th>Estado</th></tr></thead>
              <tbody>
                <tr><td>1042</td><td>Pastillas de freno</td><td>Toyota Hilux</td><td>$47.145</td><td><span className="badge badge-yellow">En envío</span></td></tr>
                <tr><td>1041</td><td>Bomba de agua</td><td>VW Amarok</td><td>$56.910</td><td><span className="badge badge-green">Entregado</span></td></tr>
                <tr><td>1040</td><td>Disco de embrague</td><td>Renault Kangoo</td><td>$74.550</td><td><span className="badge badge-green">Entregado</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-center text-xs muted mt-24 mb-24">RepuestosAlToque · Admin · Datos simulados</p>
      </div>

      {reset && (
        <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) setReset(null); }}>
          <div className="modal text-center">
            <div className="modal-handle"></div>
            <div className="store-avatar" style={{ width: 54, height: 54, margin: '0 auto 12px', background: 'rgba(109,40,217,0.18)', color: 'var(--purple-light)' }}><i className="fa-solid fa-key"></i></div>
            <h2 className="h-md mb-4">Resetear contraseña</h2>
            <p className="text-sm muted mb-16">{reset}</p>
            <div className="card flex-between mb-16" style={{ padding: '12px 14px' }}>
              <span className="text-sm" style={{ fontFamily: 'monospace', color: 'var(--purple-light)' }}>RAT-{Math.random().toString(36).slice(2, 8).toUpperCase()}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => toast({ title: 'Contraseña copiada', icon: 'fa-copy', type: 'green' })}><i className="fa-solid fa-copy"></i></button>
            </div>
            <div className="flex gap-12 mb-12">
              <button className="btn btn-ghost btn-block btn-sm" onClick={() => { setReset(null); toast({ title: 'Reseteada', sub: `Enviada a ${reset} por email`, icon: 'fa-key', type: 'green' }); }}><i className="fa-solid fa-envelope"></i> Email</button>
              <button className="btn btn-success btn-block btn-sm" onClick={() => { setReset(null); toast({ title: 'Reseteada', sub: `Enviada a ${reset} por WhatsApp`, icon: 'fa-key', type: 'green' }); }}><i className="fa-brands fa-whatsapp"></i> WhatsApp</button>
            </div>
            <button className="btn btn-ghost btn-block" onClick={() => setReset(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, icon, trend, yellow, down }) {
  return (
    <div className="card stat-card">
      <div className="flex-between"><span className="stat-label">{label}</span><i className={`fa-solid ${icon} ${yellow ? 'text-yellow' : 'text-purple'}`}></i></div>
      <div className={`stat-value ${yellow ? 'text-yellow' : ''}`}>{value}</div>
      <span className={`stat-trend ${down ? 'trend-down' : 'trend-up'}`}><i className={`fa-solid fa-arrow-${down ? 'down' : 'up'}`}></i> {trend}</span>
    </div>
  );
}
function Eco({ icon, bg, color, title, sub, n, last }) {
  return (
    <div className="list-row" style={{ padding: '10px 0', ...(last ? { borderBottom: 'none' } : {}) }}>
      <div className="store-avatar" style={{ width: 34, height: 34, background: bg, color }}><i className={`fa-solid ${icon}`}></i></div>
      <div style={{ flex: 1 }}><div className="text-sm" style={{ fontWeight: 700 }}>{title}</div><div className="text-xs muted">{sub}</div></div>
      <span className="h-md">{n}</span>
    </div>
  );
}
