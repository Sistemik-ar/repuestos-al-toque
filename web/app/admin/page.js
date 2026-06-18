'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money, toast, fmtDateTime } from '@/lib/ui';
import { getAdminData, setUserStatus, getShippingTariffs, saveShippingTariffs, createUser, getBusinessSettings, saveBusinessSettings, getCreditRequests, adminActOnCredit, disableCreditAccount, setStoreCategories, setUserTempPassword, searchAddresses, getUserDetail, updateUser, getAdminTrip, getAdminStats } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';
import dynamic from 'next/dynamic';
import Loading from '@/components/Loading';
import FontScale from '@/components/FontScale';

// Leaflet toca window: solo en cliente, nunca SSR.
const LocationPicker = dynamic(() => import('@/components/LocationPicker'), { ssr: false });

const ROLE_LABEL = { ADMIN: 'Admin', MECHANIC: 'Mecánico', STORE: 'Vendedor', DELIVERY: 'Repartidor' };
const ST_BADGE = { ACTIVE: 'badge-green', PENDING: 'badge-yellow', SUSPENDED: 'badge-red' };
const CC_BADGE = { PENDING: ['badge-yellow', 'Pendiente'], APPROVED: ['badge-green', 'Aprobado'], REJECTED: ['badge-red', 'Rechazado'] };
const CC_STATE = { PENDING: ['badge-yellow', 'Pendiente'], ACTIVE: ['badge-green', 'Activa'], REJECTED: ['badge-red', 'Rechazada'], DISABLED: ['badge-gray', 'Desactivada'] };

// ----- columnas (key = campo crudo para ordenar/buscar; type str|num; date = mostrar fecha) -----
const USER_COLS = [
  { label: 'Nombre', key: 'name', type: 'str' },
  { label: 'Email', key: 'email', type: 'str' },
  { label: 'Rol', key: 'roleLabel', type: 'str' },
  { label: 'Estado', key: 'status', type: 'str' },
  { label: 'Alta', key: 'createdAt', type: 'num', date: true },
  { label: '', key: null },
];
const USER_SEARCH = ['name', 'email', 'roleLabel'];
const CC_COLS = [
  { label: 'Mecánico', key: 'mechanicName', type: 'str' },
  { label: 'Comercio', key: 'storeName', type: 'str' },
  { label: 'Solicitada', key: 'createdAt', type: 'num', date: true },
  { label: 'Aprob. admin', key: 'adminStatus', type: 'str' },
  { label: 'Aprob. comercio', key: 'storeStatus', type: 'str' },
  { label: 'Estado', key: 'status', type: 'str' },
  { label: '', key: null },
];
const CC_SEARCH = ['mechanicName', 'storeName'];
const ORDER_COLS = [
  { label: '#', key: 'code', type: 'str' },
  { label: 'Repuesto', key: 'label', type: 'str' },
  { label: 'Vehículo', key: 'vehicle', type: 'str' },
  { label: 'Total', key: 'total', type: 'num' },
  { label: 'Estado', key: 'status', type: 'str' },
  { label: 'Creado', key: 'created', type: 'num', date: true },
  { label: 'Concretada', key: 'concretada', type: 'num', date: true },
  { label: 'Reparto', key: 'tripRank', type: 'num' },
];
const ORDER_SEARCH = ['code', 'label', 'vehicle', 'status', 'total'];

