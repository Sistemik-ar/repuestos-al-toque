import { useState } from 'react';
import { money } from '@/lib/ui';
import RoutePoint from './RoutePoint';

const PERIOD_LBL = { hoy: 'hoy', '7d': 'últimos 7 días', mes: 'este mes', todo: 'histórico' };
const DAY_NAMES = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const dayLabel = (d) => (d === 0 ? 'Hoy' : d === 1 ? 'Ayer' : `Hace ${d} días`);

// Pestaña Historial del repartidor: resumen del período, gráfico de ganancia por día (últimos 7),
// filtro por período + búsqueda, y tarjetas-acordeón con la ruta y la reseña del mecánico.
export default function HistorialView({ historial }) {
  const [period, setPeriod] = useState('7d');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(() => new Set());

  const inPeriod = (h) => (period === 'todo' ? true : period === 'hoy' ? h.daysAgo === 0 : period === '7d' ? h.daysAgo <= 6 : h.daysAgo <= 30);
  const q = query.trim().toLowerCase();
  const matchQ = (h) => !q || `${h.veh} ${h.plate || ''} ${h.stores.join(' ')} ${h.taller}`.toLowerCase().includes(q);

  const list = historial.filter(inPeriod).filter(matchQ);
  const count = list.length;
  const totEarn = list.reduce((n, h) => n + h.freight, 0);
  const rated = list.filter((h) => h.rating != null);
  const avgRating = rated.length ? (rated.reduce((n, h) => n + h.rating, 0) / rated.length).toFixed(1) : '—';
  const avgDur = count ? Math.round(list.reduce((n, h) => n + h.durationMin, 0) / count) : 0;

  // gráfico: ganancia por día, últimos 7 días (sobre TODO el historial, no el filtrado)
  const today = new Date();
  const byDay = [];
  for (let d = 6; d >= 0; d--) byDay.push({ d, sum: historial.filter((h) => h.daysAgo === d).reduce((n, h) => n + h.freight, 0) });
  const maxDay = Math.max(1, ...byDay.map((x) => x.sum));
  const wkTotal = byDay.reduce((n, x) => n + x.sum, 0);

  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <div className="hist-summary">
        <div className="hs-card"><div className="hl"><i className="fa-solid fa-box-archive"></i> Entregas</div><div className="hv">{count}</div><div className="hsub">{PERIOD_LBL[period]}</div></div>
        <div className="hs-card earn"><div className="hl"><i className="fa-solid fa-sack-dollar"></i> Ganancia flete</div><div className="hv">{money(totEarn)}</div><div className="hsub">{count} viaje{count !== 1 ? 's' : ''}</div></div>
        <div className="hs-card rate"><div className="hl"><i className="fa-solid fa-star"></i> Rating prom.</div><div className="hv">{avgRating}</div><div className="hsub">{rated.length} reseña{rated.length !== 1 ? 's' : ''}</div></div>
        <div className="hs-card"><div className="hl"><i className="fa-solid fa-stopwatch"></i> Tiempo prom.</div><div className="hv">{avgDur}<span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}> min</span></div><div className="hsub">retiro → entrega</div></div>
      </div>

      <div className="earn-chart">
        <div className="ec-head"><span className="ec-title">Ganancia por día · últimos 7 días</span><span className="ec-total">total <b>{money(wkTotal)}</b></span></div>
        <div className="ec-bars">
          {byDay.map((x) => {
            const dt = new Date(today); dt.setDate(today.getDate() - x.d);
            const h = Math.round((x.sum / maxDay) * 100);
            return (
              <div className="ec-col" key={x.d}>
                <div className={`ec-bar ${x.d === 0 ? 'today' : ''}`} style={{ height: `${x.sum ? Math.max(h, 6) : 2}%` }}>
                  {x.sum > 0 && <span className="ec-amt">{(x.sum / 1000).toFixed(1)}k</span>}
                </div>
                <span className="ec-lbl">{DAY_NAMES[dt.getDay()]}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="hist-toolbar">
        <div className="period-seg">
          {[['hoy', 'Hoy'], ['7d', '7 días'], ['mes', 'Mes'], ['todo', 'Todo']].map(([p, lbl]) => (
            <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{lbl}</button>
          ))}
        </div>
        <div className="hist-search"><i className="fa-solid fa-magnifying-glass"></i><input type="text" placeholder="Buscar vehículo, comercio o taller…" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" /></div>
      </div>

      <div className="hist-list">
        {count === 0 ? (
          <div className="empty-card"><i className="fa-solid fa-magnifying-glass"></i><div className="et">No hay entregas en este período{q ? ' que coincidan con la búsqueda' : ''}.</div></div>
        ) : list.map((h) => {
          const isOpen = open.has(h.id);
          const stars = h.rating != null ? '★'.repeat(h.rating) + '☆'.repeat(5 - h.rating) : '';
          return (
            <div className={`hist-card ${isOpen ? 'open' : ''}`} key={h.id}>
              <div className="hist-head" onClick={() => toggle(h.id)}>
                <div className="hh-ic"><i className="fa-solid fa-check"></i></div>
                <div className="hh-main">
                  <div className="hh-title">{h.veh} {h.plate && <span className="plate">{h.plate}</span>}</div>
                  <div className="hh-route">{h.stores.join(' + ')} → {h.taller}</div>
                </div>
                <div className="hh-side">
                  {h.rating != null
                    ? <span className="hh-rating"><i className="fa-solid fa-star"></i> {h.rating.toFixed(1)}</span>
                    : <span className="hh-rating pending"><i className="fa-regular fa-clock"></i> sin calificar</span>}
                  <div className="hh-earn"><div className="e">{money(h.freight)}</div><div className="d">{dayLabel(h.daysAgo)} · {h.time}</div></div>
                  <i className="fa-solid fa-chevron-down hh-caret"></i>
                </div>
              </div>
              {isOpen && (
                <div className="hist-body">
                  <div className="hb-route">
                    {h.stores.map((s, i) => <RoutePoint key={i} pk={{ name: s }} idx={i} total={h.stores.length} noMaps />)}
                    <RoutePoint pk={{ name: h.taller }} drop last noMaps />
                  </div>
                  <div className="hb-meta">
                    <span className="hb-chip"><i className="fa-solid fa-boxes-stacked"></i> {h.pieces} pza{h.pieces !== 1 ? 's' : ''}</span>
                    {h.durationMin > 0 && <span className="hb-chip"><i className="fa-solid fa-stopwatch"></i> {h.durationMin} min</span>}
                    <span className="hb-chip"><i className="fa-solid fa-store"></i> {h.stores.length} {h.stores.length === 1 ? 'retiro' : 'retiros'}</span>
                  </div>
                  {h.rating != null && (
                    <div className="hb-review">
                      <span className="rv-stars">{stars}</span>
                      {h.comment ? <div className="rv-text">“{h.comment}”</div> : <div className="rv-text" style={{ fontStyle: 'normal', color: 'var(--text-2)' }}>Sin comentario.</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
