'use client';
// Sección Estadísticas del backoffice: KPIs del período + tablas por comercio/mecánico/repartidor
// (con score y export CSV) + gráfico de barras. Datos via getAdminStats; tablas via el toolkit ./table.
import { useState, useEffect } from 'react';
import { money, fmtDateTime } from '@/lib/ui';
import Loading from '@/components/Loading';
import { getAdminStats } from '@/app/actions/data';
import { useTable, Search, SortBar, Thead, Pager } from './table';

// ===================== ESTADÍSTICAS =====================
const SCORE_CLS = (s) => `badge ${s >= 75 ? 'badge-green' : s >= 50 ? 'badge-yellow' : 'badge-gray'}`;
const pctTxt = (x) => `${Math.round((x || 0) * 100)}%`;
const fmtMin = (m) => (m == null ? '—' : m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`);
const dt = (ms) => (ms ? fmtDateTime(ms) : '—');
function trendOf(cur, prev) {
  if (!prev) return cur > 0 ? { cls: 'up', txt: '▲ nuevo' } : { cls: '', txt: '—' };
  const ch = Math.round(((cur - prev) / prev) * 100);
  if (ch === 0) return { cls: '', txt: '= igual' };
  return ch > 0 ? { cls: 'up', txt: `▲ ${ch}%` } : { cls: 'down', txt: `▼ ${Math.abs(ch)}%` };
}
function downloadCSV(name, cols, rows) {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const csv = [cols.map((c) => esc(c.label)).join(',')].concat((rows || []).map((r) => cols.map((c) => esc(c.val(r))).join(','))).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
const todayStr = (d = new Date()) => { const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

const COM_COLS = [{ label: 'Comercio', key: 'name', type: 'str' }, { label: 'Cotizó', key: 'hechas', type: 'num' }, { label: 'Concretó', key: 'conc', type: 'num' }, { label: 'Descartó', key: 'desc', type: 'num' }, { label: 'Conversión', key: 'conv', type: 'num' }, { label: 'Vendido', key: 'vendido', type: 'num' }, { label: 'Comisión', key: 'comision', type: 'num' }, { label: 'Últ. respuesta', key: 'lastResp', type: 'num', date: true }, { label: 'Últ. ingreso', key: 'lastLogin', type: 'num', date: true }, { label: 'Puntaje de calidad', key: 'score', type: 'num' }];
const MEC_COLS = [{ label: 'Mecánico', key: 'name', type: 'str' }, { label: 'Pedidos', key: 'pedidos', type: 'num' }, { label: 'Concretados', key: 'conc', type: 'num' }, { label: 'Gastado', key: 'gastado', type: 'num' }, { label: 'Ticket prom.', key: 'ticket', type: 'num' }, { label: 'Últ. actividad', key: 'lastAct', type: 'num', date: true }, { label: 'Últ. ingreso', key: 'lastLogin', type: 'num', date: true }];
const REP_COLS = [{ label: 'Repartidor', key: 'name', type: 'str' }, { label: 'Entregas', key: 'entregas', type: 'num' }, { label: 'En curso', key: 'encurso', type: 'num' }, { label: 'Tiempo prom.', key: 'tiempoMin', type: 'num' }, { label: 'Cobrado envíos', key: 'cobrado', type: 'num' }, { label: 'Calificación', key: 'rating', type: 'num' }, { label: 'Últ. envío', key: 'lastShip', type: 'num', date: true }, { label: 'Puntaje de calidad', key: 'score', type: 'num' }];
const NAME_SEARCH = ['name'];
const comCells = (r) => [<td key="0" data-label="Comercio">{r.name}</td>, <td key="1" data-label="Cotizó">{r.hechas}</td>, <td key="2" data-label="Concretó"><span className="text-green" style={{ fontWeight: 700 }}>{r.conc}</span></td>, <td key="3" data-label="Descartó"><span className="muted">{r.desc}</span></td>, <td key="4" data-label="Conversión">{pctTxt(r.conv)}</td>, <td key="5" data-label="Vendido">{money(r.vendido)}</td>, <td key="6" data-label="Comisión" className="text-yellow">{money(r.comision)}</td>, <td key="7" data-label="Últ. respuesta" className="text-xs muted rat-th-date">{dt(r.lastResp)}</td>, <td key="8" data-label="Últ. ingreso" className="text-xs muted rat-th-date">{dt(r.lastLogin)}</td>, <td key="9" data-label="Puntaje de calidad"><span className={SCORE_CLS(r.score)}>{r.score}</span></td>];
const mecCells = (r) => [<td key="0" data-label="Mecánico">{r.name}</td>, <td key="1" data-label="Pedidos">{r.pedidos}</td>, <td key="2" data-label="Concretados"><span className="text-green" style={{ fontWeight: 700 }}>{r.conc}</span></td>, <td key="3" data-label="Gastado">{money(r.gastado)}</td>, <td key="4" data-label="Ticket prom.">{money(r.ticket)}</td>, <td key="5" data-label="Últ. actividad" className="text-xs muted rat-th-date">{dt(r.lastAct)}</td>, <td key="6" data-label="Últ. ingreso" className="text-xs muted rat-th-date">{dt(r.lastLogin)}</td>];
const repCells = (r) => [<td key="0" data-label="Repartidor">{r.name}</td>, <td key="1" data-label="Entregas"><span className="text-green" style={{ fontWeight: 700 }}>{r.entregas}</span></td>, <td key="2" data-label="En curso">{r.encurso}</td>, <td key="3" data-label="Tiempo prom.">{fmtMin(r.tiempoMin)}</td>, <td key="4" data-label="Cobrado envíos">{money(r.cobrado)}</td>, <td key="5" data-label="Calificación"><span className="text-yellow">★ {r.rating ? r.rating.toFixed(1) : '—'}</span></td>, <td key="6" data-label="Últ. envío" className="text-xs muted rat-th-date">{dt(r.lastShip)}</td>, <td key="7" data-label="Puntaje de calidad"><span className={SCORE_CLS(r.score)}>{r.score}</span></td>];
const COM_CSV = [{ label: 'Comercio', val: (r) => r.name }, { label: 'Cotizo', val: (r) => r.hechas }, { label: 'Concreto', val: (r) => r.conc }, { label: 'Descarto', val: (r) => r.desc }, { label: 'Conversion', val: (r) => pctTxt(r.conv) }, { label: 'Vendido', val: (r) => Math.round(r.vendido) }, { label: 'Comision', val: (r) => Math.round(r.comision) }, { label: 'Ult. respuesta', val: (r) => dt(r.lastResp) }, { label: 'Ult. ingreso', val: (r) => dt(r.lastLogin) }, { label: 'Puntaje de calidad', val: (r) => r.score }];
const MEC_CSV = [{ label: 'Mecanico', val: (r) => r.name }, { label: 'Pedidos', val: (r) => r.pedidos }, { label: 'Concretados', val: (r) => r.conc }, { label: 'Gastado', val: (r) => Math.round(r.gastado) }, { label: 'Ticket', val: (r) => Math.round(r.ticket) }, { label: 'Ult. actividad', val: (r) => dt(r.lastAct) }, { label: 'Ult. ingreso', val: (r) => dt(r.lastLogin) }];
const REP_CSV = [{ label: 'Repartidor', val: (r) => r.name }, { label: 'Entregas', val: (r) => r.entregas }, { label: 'En curso', val: (r) => r.encurso }, { label: 'Tiempo prom (min)', val: (r) => (r.tiempoMin == null ? '' : Math.round(r.tiempoMin)) }, { label: 'Cobrado envios', val: (r) => Math.round(r.cobrado) }, { label: 'Calificacion', val: (r) => (r.rating ? r.rating.toFixed(1) : '') }, { label: 'Ult. envio', val: (r) => dt(r.lastShip) }, { label: 'Puntaje de calidad', val: (r) => r.score }];

function StatsCard({ label, value, prev, yellow, green }) {
  const t = trendOf(value.raw, prev);
  return (
    <div className="card stat-card">
      <span className="stat-label">{label}</span>
      <div className={`stat-value ${yellow ? 'text-yellow' : green ? 'text-green' : ''}`}>{value.txt}</div>
      <div className={`stat-trend ${t.cls}`}>{t.txt}</div>
    </div>
  );
}

function StatsGeneral({ g }) {
  const maxBar = Math.max(1, ...g.bars.map((b) => b.v));
  return (
    <>
      <div className="rat-statgrid mb-16">
        <StatsCard label="Ventas (GMV)" value={{ raw: g.gmv, txt: money(g.gmv) }} prev={g.prev.gmv} />
        <StatsCard label="Comisión RAT" value={{ raw: g.comision, txt: money(g.comision) }} prev={g.prev.comision} yellow />
        <StatsCard label="Pedidos concretados" value={{ raw: g.pedidos, txt: String(g.pedidos) }} prev={g.prev.pedidos} />
        <StatsCard label="Ticket promedio" value={{ raw: g.ticket, txt: money(g.ticket) }} prev={g.prev.ticket} />
        <StatsCard label="Envíos cobrados" value={{ raw: g.flete, txt: money(g.flete) }} prev={g.prev.flete} green />
      </div>
      <div className="text-xs muted mb-16" style={{ marginTop: -6 }}>▲▼ comparado con el período anterior de igual largo</div>
      <div className="rat-genrow">
        <div className="card">
          <div className="flex-between mb-12" style={{ flexWrap: 'wrap', gap: 8 }}><h2 style={{ fontSize: 16, fontWeight: 700 }}>Ventas en el período</h2><span className="text-xs muted">Conversión {pctTxt(g.conv)} · {g.cotiz} cotizaciones</span></div>
          <div className="bar-chart">{g.bars.map((b, i) => <div key={i} className="bar" style={{ height: `${Math.round((b.v / maxBar) * 100)}%` }} title={`${b.label}: ${money(b.v)}`}></div>)}</div>
          <div className="bar-labels">{g.bars.map((b, i) => <span key={i}>{b.label}</span>)}</div>
        </div>
        <div className="card">
          <div className="section-title"><h2>Top comercios por ventas</h2></div>
          {g.top.map((t, i) => <div key={i} className="list-row"><div className="store-avatar" style={{ width: 36, height: 36, flexShrink: 0 }}><i className="fa-solid fa-store"></i></div><div style={{ flex: 1, minWidth: 0 }}><div className="text-sm" style={{ fontWeight: 700 }}>{t.name}</div><div className="text-xs muted">{t.conc} ventas</div></div><div style={{ fontWeight: 800, flexShrink: 0 }}>{money(t.vendido)}</div></div>)}
          {g.top.length === 0 && <div className="empty-state" style={{ padding: 24 }}>Sin ventas en este período</div>}
        </div>
      </div>
    </>
  );
}

function StatsTable({ title, rows, cols, initialSort, cells, csvName, csvCols, placeholder, onScore }) {
  const t = useTable(rows || [], cols, NAME_SEARCH, initialSort);
  return (
    <div className="card">
      <div className="section-title"><h2>{title}</h2><div className="flex-center gap-12">
        <span className="text-xs muted">{(rows || []).length}</span>
        {onScore && <button className="btn btn-ghost btn-sm" type="button" onClick={onScore}><i className="fa-solid fa-circle-question"></i> ¿Cómo se calcula?</button>}
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => downloadCSV(`${csvName}.csv`, csvCols, rows)}><i className="fa-solid fa-download"></i> CSV</button>
      </div></div>
      <Search value={t.query} onChange={t.setQuery} placeholder={placeholder} />
      <SortBar sortUI={t.sortUI} />
      <div style={{ overflowX: 'auto' }}>
        <table className="table rat-table">
          <Thead headers={t.headers} />
          <tbody>
            {t.total === 0 && <tr><td colSpan={cols.length} className="muted" style={{ textAlign: 'center', padding: 20 }}>Sin resultados</td></tr>}
            {t.visible.map((r) => <tr key={r.id}>{cells(r)}</tr>)}
          </tbody>
        </table>
      </div>
      <Pager pager={t.pager} />
    </div>
  );
}

function ScoreModal({ kind, onClose }) {
  const isCom = kind === 'com';
  const rows = isCom
    ? [['Conversión', 'cotizaciones que terminaron en venta', '45%'], ['Velocidad de respuesta', 'qué tan rápido cotiza', '30%'], ['Actividad', 'volumen de cotizaciones', '25%']]
    : [['Calificación', 'estrellas de mecánicos y comercios', '50%'], ['Tiempo de entrega', 'qué tan rápido entrega', '30%'], ['Volumen', 'cantidad de entregas completadas', '20%']];
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-handle"></div>
        <div className="flex-between mb-4"><h2 className="h-md">Cómo se calcula el puntaje de calidad</h2><button className="icon-btn" type="button" onClick={onClose} title="Cerrar"><i className="fa-solid fa-xmark"></i></button></div>
        <p className="text-sm muted mb-16">El puntaje de calidad (0 a 100) de un {isCom ? 'comercio' : 'repartidor'} se arma con su historial en el período seleccionado. Es distinto de los <b>puntos de reputación</b> (esos suben con cada operación concretada).</p>
        <div className="card mb-12" style={{ background: 'var(--bg-1)' }}>
          {rows.map(([t, d, p], i) => <div key={i} className="flex-between" style={{ padding: '9px 0', gap: 12, borderTop: i ? '1px solid var(--border)' : 'none' }}><span className="text-sm"><b>{t}</b> — {d}</span><span className="badge badge-purple" style={{ flexShrink: 0 }}>{p}</span></div>)}
        </div>
        <div className="flex-center gap-8 mt-16" style={{ flexWrap: 'wrap' }}><span className="badge badge-green">≥ 75 muy bueno</span><span className="badge badge-yellow">50–74 regular</span><span className="badge badge-gray">&lt; 50 a mejorar</span></div>
        <button className="btn btn-ghost btn-block mt-16" type="button" onClick={onClose}>Entendido</button>
      </div>
    </div>
  );
}

function StatsSection() {
  const [from, setFrom] = useState(todayStr(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(todayStr());
  const [preset, setPreset] = useState('30');
  const [sub, setSub] = useState('gen');
  const [data, setData] = useState(null);
  const [score, setScore] = useState(null);

  useEffect(() => { let alive = true; setData(null); getAdminStats({ from, to }).then((r) => { if (alive) setData(r); }).catch(() => { if (alive) setData(null); }); return () => { alive = false; }; }, [from, to]);

  const setRange = (days, p) => { setPreset(p); setTo(todayStr()); setFrom(todayStr(new Date(Date.now() - days * 86400000))); };
  const PRESETS = [['Hoy', 0, 'hoy'], ['7 días', 7, '7'], ['30 días', 30, '30'], ['90 días', 90, '90']];

  return (
    <>
      <div className="card mb-16">
        <div className="flex-between mb-12" style={{ flexWrap: 'wrap', gap: 8 }}><h2 style={{ fontSize: 18, fontWeight: 700 }}>Período</h2><span className="text-sm muted">{from} → {to}</span></div>
        <div className="rat-daterange mb-12">{PRESETS.map(([lbl, days, p]) => <button key={p} type="button" className={`rat-preset ${preset === p ? 'active' : ''}`} onClick={() => setRange(days, p)}>{lbl}</button>)}</div>
        <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
          <div className="field" style={{ marginBottom: 0 }}><label>Desde</label><input className="input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(''); }} style={{ maxWidth: 180 }} /></div>
          <div className="field" style={{ marginBottom: 0 }}><label>Hasta</label><input className="input" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(''); }} style={{ maxWidth: 180 }} /></div>
        </div>
      </div>

      <div className="rat-tabs mb-16"><div className="pill-tabs">
        <button type="button" className={sub === 'gen' ? 'active' : ''} onClick={() => setSub('gen')}>General</button>
        <button type="button" className={sub === 'com' ? 'active' : ''} onClick={() => setSub('com')}>Comercios</button>
        <button type="button" className={sub === 'mec' ? 'active' : ''} onClick={() => setSub('mec')}>Mecánicos</button>
        <button type="button" className={sub === 'rep' ? 'active' : ''} onClick={() => setSub('rep')}>Repartidores</button>
      </div></div>

      {!data ? <Loading label="Cargando estadísticas…" /> : (<>
        {sub === 'gen' && <StatsGeneral g={data.general} />}
        {sub === 'com' && <StatsTable title="Por comercio" rows={data.comercios} cols={COM_COLS} initialSort={{ key: 'vendido', dir: 'desc' }} cells={comCells} csvName="comercios" csvCols={COM_CSV} placeholder="Buscar comercio…" onScore={() => setScore('com')} />}
        {sub === 'mec' && <StatsTable title="Por mecánico" rows={data.mecanicos} cols={MEC_COLS} initialSort={{ key: 'gastado', dir: 'desc' }} cells={mecCells} csvName="mecanicos" csvCols={MEC_CSV} placeholder="Buscar mecánico…" />}
        {sub === 'rep' && <StatsTable title="Por repartidor" rows={data.repartidores} cols={REP_COLS} initialSort={{ key: 'entregas', dir: 'desc' }} cells={repCells} csvName="repartidores" csvCols={REP_CSV} placeholder="Buscar repartidor…" onScore={() => setScore('rep')} />}
      </>)}

      {score && <ScoreModal kind={score} onClose={() => setScore(null)} />}
    </>
  );
}

export default StatsSection;
