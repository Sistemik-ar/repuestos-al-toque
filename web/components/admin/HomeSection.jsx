import { useState, useEffect } from 'react';
import { money } from '@/lib/ui';
import { getAdminHome } from '@/app/actions/data';
import Loading from '@/components/Loading';

const KPI_DEF = [
  ['gmv', 'GMV (hoy)', 'fa-coins', 'yellow'],
  ['comision', 'Comisión (hoy)', 'fa-percent', 'green'],
  ['pedidos', 'Pedidos (hoy)', 'fa-receipt', ''],
  ['usuarios', 'Usuarios', 'fa-users', ''],
];
const BAR_LABELS = ['9h', '11h', '13h', '15h', '17h', '19h', '21h', '23h'];

function KpiCard({ k, label, icon, kind }) {
  const diff = k?.prev ? Math.round(((k.value - k.prev) / k.prev) * 100) : 0;
  const tcls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '=';
  return (
    <div className={`ah-kpi ${kind}`}>
      <div className="ah-kl">{label} <i className={`fa-solid ${icon}`}></i></div>
      <div className="ah-kv">{k?.money ? money(k.value) : String(k?.value ?? 0)}</div>
      <div className={`ah-kt ${tcls}`}>{arrow} {Math.abs(diff)}% <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>vs ayer</span></div>
    </div>
  );
}

// Vista "Inicio" del admin: el pulso del marketplace de hoy + lo que necesita atención.
// onNav(tab) cambia de sección (deep-links de las acciones pendientes y "Ver todos").
export default function HomeSection({ onNav }) {
  const [d, setD] = useState(null);
  useEffect(() => { getAdminHome().then((r) => setD(r)).catch(() => setD(null)); }, []);
  if (!d) return <Loading label="Cargando el resumen…" />;

  const P = d.pending;
  const actions = [];
  if (P.cc) actions.push({ ic: 'yellow', i: 'fa-id-card-clip', t: 'Cuentas corrientes por aprobar', s: 'Vinculaciones mecánico ↔ comercio esperando tu OK', n: P.cc, go: 'cuentas' });
  if (P.stuck) actions.push({ ic: 'red', i: 'fa-triangle-exclamation', t: 'Pedidos trabados', s: 'Pagados sin avanzar o con incidencia', n: P.stuck, go: 'pedidos' });
  if (P.altas) actions.push({ ic: 'purple', i: 'fa-user-clock', t: 'Comercios pendientes de alta', s: 'Recién cargados, falta activarlos', n: P.altas, go: 'usuarios' });
  if (P.sinMp) actions.push({ ic: 'yellow', i: 'fa-credit-card', t: 'Comercios sin Mercado Pago', s: 'Activos pero no pueden cobrar por la plataforma', n: P.sinMp, go: 'comercios' });
  if (P.thinRubros.length) actions.push({ ic: 'yellow', i: 'fa-layer-group', t: 'Rubros con poca cobertura', s: `${P.thinRubros.slice(0, 3).join(', ')}${P.thinRubros.length > 3 ? ` y ${P.thinRubros.length - 3} más` : ''} · 1 comercio o menos`, n: P.thinRubros.length, go: 'comercios' });

  const maxBar = Math.max(1, ...d.bars);

  return (
    <>
      <div className="ah-kpis">
        {KPI_DEF.map(([key, label, icon, kind]) => <KpiCard key={key} k={d.kpis[key]} label={label} icon={icon} kind={kind} />)}
      </div>

      <div className="home-grid">
        <div className="panel">
          <div className="panel-h"><h2><i className="fa-solid fa-bell text-yellow"></i> Necesitan tu atención</h2></div>
          {actions.length ? actions.map((a, i) => (
            <div className="pa-item" key={i}>
              <div className={`pa-ic ${a.ic}`}><i className={`fa-solid ${a.i}`}></i></div>
              <div className="pa-main"><div className="pa-title">{a.t}</div><div className="pa-sub">{a.s}</div></div>
              <div className="pa-count">{a.n}</div>
              <button className="pa-go" type="button" onClick={() => onNav?.(a.go)} title="Ir a la sección"><i className="fa-solid fa-arrow-right"></i></button>
            </div>
          )) : <div className="empty-mini"><i className="fa-solid fa-circle-check" style={{ fontSize: 22, color: '#4ADE80', opacity: 0.7 }}></i><div className="mt-8">Todo al día, nada pendiente.</div></div>}
        </div>

        <div className="panel">
          <div className="panel-h"><h2><i className="fa-solid fa-ranking-star text-purple"></i> Top comercios</h2><button className="more" type="button" onClick={() => onNav?.('comercios')}>Ver todos</button></div>
          {d.top.length ? d.top.map((t, i) => (
            <div className="top-row" key={i} onClick={() => onNav?.('comercios')}>
              <div className="tr-av"><i className="fa-solid fa-store"></i></div>
              <div style={{ flex: 1, minWidth: 0 }}><div className="tr-name">{t.name}</div><div className="tr-sub">{t.ventas} venta{t.ventas !== 1 ? 's' : ''} · conv. {Math.round(t.conv * 100)}%</div></div>
              <div style={{ fontWeight: 800, flexShrink: 0 }}>{money(t.vendido)}</div>
            </div>
          )) : <div className="empty-mini">Todavía no hay ventas en los últimos 30 días.</div>}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-h"><h2><i className="fa-solid fa-chart-column text-purple"></i> Ventas de hoy por hora</h2><span className="badge badge-purple">{d.kpis.pedidos.value} pedido{d.kpis.pedidos.value !== 1 ? 's' : ''}</span></div>
        <div className="mini-bars">{d.bars.map((v, i) => <div className="b" key={i} style={{ height: `${Math.round((v / maxBar) * 100)}%` }}></div>)}</div>
        <div className="bar-labels">{BAR_LABELS.map((l) => <span key={l}>{l}</span>)}</div>
      </div>
    </>
  );
}