// ----- helpers de tabla (búsqueda + orden + paginación, client-side) -----
function applySort(arr, sort, typeByKey) {
  if (!sort || !sort.key) return arr;
  const t = typeByKey[sort.key] || 'str';
  const dir = sort.dir === 'desc' ? -1 : 1;
  return [...arr].sort((a, b) => {
    let x = a[sort.key], y = b[sort.key];
    if (t === 'num') { const an = x == null, bn = y == null; if (an && bn) return 0; if (an) return 1; if (bn) return -1; return (x - y) * dir; }
    x = String(x == null ? '' : x).toLowerCase(); y = String(y == null ? '' : y).toLowerCase();
    return x < y ? -dir : x > y ? dir : 0;
  });
}
// modelo de botones de paginado: 1 … (p-1) p (p+1) … N
function pageButtons(page, pages) {
  const out = [];
  if (pages <= 7) { for (let i = 1; i <= pages; i++) out.push({ n: i }); return out; }
  out.push({ n: 1 });
  const lo = Math.max(2, page - 1), hi = Math.min(pages - 1, page + 1);
  if (lo > 2) out.push({ ell: true });
  for (let i = lo; i <= hi; i++) out.push({ n: i });
  if (hi < pages - 1) out.push({ ell: true });
  out.push({ n: pages });
  return out;
}
function useTable(rows, cols, searchKeys, initialSort) {
  const [query, setQ] = useState('');
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(1);
  const [perPage, setPP] = useState(10);
  const typeByKey = useMemo(() => { const m = {}; cols.forEach((c) => { if (c.key) m[c.key] = c.type || 'str'; }); return m; }, [cols]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (!q ? rows : rows.filter((r) => searchKeys.some((k) => String(r[k] == null ? '' : r[k]).toLowerCase().includes(q)))), [rows, q, searchKeys]);
  const sorted = useMemo(() => applySort(filtered, sort, typeByKey), [filtered, sort, typeByKey]);
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * perPage;
  const visible = sorted.slice(start, start + perPage);

  const setSortKey = (key) => { setPage(1); setSort((s) => { const t = typeByKey[key]; const dir = s.key === key ? (s.dir === 'asc' ? 'desc' : 'asc') : (t === 'num' ? 'desc' : 'asc'); return { key, dir }; }); };
  const headers = cols.map((c) => {
    const sortable = !!c.key, active = sortable && sort.key === c.key;
    const ind = !sortable ? '' : active ? (sort.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort';
    return { label: c.label, sortable, ind, thClass: (c.date ? 'rat-th-date ' : '') + (sortable ? 'rat-th-sort' : '') + (active ? ' rat-th-active' : ''), onSort: sortable ? () => setSortKey(c.key) : undefined };
  });
  const sortUI = {
    key: sort.key, options: cols.filter((c) => c.key).map((c) => ({ value: c.key, label: c.label })),
    dirIcon: sort.dir === 'asc' ? 'fa-arrow-up-wide-short' : 'fa-arrow-down-wide-short',
    setKey: (e) => { const key = e.target.value; setPage(1); setSort({ key, dir: typeByKey[key] === 'num' ? 'desc' : 'asc' }); },
    toggleDir: () => { setPage(1); setSort((s) => ({ key: s.key, dir: s.dir === 'asc' ? 'desc' : 'asc' })); },
  };
  const pager = {
    info: total === 0 ? '0 resultados' : `${start + 1}–${Math.min(start + perPage, total)} de ${total}`,
    page: cur, buttons: pageButtons(cur, pages), perPage, setPerPage: (n) => { setPP(n); setPage(1); },
    prev: () => setPage((p) => Math.max(1, p - 1)), next: () => setPage((p) => Math.min(pages, p + 1)), go: setPage,
    prevDisabled: cur <= 1, nextDisabled: cur >= pages,
  };
  return { query, setQuery: (v) => { setQ(v); setPage(1); }, visible, headers, sortUI, pager, total };
}

function Search({ value, onChange, placeholder }) {
  return (
    <div style={{ position: 'relative', maxWidth: 360, marginBottom: 12 }}>
      <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)', fontSize: 13, pointerEvents: 'none' }}></i>
      <input className="input" style={{ paddingLeft: 38 }} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {value && <button type="button" onClick={() => onChange('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}><i className="fa-solid fa-xmark"></i></button>}
    </div>
  );
}
function SortBar({ sortUI }) {
  return (
    <div className="rat-sortbar">
      <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, flexShrink: 0 }}>Ordenar</span>
      <select className="select" style={{ flex: 1, padding: '9px 30px 9px 12px', fontSize: 13 }} value={sortUI.key} onChange={sortUI.setKey}>
        {sortUI.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button className="btn btn-ghost btn-sm rat-pgbtn" type="button" onClick={sortUI.toggleDir} title="Invertir orden"><i className={`fa-solid ${sortUI.dirIcon}`}></i></button>
    </div>
  );
}
function Thead({ headers }) {
  return <thead><tr>{headers.map((h, i) => (
    <th key={i} className={h.thClass} onClick={h.onSort}>{h.label}{h.sortable && <i className={`fa-solid ${h.ind}`} style={{ marginLeft: 6, fontSize: 10, opacity: 0.6 }}></i>}</th>
  ))}</tr></thead>;
}
function Pager({ pager }) {
  return (
    <div className="flex-between" style={{ marginTop: 14, flexWrap: 'wrap', gap: 12 }}>
      <div className="flex gap-8" style={{ alignItems: 'center' }}>
        <span className="text-xs muted">{pager.info}</span>
        <select className="select" style={{ padding: '6px 24px 6px 9px', fontSize: 12, width: 'auto' }} value={pager.perPage} onChange={(e) => pager.setPerPage(Number(e.target.value))} title="Filas por página">
          <option value={5}>5</option><option value={10}>10</option><option value={25}>25</option>
        </select>
      </div>
      <div className="flex gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm rat-pgbtn" type="button" onClick={pager.prev} disabled={pager.prevDisabled}><i className="fa-solid fa-chevron-left"></i></button>
        {pager.buttons.map((p, i) => p.ell
          ? <span key={i} className="muted" style={{ padding: '0 4px' }}>…</span>
          : <button key={i} type="button" className={`btn btn-sm rat-pgbtn ${p.n === pager.page ? 'btn-primary' : 'btn-ghost'}`} onClick={() => pager.go(p.n)}>{p.n}</button>)}
        <button className="btn btn-ghost btn-sm rat-pgbtn" type="button" onClick={pager.next} disabled={pager.nextDisabled}><i className="fa-solid fa-chevron-right"></i></button>
      </div>
    </div>
  );
}

// Barra de tabs con indicador de scroll horizontal: en mobile no entran las 5 pestañas,
// así que mostramos un degradé + chevron animado cuando quedan opciones ocultas a la derecha.
const NAV = [
  ['usuarios', 'fa-users', 'Usuarios'],
  ['comercios', 'fa-store', 'Comercios'],
  ['pedidos', 'fa-receipt', 'Pedidos'],
  ['cuentas', 'fa-id-card-clip', 'Cuenta corriente'],
  ['stats', 'fa-chart-line', 'Estadísticas'],
  ['ajustes', 'fa-sliders', 'Ajustes'],
];
const SEC_TITLE = { usuarios: 'Usuarios', comercios: 'Comercios', pedidos: 'Pedidos', cuentas: 'Cuenta corriente', stats: 'Estadísticas', ajustes: 'Ajustes' };

export default function Admin() {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [creds, setCreds] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('usuarios');
  const [usuSub, setUsuSub] = useState('lista'); // Usuarios: Ver y editar | Alta
  const [collapsed, setCollapsed] = useState(false); // sidebar contraído (desktop)

  // Navegación <-> URL: la sección (?sec=) y el alta (?u=alta) quedan en la URL para sobrevivir F5/recarga.
  const skipWrite = useRef(true);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const sec = p.get('sec');
    if (sec && NAV.some(([id]) => id === sec)) setTab(sec);
    if (p.get('u') === 'alta') setUsuSub('alta');
  }, []);
  useEffect(() => {
    if (skipWrite.current) { skipWrite.current = false; return; }
    const p = new URLSearchParams();
    if (tab !== 'usuarios') p.set('sec', tab);
    if (tab === 'usuarios' && usuSub === 'alta') p.set('u', 'alta');
    const qs = p.toString();
    const search = qs ? `?${qs}` : '';
    if (window.location.search === search) return;
    // replaceState NATIVO (del prototipo): Next parchea window.history.replaceState y al usarlo
    // re-renderiza/re-monta la ruta (perdía el estado de la sección). El del prototipo no está
    // parcheado, así que solo cambia la barra de direcciones. Preservamos el state de Next.
    try { History.prototype.replaceState.call(window.history, window.history.state, '', `/admin${search}`); } catch {}
  }, [tab, usuSub]);

  // Carga al entrar + botón "Actualizar" + recarga después de cada acción (sin auto-poll: no pisa búsqueda/página).
  const load = async () => {
    setRefreshing(true);
    try { const [a, c] = await Promise.all([getAdminData(), getCreditRequests()]); setD(a || null); setCreds(c || []); } catch {}
    setRefreshing(false);
  };
  useEffect(() => { load(); getShippingTariffs().then(setTariffs); }, []);

  async function logout() { await logoutAction(); router.push('/login'); }
  // editor de tarifas (se carga una vez y se recarga tras guardar, para no pisar lo que estás editando)
  function setRow(i, k, v) { setTariffs((t) => t.map((r, j) => (j === i ? { ...r, [k]: v } : r))); }
  function addRow() { setTariffs((t) => [...t, { uptoKm: '', price: '' }]); }
  function delRow(i) { setTariffs((t) => t.filter((_, j) => j !== i)); }
  async function saveT() {
    const res = await saveShippingTariffs(tariffs);
    if (res?.ok) { toast({ title: 'Tarifas guardadas', sub: `${res.count} bandas`, icon: 'fa-check', type: 'green' }); setTariffs(await getShippingTariffs()); }
  }

  const k = d?.kpis || { users: 0, requests: 0, paid: 0, commission: 0 };

  return (
    <div className="app-shell wide">
      <div className="topbar">
        <Link href="/admin" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Admin · RepuestosAlToque</span></Link>
        <div className="topbar-actions">
          <span className="badge badge-gray"><i className="fa-solid fa-location-dot"></i> Bariloche</span>
          <button className="icon-btn" onClick={load} title="Actualizar" disabled={refreshing}><i className={`fa-solid fa-rotate ${refreshing ? 'fa-spin' : ''}`}></i></button>
          <FontScale />
          <button className="icon-btn" onClick={logout} title="Salir"><i className="fa-solid fa-right-from-bracket"></i></button>
        </div>
      </div>

      <div className="container">
        <div className={`rat-layout ${collapsed ? 'rat-collapsed' : ''}`}>
          <aside className="rat-sidebar">
            <button className="rat-navtoggle" type="button" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Expandir' : 'Contraer'}><i className={`fa-solid ${collapsed ? 'fa-angles-right' : 'fa-angles-left'}`}></i>{!collapsed && <span>Contraer</span>}</button>
            {NAV.map(([id, icon, lbl]) => (
              <div key={id}>
                <button className={`rat-navitem ${tab === id ? 'active' : ''}`} type="button" onClick={() => setTab(id)} title={lbl}><i className={`fa-solid ${icon}`}></i><span>{lbl}</span>{id === 'usuarios' && <i className={`fa-solid fa-chevron-down rat-navchev ${tab === 'usuarios' ? 'open' : ''}`}></i>}</button>
                {id === 'usuarios' && tab === 'usuarios' && (<>
                  <button className={`rat-subitem ${usuSub === 'lista' ? 'active' : ''}`} type="button" onClick={() => setUsuSub('lista')}><i className="fa-solid fa-pen-to-square"></i><span>Ver y editar</span></button>
                  <button className={`rat-subitem ${usuSub === 'alta' ? 'active' : ''}`} type="button" onClick={() => setUsuSub('alta')}><i className="fa-solid fa-user-plus"></i><span>Alta de usuario</span></button>
                </>)}
              </div>
            ))}
          </aside>
          <div className="rat-main">
        <div className="mb-16"><div className="eyebrow">Panel de control</div><h1 className="h-lg">{SEC_TITLE[tab]}</h1></div>

        {d === null ? (
          <Loading label="Cargando el resumen…" />
        ) : (
          <div className="dash-grid grid-2 mb-16">
            <Kpi label="Pedidos" value={String(k.requests)} icon="fa-receipt" />
            <Kpi label="Pagados" value={String(k.paid)} icon="fa-circle-check" />
            <Kpi label="Ingresos (comisión)" value={money(k.commission)} icon="fa-coins" yellow />
            <Kpi label="Usuarios" value={String(k.users)} icon="fa-users" />
          </div>
        )}

        {tab === 'usuarios' && (<>
          <div className="rat-submobile rat-tabs" style={{ marginBottom: 16 }}>
            <div className="pill-tabs">
              <button type="button" className={usuSub === 'lista' ? 'active' : ''} onClick={() => setUsuSub('lista')}>Ver y editar</button>
              <button type="button" className={usuSub === 'alta' ? 'active' : ''} onClick={() => setUsuSub('alta')}>Alta de usuario</button>
            </div>
          </div>
          {usuSub === 'alta' ? <AltaUsuario onCreated={load} /> : <UsersSection users={d?.users} onReload={load} />}
        </>)}

        {tab === 'comercios' && <StoreCategories stores={d?.stores} categories={d?.categories} onSaved={load} />}

        {tab === 'cuentas' && <CreditSection rows={creds} onReload={load} />}

        {tab === 'pedidos' && <OrdersSection orders={d?.recent} loading={d === null} />}

        {tab === 'stats' && <StatsSection />}

        {tab === 'ajustes' && (<>
          <Pricing />
          {/* Tarifas de envío */}
          <div className="card mb-16">
            <div className="section-title"><h2>Tarifas de envío (por km)</h2><span className="text-xs muted">respeta el envío mínimo configurado</span></div>
            <p className="text-sm muted mb-12">Definí cuánto sale el envío según la distancia. "Hasta N km → precio". Se usa la banda más chica que cubra la distancia.</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Hasta (km)</th><th>Precio</th><th></th></tr></thead>
                <tbody>
                  {tariffs.map((r, i) => (
                    <tr key={i}>
                      <td><input className="input" style={{ maxWidth: 110 }} inputMode="numeric" value={r.uptoKm} onChange={(e) => setRow(i, 'uptoKm', e.target.value)} /></td>
                      <td><input className="input" style={{ maxWidth: 140 }} inputMode="numeric" value={r.price} onChange={(e) => setRow(i, 'price', e.target.value)} /></td>
                      <td><button className="btn btn-danger btn-sm" onClick={() => delRow(i)}><i className="fa-solid fa-trash"></i></button></td>
                    </tr>
                  ))}
                  {tariffs.length === 0 && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center', padding: 16 }}>Sin bandas — agregá una</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex gap-12 mt-12">
              <button className="btn btn-ghost btn-sm" onClick={addRow}><i className="fa-solid fa-plus"></i> Agregar banda</button>
              <button className="btn btn-yellow btn-sm" onClick={saveT}><i className="fa-solid fa-floppy-disk"></i> Guardar tarifas</button>
            </div>
          </div>
        </>)}

        <p className="text-center text-xs muted mt-24 mb-24">RepuestosAlToque · Admin</p>
          </div>
        </div>
      </div>
      <nav className="rat-bottomnav">
        {NAV.map(([id, icon, lbl]) => (
          <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><i className={`fa-solid ${icon}`}></i><span>{lbl}</span></button>
        ))}
      </nav>
    </div>
  );
}

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

const COM_COLS = [{ label: 'Comercio', key: 'name', type: 'str' }, { label: 'Cotizó', key: 'hechas', type: 'num' }, { label: 'Concretó', key: 'conc', type: 'num' }, { label: 'Descartó', key: 'desc', type: 'num' }, { label: 'Conversión', key: 'conv', type: 'num' }, { label: 'Vendido', key: 'vendido', type: 'num' }, { label: 'Comisión', key: 'comision', type: 'num' }, { label: 'Últ. respuesta', key: 'lastResp', type: 'num', date: true }, { label: 'Últ. ingreso', key: 'lastLogin', type: 'num', date: true }, { label: 'Puntaje', key: 'score', type: 'num' }];
const MEC_COLS = [{ label: 'Mecánico', key: 'name', type: 'str' }, { label: 'Pedidos', key: 'pedidos', type: 'num' }, { label: 'Concretados', key: 'conc', type: 'num' }, { label: 'Gastado', key: 'gastado', type: 'num' }, { label: 'Ticket prom.', key: 'ticket', type: 'num' }, { label: 'Últ. actividad', key: 'lastAct', type: 'num', date: true }, { label: 'Últ. ingreso', key: 'lastLogin', type: 'num', date: true }];
const REP_COLS = [{ label: 'Repartidor', key: 'name', type: 'str' }, { label: 'Entregas', key: 'entregas', type: 'num' }, { label: 'En curso', key: 'encurso', type: 'num' }, { label: 'Tiempo prom.', key: 'tiempoMin', type: 'num' }, { label: 'Cobrado envíos', key: 'cobrado', type: 'num' }, { label: 'Calificación', key: 'rating', type: 'num' }, { label: 'Últ. envío', key: 'lastShip', type: 'num', date: true }, { label: 'Puntaje', key: 'score', type: 'num' }];
const NAME_SEARCH = ['name'];
const comCells = (r) => [<td key="0" data-label="Comercio">{r.name}</td>, <td key="1" data-label="Cotizó">{r.hechas}</td>, <td key="2" data-label="Concretó"><span className="text-green" style={{ fontWeight: 700 }}>{r.conc}</span></td>, <td key="3" data-label="Descartó"><span className="muted">{r.desc}</span></td>, <td key="4" data-label="Conversión">{pctTxt(r.conv)}</td>, <td key="5" data-label="Vendido">{money(r.vendido)}</td>, <td key="6" data-label="Comisión" className="text-yellow">{money(r.comision)}</td>, <td key="7" data-label="Últ. respuesta" className="text-xs muted rat-th-date">{dt(r.lastResp)}</td>, <td key="8" data-label="Últ. ingreso" className="text-xs muted rat-th-date">{dt(r.lastLogin)}</td>, <td key="9" data-label="Puntaje"><span className={SCORE_CLS(r.score)}>{r.score}</span></td>];
const mecCells = (r) => [<td key="0" data-label="Mecánico">{r.name}</td>, <td key="1" data-label="Pedidos">{r.pedidos}</td>, <td key="2" data-label="Concretados"><span className="text-green" style={{ fontWeight: 700 }}>{r.conc}</span></td>, <td key="3" data-label="Gastado">{money(r.gastado)}</td>, <td key="4" data-label="Ticket prom.">{money(r.ticket)}</td>, <td key="5" data-label="Últ. actividad" className="text-xs muted rat-th-date">{dt(r.lastAct)}</td>, <td key="6" data-label="Últ. ingreso" className="text-xs muted rat-th-date">{dt(r.lastLogin)}</td>];
const repCells = (r) => [<td key="0" data-label="Repartidor">{r.name}</td>, <td key="1" data-label="Entregas"><span className="text-green" style={{ fontWeight: 700 }}>{r.entregas}</span></td>, <td key="2" data-label="En curso">{r.encurso}</td>, <td key="3" data-label="Tiempo prom.">{fmtMin(r.tiempoMin)}</td>, <td key="4" data-label="Cobrado envíos">{money(r.cobrado)}</td>, <td key="5" data-label="Calificación"><span className="text-yellow">★ {r.rating ? r.rating.toFixed(1) : '—'}</span></td>, <td key="6" data-label="Últ. envío" className="text-xs muted rat-th-date">{dt(r.lastShip)}</td>, <td key="7" data-label="Puntaje"><span className={SCORE_CLS(r.score)}>{r.score}</span></td>];
const COM_CSV = [{ label: 'Comercio', val: (r) => r.name }, { label: 'Cotizo', val: (r) => r.hechas }, { label: 'Concreto', val: (r) => r.conc }, { label: 'Descarto', val: (r) => r.desc }, { label: 'Conversion', val: (r) => pctTxt(r.conv) }, { label: 'Vendido', val: (r) => Math.round(r.vendido) }, { label: 'Comision', val: (r) => Math.round(r.comision) }, { label: 'Ult. respuesta', val: (r) => dt(r.lastResp) }, { label: 'Ult. ingreso', val: (r) => dt(r.lastLogin) }, { label: 'Puntaje', val: (r) => r.score }];
const MEC_CSV = [{ label: 'Mecanico', val: (r) => r.name }, { label: 'Pedidos', val: (r) => r.pedidos }, { label: 'Concretados', val: (r) => r.conc }, { label: 'Gastado', val: (r) => Math.round(r.gastado) }, { label: 'Ticket', val: (r) => Math.round(r.ticket) }, { label: 'Ult. actividad', val: (r) => dt(r.lastAct) }, { label: 'Ult. ingreso', val: (r) => dt(r.lastLogin) }];
const REP_CSV = [{ label: 'Repartidor', val: (r) => r.name }, { label: 'Entregas', val: (r) => r.entregas }, { label: 'En curso', val: (r) => r.encurso }, { label: 'Tiempo prom (min)', val: (r) => (r.tiempoMin == null ? '' : Math.round(r.tiempoMin)) }, { label: 'Cobrado envios', val: (r) => Math.round(r.cobrado) }, { label: 'Calificacion', val: (r) => (r.rating ? r.rating.toFixed(1) : '') }, { label: 'Ult. envio', val: (r) => dt(r.lastShip) }, { label: 'Puntaje', val: (r) => r.score }];

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
        {onScore && <button className="btn btn-ghost btn-sm" type="button" onClick={onScore}><i className="fa-solid fa-circle-question"></i> Puntaje</button>}
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
        <div className="flex-between mb-4"><h2 className="h-md">Cómo se calcula el puntaje</h2><button className="icon-btn" type="button" onClick={onClose} title="Cerrar"><i className="fa-solid fa-xmark"></i></button></div>
        <p className="text-sm muted mb-16">El puntaje (0 a 100) de un {isCom ? 'comercio' : 'repartidor'} se arma con su historial en el período seleccionado:</p>
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

// ===================== USUARIOS =====================
function UsersSection({ users, onReload }) {
  const [cred, setCred] = useState(null);
  const [editing, setEditing] = useState(null);
  const rows = useMemo(() => (users || []).map((u) => ({ ...u, roleLabel: ROLE_LABEL[u.role] || u.role })), [users]);
  const t = useTable(rows, USER_COLS, USER_SEARCH, { key: 'createdAt', dir: 'desc' });

  async function toggleUser(u) {
    const next = u.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    await setUserStatus(u.id, next); toast({ title: next === 'ACTIVE' ? 'Reactivado' : 'Suspendido', sub: u.email, icon: 'fa-user', type: 'green' }); onReload?.();
  }
  async function resetPass(u) {
    const typed = window.prompt(`Contraseña temporal para ${u.email}\n(dejá vacío para generar una al azar):`);
    if (typed === null) return;
    const res = await setUserTempPassword(u.id, typed);
    if (res?.error) { toast({ title: res.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
    setCred({ email: res.email, pass: res.tempPassword });
    toast({ title: 'Contraseña temporal lista', sub: res.email, icon: 'fa-key', type: 'green' });
  }

  return (
    <div className="card mb-16">
      <div className="section-title"><h2>Usuarios</h2><span className="text-xs muted">{t.total}</span></div>
      {cred && (
        <div className="float-notif mb-12" style={{ borderColor: 'rgba(250,204,21,0.4)', background: 'linear-gradient(135deg,rgba(250,204,21,0.10),rgba(31,41,55,0.5))' }}>
          <i className="fa-solid fa-key text-yellow"></i>
          <div className="text-sm subtle">
            <b>Contraseña temporal lista.</b> Pasásela al usuario:
            <div className="text-xs mt-4">Email: <b>{cred.email}</b> · Contraseña: <b className="text-yellow">{cred.pass}</b>
              {' · '}<button className="text-purple" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700 }} onClick={() => navigator.clipboard?.writeText(`${cred.email} / ${cred.pass}`)}>copiar</button>
              {' · '}<button className="text-purple" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700 }} onClick={() => setCred(null)}>ocultar</button>
            </div>
          </div>
        </div>
      )}
      <Search value={t.query} onChange={t.setQuery} placeholder="Buscar por nombre, email o rol…" />
      <SortBar sortUI={t.sortUI} />
      <div style={{ overflowX: 'auto' }}>
        <table className="table rat-table">
          <Thead headers={t.headers} />
          <tbody>
            {t.total === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>Sin resultados</td></tr>}
            {t.visible.map((u) => (
              <tr key={u.id}>
                <td data-label="Nombre">{u.name || '—'}</td>
                <td data-label="Email" className="text-xs">{u.email}</td>
                <td data-label="Rol"><span className="badge badge-gray">{u.roleLabel}</span></td>
                <td data-label="Estado"><span className={`badge ${ST_BADGE[u.status] || 'badge-gray'}`}>{u.status}</span></td>
                <td data-label="Alta" className="text-xs muted rat-th-date">{fmtDateTime(u.createdAt)}</td>
                <td className="rat-actions">{u.role !== 'ADMIN' && (
                  <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(u.id)} title="Editar usuario"><i className="fa-solid fa-user-pen"></i> Editar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => resetPass(u)} title="Setear contraseña temporal"><i className="fa-solid fa-key"></i> Pass</button>
                    <button className={`btn btn-sm ${u.status === 'SUSPENDED' ? 'btn-success' : 'btn-ghost'}`} onClick={() => toggleUser(u)}>{u.status === 'SUSPENDED' ? 'Reactivar' : 'Suspender'}</button>
                  </div>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager pager={t.pager} />
      {editing && <EditUserModal userId={editing} onClose={() => setEditing(null)} onSaved={onReload} />}
    </div>
  );
}

// ===================== CUENTA CORRIENTE =====================
function CreditSection({ rows, onReload }) {
  const t = useTable(rows || [], CC_COLS, CC_SEARCH, { key: 'createdAt', dir: 'desc' });
  async function approve(r) { await adminActOnCredit(r.id, true, null); toast({ title: 'Vinculación validada', icon: 'fa-check', type: 'green' }); onReload?.(); }
  async function reject(r) { const note = window.prompt('Observación interna (opcional):') || null; await adminActOnCredit(r.id, false, note); toast({ title: 'Rechazada', icon: 'fa-ban', type: 'purple' }); onReload?.(); }
  async function disable(r) { await disableCreditAccount(r.id); toast({ title: 'Relación desactivada', icon: 'fa-ban', type: 'purple' }); onReload?.(); }

  return (
    <div className="card mb-16">
      <div className="section-title"><h2>Solicitudes de Cuenta Corriente</h2><span className="text-xs muted">{t.total}</span></div>
      <Search value={t.query} onChange={t.setQuery} placeholder="Buscar por mecánico o comercio…" />
      <SortBar sortUI={t.sortUI} />
      <div style={{ overflowX: 'auto' }}>
        <table className="table rat-table">
          <Thead headers={t.headers} />
          <tbody>
            {t.total === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 20 }}>Sin solicitudes</td></tr>}
            {t.visible.map((r) => {
              const st = CC_STATE[r.status] || ['badge-gray', r.status];
              const a = CC_BADGE[r.adminStatus] || ['badge-gray', r.adminStatus];
              const sc = CC_BADGE[r.storeStatus] || ['badge-gray', r.storeStatus];
              return (
                <tr key={r.id}>
                  <td data-label="Mecánico">{r.mechanicName}</td>
                  <td data-label="Comercio">{r.storeName}</td>
                  <td data-label="Solicitada" className="text-xs muted rat-th-date">{fmtDateTime(r.createdAt)}</td>
                  <td data-label="Aprob. admin"><span className={`badge ${a[0]}`}>{a[1]}</span></td>
                  <td data-label="Aprob. comercio"><span className={`badge ${sc[0]}`}>{sc[1]}</span></td>
                  <td data-label="Estado"><span className={`badge ${st[0]}`}>{st[1]}</span>{r.adminNote && <div className="text-xs muted mt-4" title={r.adminNote}><i className="fa-solid fa-note-sticky"></i> nota</div>}</td>
                  <td className="rat-actions">
                    <div className="flex gap-8">
                      {r.adminStatus === 'PENDING' && <><button className="btn btn-success btn-sm" onClick={() => approve(r)}>Validar</button><button className="btn btn-ghost btn-sm" onClick={() => reject(r)}>Rechazar</button></>}
                      {r.status === 'ACTIVE' && <button className="btn btn-danger btn-sm" onClick={() => disable(r)}>Desactivar</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager pager={t.pager} />
    </div>
  );
}

// ===================== ÚLTIMOS PEDIDOS =====================
function OrdersSection({ orders, loading }) {
  const [tripId, setTripId] = useState(null);
  const rows = useMemo(() => (orders || []).map((o) => ({ ...o, tripRank: o.hasTrip ? 1 : 0, totalStr: o.total ? money(o.total) : '—' })), [orders]);
  const t = useTable(rows, ORDER_COLS, ORDER_SEARCH, { key: 'created', dir: 'desc' });

  return (
    <div className="card">
      <div className="section-title"><h2>Últimos pedidos</h2><span className="text-xs muted">{t.total}</span></div>
      <Search value={t.query} onChange={t.setQuery} placeholder="Buscar repuesto, vehículo o total…" />
      <SortBar sortUI={t.sortUI} />
      <div style={{ overflowX: 'auto' }}>
        <table className="table rat-table">
          <Thead headers={t.headers} />
          <tbody>
            {loading && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 16 }}>Cargando…</td></tr>}
            {!loading && t.total === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 16 }}>Sin resultados</td></tr>}
            {t.visible.map((o) => (
              <tr key={o.id}>
                <td data-label="#" className="text-xs">{o.code}</td>
                <td data-label="Repuesto">{o.label}</td>
                <td data-label="Vehículo">{o.vehicle}</td>
                <td data-label="Total">{o.totalStr}</td>
                <td data-label="Estado"><span className="badge badge-gray">{o.status}</span></td>
                <td data-label="Creado" className="text-xs muted rat-th-date">{fmtDateTime(o.created)}</td>
                <td data-label="Concretada" className="text-xs muted rat-th-date">{fmtDateTime(o.concretada)}</td>
                <td data-label="Reparto">{o.hasTrip
                  ? <button className="btn btn-ghost btn-sm" onClick={() => setTripId(o.orderId)}><i className="fa-solid fa-truck-fast"></i> Ver reparto</button>
                  : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager pager={t.pager} />
      {tripId && <TripModal orderId={tripId} onClose={() => setTripId(null)} />}
    </div>
  );
}

function TripModal({ orderId, onClose }) {
  const [trip, setTrip] = useState(null);
  useEffect(() => { let alive = true; getAdminTrip(orderId).then((r) => { if (alive) setTrip(r || { events: [] }); }); return () => { alive = false; }; }, [orderId]);
  const ST = { PAID: ['badge-yellow', 'Pagado'], SHIPPED: ['badge-yellow', 'En camino'], DELIVERED: ['badge-green', 'Entregado'], DONE: ['badge-green', 'Entregado'] };
  const stBadge = trip ? (ST[trip.status] || ['badge-gray', trip.status]) : null;
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-handle"></div>
        <div className="flex-between mb-4">
          <h2 className="h-md">Historial de reparto</h2>
          <button className="icon-btn" type="button" onClick={onClose} title="Cerrar"><i className="fa-solid fa-xmark"></i></button>
        </div>
        {!trip ? <Loading label="Cargando reparto…" /> : (
          <>
            <p className="text-sm muted mb-16">{trip.code} · {trip.label}{trip.vehicle ? ` · ${trip.vehicle}` : ''}</p>
            <div className="map-mock mb-16"><div className="map-route"></div><div className="map-pin start"></div><div className="map-pin driver"></div><div className="map-pin end"></div></div>
            <div className="card mb-16" style={{ background: 'var(--bg-1)' }}>
              <div className="flex-center gap-12">
                <div className="store-avatar"><i className="fa-solid fa-motorcycle"></i></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-sm" style={{ fontWeight: 700 }}>{trip.courier || 'Sin repartidor asignado'}</div>
                  {trip.plate && <div className="text-xs muted">Patente {trip.plate}</div>}
                </div>
                {stBadge && <span className={`badge ${stBadge[0]}`}>{stBadge[1]}</span>}
              </div>
              {trip.consolidated && (
                <div className="float-notif mt-12" style={{ padding: '10px 12px' }}><i className="fa-solid fa-layer-group text-purple"></i><div className="text-xs subtle">Viaje <b>consolidado</b>: el repartidor retira piezas de más de un comercio en el mismo recorrido.</div></div>
              )}
            </div>
            <div className="timeline">
              {trip.events.map((e, i) => (
                <div key={i} className={`timeline-item ${e.state}`}>
                  <span className="dot"><i className={`fa-solid ${e.icon}`}></i></span>
                  <div className="t-title">{e.title}</div>
                  <div className="text-xs muted">{e.sub}</div>
                  <div className="t-time">{e.time ? fmtDateTime(e.time) : '—'}</div>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-block mt-16" type="button" onClick={onClose}>Cerrar</button>
          </>
        )}
      </div>
    </div>
  );
}

// ===================== CATEGORÍAS POR COMERCIO =====================
function StoreCategories({ stores, categories, onSaved }) {
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  if (!stores || !categories || stores.length === 0) return null;

  const q = query.trim().toLowerCase();
  let list = stores;
  if (q) list = list.filter((s) => (s.name || '').toLowerCase().includes(q));
  if (catFilter) list = list.filter((s) => (s.categoryIds || []).includes(Number(catFilter)));
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * perPage;
  const visible = list.slice(start, start + perPage);
  const pager = {
    info: total === 0 ? '0 comercios' : `${start + 1}–${Math.min(start + perPage, total)} de ${total}`,
    page: cur, buttons: pageButtons(cur, pages), perPage, setPerPage: (n) => { setPerPage(n); setPage(1); },
    prev: () => setPage((p) => Math.max(1, p - 1)), next: () => setPage((p) => Math.min(pages, p + 1)), go: setPage,
    prevDisabled: cur <= 1, nextDisabled: cur >= pages,
  };

  return (
    <div className="card mb-16">
      <div className="section-title"><h2>Categorías por comercio</h2><span className="text-xs muted">qué rubros cotiza cada uno</span></div>
      <p className="text-sm muted mb-12">Tildá los rubros que vende cada comercio: solo le van a llegar pedidos de esas categorías. Si no tildás ninguno, recibe de todas.</p>
      <div className="flex gap-12 mb-16" style={{ flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200, maxWidth: 340 }}>
          <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)', fontSize: 13, pointerEvents: 'none' }}></i>
          <input className="input" style={{ paddingLeft: 38 }} placeholder="Buscar comercio…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          {query && <button type="button" onClick={() => { setQuery(''); setPage(1); }} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}><i className="fa-solid fa-xmark"></i></button>}
        </div>
        <select className="select" style={{ flex: '0 1 260px', minWidth: 200 }} value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1); }}>
          <option value="">Todos los rubros</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {total === 0
        ? <div className="empty-state" style={{ padding: '32px 20px' }}><div className="empty-icon"><i className="fa-solid fa-store-slash"></i></div>No hay comercios que coincidan con el filtro.</div>
        : <div className="rat-store-grid">{visible.map((st) => <StoreCatCard key={st.id} store={st} categories={categories} onSaved={onSaved} />)}</div>}
      <Pager pager={pager} />
    </div>
  );
}

function StoreCatCard({ store, categories, onSaved }) {
  const [sel, setSel] = useState(() => new Set(store.categoryIds || []));
  const [saving, setSaving] = useState(false);
  // si el comercio cambió por recarga, re-sincronizar la selección
  useEffect(() => { setSel(new Set(store.categoryIds || [])); }, [store.categoryIds]);
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const countLabel = sel.size === 0 ? 'Recibe de todos los rubros' : `${sel.size} rubro${sel.size === 1 ? '' : 's'}`;
  async function save() {
    setSaving(true);
    const r = await setStoreCategories(store.id, [...sel]);
    setSaving(false);
    if (r?.error) { toast({ title: r.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
    toast({ title: 'Rubros guardados', sub: store.name, icon: 'fa-check', type: 'green' });
    onSaved?.();
  }
  return (
    <div className="rat-store-card">
      <div className="flex-between mb-12" style={{ gap: 12 }}>
        <div className="flex-center gap-12" style={{ minWidth: 0 }}>
          <div className="store-avatar"><i className="fa-solid fa-store"></i></div>
          <div style={{ minWidth: 0 }}>
            <div className="text-sm" style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{store.name}</div>
            <div className="text-xs muted" style={{ marginTop: 2 }}>{countLabel}</div>
          </div>
        </div>
        <button className="btn btn-yellow btn-sm" disabled={saving} onClick={save} style={{ flexShrink: 0 }}>{saving ? <span className="spinner" style={{ width: 14, height: 14 }}></span> : <><i className="fa-solid fa-floppy-disk"></i> Guardar</>}</button>
      </div>
      <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
        {categories.map((c) => {
          const on = sel.has(c.id);
          return (
            <button key={c.id} type="button" className="chip" onClick={() => toggle(c.id)} style={on ? { background: 'var(--purple)', color: '#fff', borderColor: 'var(--purple)' } : {}}>
              {on && <i className="fa-solid fa-check" style={{ fontSize: 10 }}></i>} {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===================== KPI / PRICING / ALTA / EDIT (sin cambios funcionales) =====================
function Kpi({ label, value, icon, yellow }) {
  return (
    <div className="card stat-card">
      <div className="flex-between"><span className="stat-label">{label}</span><i className={`fa-solid ${icon} ${yellow ? 'text-yellow' : 'text-purple'}`}></i></div>
      <div className={`stat-value ${yellow ? 'text-yellow' : ''}`}>{value}</div>
    </div>
  );
}

function Pricing() {
  // Arranca con valores vacíos para que la sección SIEMPRE se muestre (no queda en blanco si la
  // carga es lenta/falla, ni por el re-render del replaceState); se rellena al resolver el fetch.
  const [s, setS] = useState({ commissionPct: '', mpFeePct: '', mpFeeEnabled: false, minShip: '' });
  const [ready, setReady] = useState(false); // recién cargado: NO se puede guardar antes (evita pisar settings con vacío)
  useEffect(() => { getBusinessSettings().then((v) => { if (v) setS(v); setReady(true); }); }, []);
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  async function save() { const r = await saveBusinessSettings(s); if (r?.ok) toast({ title: 'Configuración guardada', icon: 'fa-check', type: 'green' }); }
  return (
    <div className="card mb-16">
      <div className="section-title"><h2>Comisión y recargo</h2></div>
      <div className="grid-2 mb-12">
        <div className="field" style={{ marginBottom: 0 }}><label>Comisión de la plataforma (%)</label><input className="input" inputMode="decimal" value={s.commissionPct} onChange={(e) => set('commissionPct', e.target.value)} /></div>
        <div className="field" style={{ marginBottom: 0 }}><label>Recargo Mercado Pago (%)</label><input className="input" inputMode="decimal" value={s.mpFeePct} onChange={(e) => set('mpFeePct', e.target.value)} /></div>
      </div>
      <div className="field mb-12" style={{ maxWidth: 220 }}>
        <label>Envío mínimo ($)</label>
        <input className="input" inputMode="numeric" value={s.minShip} onChange={(e) => set('minShip', e.target.value)} />
        <div className="text-xs muted mt-4">Ninguna banda de la tabla cobra menos que esto.</div>
      </div>
      <label className="flex-center gap-8 mb-8" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={s.mpFeeEnabled} onChange={(e) => set('mpFeeEnabled', e.target.checked)} />
        <span className="text-sm">Sumar el recargo de Mercado Pago al total que paga el cliente</span>
      </label>
      <p className="text-xs muted mb-12">La fee de MP varía por plazo de acreditación (al instante 6,39% · 18 días 3,44% · 35 días 1,51%) + IVA. Cargá el % que quieras trasladar al cliente.</p>
      <button className="btn btn-yellow btn-sm" disabled={!ready} onClick={save}><i className="fa-solid fa-floppy-disk"></i> Guardar</button>
    </div>
  );
}

const EMPTY = { role: 'STORE', email: '', name: '', phone: '', whatsapp: '', address: '', lat: null, lng: null, barrio: '', cuit: '', ivaCondition: 'RESPONSABLE_INSCRIPTO', vehicleType: 'MOTO', dni: '', licenseNumber: '', insurance: '', plate: '' };

function AltaUsuario({ onCreated }) {
  const [f, setF] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const isStore = f.role === 'STORE'; const isMech = f.role === 'MECHANIC'; const isCourier = f.role === 'DELIVERY';

  async function submit(e) {
    e.preventDefault(); setError('');
    if ((isStore || isMech) && (f.lat == null || f.lng == null)) { setError('Elegí la dirección del listado de sugerencias (escribí y tocá una opción).'); return; }
    setLoading(true);
    const res = await createUser(f); setLoading(false);
    if (res?.error) { setError(res.error); return; }
    setDone({ email: f.email.trim().toLowerCase(), tempPassword: res.tempPassword, geocoded: res.geocoded, geocodedLabel: res.geocodedLabel });
    setF(EMPTY); onCreated?.();
  }

  return (
    <div className="card mb-16">
      <div className="section-title"><h2>Alta de usuario</h2><span className="text-xs muted">por invitación manual</span></div>
      {done && (
        <div className="float-notif mb-16" style={{ borderColor: 'rgba(34,197,94,0.35)', background: 'linear-gradient(135deg,rgba(34,197,94,0.12),rgba(31,41,55,0.5))' }}>
          <i className="fa-solid fa-circle-check text-green"></i>
          <div className="text-sm subtle">
            <b>Usuario creado.</b> Pasale estas credenciales:
            <div className="text-xs mt-4">Email: <b>{done.email}</b> · Contraseña temporal: <b className="text-yellow">{done.tempPassword}</b></div>
            <div className="text-xs muted mt-4">{done.geocoded ? `📍 Dirección validada en Bariloche${done.geocodedLabel ? ': ' + done.geocodedLabel.split(',').slice(0, 3).join(',') : ''}` : 'Sin dirección (repartidor/admin)'} · <button className="text-purple" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700 }} onClick={() => navigator.clipboard?.writeText(`${done.email} / ${done.tempPassword}`)}>copiar</button></div>
          </div>
        </div>
      )}
      <form onSubmit={submit}>
        <div className="grid-2 mb-12">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Rol</label>
            <select className="select" value={f.role} onChange={(e) => set('role', e.target.value)}>
              <option value="STORE">Casa de repuestos (vendedor)</option>
              <option value="MECHANIC">Mecánico / Taller</option>
              <option value="DELIVERY">Repartidor</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{isStore ? 'Nombre del comercio' : isMech ? 'Nombre del taller' : 'Nombre'}</label>
            <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder={isStore ? 'Repuestos Centro' : isMech ? 'Taller Patagonia' : 'Diego R.'} />
          </div>
        </div>
        <div className="grid-2 mb-12">
          <div className="field" style={{ marginBottom: 0 }}><label>Email</label><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="cuenta@email.com" /></div>
          <div className="field" style={{ marginBottom: 0 }}><label>WhatsApp</label><input className="input" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+54 9 294 ..." /></div>
        </div>
        {(isStore || isMech) && (
          <div className="grid-2 mb-12">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Dirección *</label>
              <AddressAutocomplete value={f.address} picked={f.lat != null && f.lng != null}
                onType={(v) => setF((s) => ({ ...s, address: v, lat: null, lng: null }))}
                onPick={(c) => setF((s) => ({ ...s, address: c.label, lat: c.lat, lng: c.lng }))} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}><label>Barrio / zona</label><input className="input" value={f.barrio} onChange={(e) => set('barrio', e.target.value)} placeholder="Centro" /></div>
            {f.lat != null && f.lng != null && (
              <div style={{ gridColumn: '1 / -1' }}>
                <LocationPicker lat={f.lat} lng={f.lng} onChange={(la, ln) => setF((s) => ({ ...s, lat: la, lng: ln }))} />
              </div>
            )}
          </div>
        )}
        {isStore && (
          <div className="grid-2 mb-12">
            <div className="field" style={{ marginBottom: 0 }}><label>CUIT</label><input className="input" inputMode="numeric" value={f.cuit} onChange={(e) => set('cuit', e.target.value)} placeholder="30-12345678-9" /></div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Condición IVA</label>
              <select className="select" value={f.ivaCondition} onChange={(e) => set('ivaCondition', e.target.value)}>
                <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
                <option value="MONOTRIBUTO">Monotributo</option>
                <option value="EXENTO">Exento</option>
                <option value="CONSUMIDOR_FINAL">Consumidor Final</option>
              </select>
            </div>
          </div>
        )}
        {isCourier && (
          <>
            <div className="grid-2 mb-12">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Tipo de vehículo</label>
                <select className="select" value={f.vehicleType} onChange={(e) => set('vehicleType', e.target.value)}>
                  <option value="MOTO">Moto</option><option value="AUTO">Auto</option><option value="UTILITARIO">Utilitario</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}><label>Patente</label><input className="input" value={f.plate} onChange={(e) => set('plate', e.target.value)} placeholder="AB 123 CD" /></div>
            </div>
            <div className="grid-2 mb-12">
              <div className="field" style={{ marginBottom: 0 }}><label>DNI *</label><input className="input" inputMode="numeric" value={f.dni} onChange={(e) => set('dni', e.target.value)} placeholder="30111222" /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Licencia de conducir *</label><input className="input" value={f.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value)} placeholder="Nro de licencia" /></div>
            </div>
            <div className="field mb-12">
              <label>Seguro (aseguradora y póliza) *</label>
              <input className="input" value={f.insurance} onChange={(e) => set('insurance', e.target.value)} placeholder="Ej: Rivadavia · póliza 12345" />
              <div className="text-xs muted mt-4"><i className="fa-solid fa-circle-info"></i> Sin DNI + licencia + seguro, el repartidor queda deshabilitado para tomar pedidos.</div>
            </div>
          </>
        )}
        {error && <div className="text-sm text-red mb-12"><i className="fa-solid fa-circle-exclamation"></i> {error}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading || !f.email}>{loading ? <span className="spinner"></span> : <><i className="fa-solid fa-user-plus"></i> Crear usuario</>}</button>
        <span className="text-xs muted" style={{ marginLeft: 12 }}>Se genera una contraseña temporal para compartir.</span>
      </form>
    </div>
  );
}

function EditUserModal({ userId, onClose, onSaved }) {
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let alive = true;
    getUserDetail(userId).then((u) => {
      if (!alive || !u) return;
      setLocked(!!u.hasActiveWork);
      setF({
        role: u.role, name: u.name || u.store?.tradeName || u.mechanic?.workshopName || '', email: u.email || '',
        phone: u.phone || '', whatsapp: u.whatsapp || '', address: u.store?.address || u.mechanic?.address || '',
        lat: u.store?.lat ?? u.mechanic?.lat ?? null, lng: u.store?.lng ?? u.mechanic?.lng ?? null,
        barrio: u.store?.barrio || u.mechanic?.barrio || '', cuit: u.store?.cuit || '', ivaCondition: u.store?.ivaCondition || 'RESPONSABLE_INSCRIPTO',
        vehicleType: u.delivery?.vehicleType || 'MOTO', plate: u.delivery?.plate || '', dni: u.delivery?.dni || '',
        licenseNumber: u.delivery?.licenseNumber || '', insurance: u.delivery?.insurance || '',
      });
    });
    return () => { alive = false; };
  }, [userId]);

  if (!f) return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal"><div className="modal-handle"></div><Loading label="Cargando usuario…" /></div>
    </div>
  );

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const isStore = f.role === 'STORE'; const isMech = f.role === 'MECHANIC'; const isCourier = f.role === 'DELIVERY';

  async function save() {
    setError(''); setSaving(true);
    const res = await updateUser(userId, f);
    setSaving(false);
    if (res?.error) { setError(res.error); return; }
    toast({ title: 'Usuario actualizado', icon: 'fa-user-pen', type: 'green' });
    onSaved?.(); onClose();
  }

  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="modal">
        <div className="modal-handle"></div>
        <h2 className="h-md mb-4">Editar usuario</h2>
        <p className="text-sm muted mb-16">{f.email}</p>
        <div className="grid-2 mb-12">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Rol</label>
            <select className="select" value={f.role} disabled={locked} onChange={(e) => set('role', e.target.value)}>
              <option value="STORE">Casa de repuestos (vendedor)</option>
              <option value="MECHANIC">Mecánico / Taller</option>
              <option value="DELIVERY">Repartidor</option>
            </select>
            {locked && <div className="text-xs muted mt-4"><i className="fa-solid fa-lock"></i> Tiene órdenes/pedidos activos: el rol no se puede cambiar hasta cerrarlos.</div>}
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{isStore ? 'Nombre del comercio' : isMech ? 'Nombre del taller' : 'Nombre'}</label>
            <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} />
          </div>
        </div>
        <div className="grid-2 mb-12">
          <div className="field" style={{ marginBottom: 0 }}><label>Email</label><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div className="field" style={{ marginBottom: 0 }}><label>WhatsApp</label><input className="input" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} /></div>
        </div>
        <div className="field mb-12" style={{ maxWidth: '50%' }}><label>Teléfono</label><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        {(isStore || isMech) && (
          <div className="grid-2 mb-12">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Dirección *</label>
              <AddressAutocomplete value={f.address} picked={f.lat != null && f.lng != null}
                onType={(v) => setF((s) => ({ ...s, address: v, lat: null, lng: null }))}
                onPick={(c) => setF((s) => ({ ...s, address: c.label, lat: c.lat, lng: c.lng }))} />
              <div className="text-xs muted mt-4">Si no la cambiás, se conserva la dirección actual.</div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}><label>Barrio / zona</label><input className="input" value={f.barrio} onChange={(e) => set('barrio', e.target.value)} /></div>
            {f.lat != null && f.lng != null && (
              <div style={{ gridColumn: '1 / -1' }}>
                <LocationPicker lat={f.lat} lng={f.lng} onChange={(la, ln) => setF((s) => ({ ...s, lat: la, lng: ln }))} />
              </div>
            )}
          </div>
        )}
        {isStore && (
          <div className="grid-2 mb-12">
            <div className="field" style={{ marginBottom: 0 }}><label>CUIT</label><input className="input" inputMode="numeric" value={f.cuit} onChange={(e) => set('cuit', e.target.value)} /></div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Condición IVA</label>
              <select className="select" value={f.ivaCondition} onChange={(e) => set('ivaCondition', e.target.value)}>
                <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
                <option value="MONOTRIBUTO">Monotributo</option>
                <option value="EXENTO">Exento</option>
                <option value="CONSUMIDOR_FINAL">Consumidor Final</option>
              </select>
            </div>
          </div>
        )}
        {isCourier && (
          <>
            <div className="grid-2 mb-12">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Tipo de vehículo</label>
                <select className="select" value={f.vehicleType} onChange={(e) => set('vehicleType', e.target.value)}>
                  <option value="MOTO">Moto</option><option value="AUTO">Auto</option><option value="UTILITARIO">Utilitario</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}><label>Patente</label><input className="input" value={f.plate} onChange={(e) => set('plate', e.target.value)} /></div>
            </div>
            <div className="grid-2 mb-12">
              <div className="field" style={{ marginBottom: 0 }}><label>DNI</label><input className="input" inputMode="numeric" value={f.dni} onChange={(e) => set('dni', e.target.value)} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Licencia</label><input className="input" value={f.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value)} /></div>
            </div>
            <div className="field mb-12"><label>Seguro (aseguradora y póliza)</label><input className="input" value={f.insurance} onChange={(e) => set('insurance', e.target.value)} /><div className="text-xs muted mt-4"><i className="fa-solid fa-circle-info"></i> Sin DNI + licencia + seguro, el repartidor queda deshabilitado para tomar pedidos.</div></div>
          </>
        )}
        {error && <div className="text-sm text-red mb-12"><i className="fa-solid fa-circle-exclamation"></i> {error}</div>}
        <div className="flex gap-12">
          <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? <span className="spinner"></span> : <><i className="fa-solid fa-floppy-disk"></i> Guardar cambios</>}</button>
          <button className="btn btn-ghost" disabled={saving} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function AddressAutocomplete({ value, picked, onType, onPick }) {
  const [sug, setSug] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const tRef = useRef(null);
  function handleType(v) {
    onType(v);
    clearTimeout(tRef.current);
    if (v.trim().length < 4) { setSug([]); setOpen(false); return; }
    setLoading(true); setOpen(true);
    tRef.current = setTimeout(async () => {
      try { const res = await searchAddresses(v.trim()); setSug(res || []); } catch { setSug([]); }
      setLoading(false);
    }, 350);
  }
  return (
    <div style={{ position: 'relative' }}>
      <input className="input" value={value} autoComplete="off" placeholder="Escribí la calle y número, y elegí del listado"
        onChange={(e) => handleType(e.target.value)} onFocus={() => { if (sug.length) setOpen(true); }} />
      {picked
        ? <div className="text-xs text-green mt-4"><i className="fa-solid fa-circle-check"></i> Dirección validada en Bariloche</div>
        : value.trim().length >= 4 && <div className="text-xs muted mt-4">{loading ? 'Buscando…' : 'Elegí una opción del listado ↓'}</div>}
      {open && !picked && sug.length > 0 && (
        <div className="card address-suggest" style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, marginTop: 4, maxHeight: 240, overflowY: 'auto', padding: 6 }}>
          {sug.map((c, i) => (
            <button key={i} type="button" className="btn btn-ghost btn-sm btn-block" style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal' }}
              onClick={() => { onPick(c); setSug([]); setOpen(false); }}>
              <i className="fa-solid fa-location-dot text-purple"></i> {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
