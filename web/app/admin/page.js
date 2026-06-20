'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money, toast, fmtDateTime } from '@/lib/ui';
import { getAdminData, setUserStatus, getShippingTariffs, saveShippingTariffs, createUser, getBusinessSettings, saveBusinessSettings, getCreditRequests, adminActOnCredit, disableCreditAccount, setStoreCategories, setUserTempPassword, searchAddresses, getUserDetail, updateUser, getAdminTrip } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';
import dynamic from 'next/dynamic';
import Loading from '@/components/Loading';
import FontScale from '@/components/FontScale';
import { useTable, pageButtons, Search, SortBar, Thead, Pager } from '@/components/admin/table';
import StatsSection from '@/components/admin/StatsSection';

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
  { label: 'Mecánico', key: 'mechanicName', type: 'str' },
  { label: 'Repuesto', key: 'label', type: 'str' },
  { label: 'Vehículo', key: 'vehicle', type: 'str' },
  { label: 'Total', key: 'total', type: 'num' },
  { label: 'Estado', key: 'status', type: 'str' },
  { label: 'Creado', key: 'created', type: 'num', date: true },
  { label: 'Concretada', key: 'concretada', type: 'num', date: true },
  { label: 'Reparto', key: 'tripRank', type: 'num' },
];
const ORDER_SEARCH = ['code', 'mechanicName', 'mechanicEmail', 'label', 'vehicle', 'status', 'total'];

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
  const [detail, setDetail] = useState(null); // pedido cuyo desglose (comisión/envío/MP) se muestra
  const rows = useMemo(() => (orders || []).map((o) => ({ ...o, tripRank: o.hasTrip ? 1 : 0, totalStr: o.total ? money(o.total) : '—' })), [orders]);
  const t = useTable(rows, ORDER_COLS, ORDER_SEARCH, { key: 'created', dir: 'desc' });

  return (
    <div className="card">
      <div className="section-title"><h2>Últimos pedidos</h2><span className="text-xs muted">{t.total}</span></div>
      <Search value={t.query} onChange={t.setQuery} placeholder="Buscar mecánico, repuesto, vehículo o total…" />
      <SortBar sortUI={t.sortUI} />
      <div style={{ overflowX: 'auto' }}>
        <table className="table rat-table">
          <Thead headers={t.headers} />
          <tbody>
            {loading && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 16 }}>Cargando…</td></tr>}
            {!loading && t.total === 0 && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 16 }}>Sin resultados</td></tr>}
            {t.visible.map((o) => (
              <tr key={o.id}>
                <td data-label="#" className="text-xs">{o.code}</td>
                <td data-label="Mecánico">{o.mechanicName}{o.mechanicEmail && o.mechanicEmail !== o.mechanicName && <div className="text-xs muted">{o.mechanicEmail}</div>}</td>
                <td data-label="Repuesto">{o.label}</td>
                <td data-label="Vehículo">{o.vehicle}</td>
                <td data-label="Total">{o.total ? <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 10px' }} onClick={() => setDetail(o)} title="Ver desglose">{o.totalStr} <i className="fa-solid fa-circle-info" style={{ fontSize: 11, opacity: 0.6 }}></i></button> : <span className="muted">—</span>}</td>
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
      {detail && <OrderBreakdownModal o={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

// Desglose CONGELADO de un pedido: comisión % + $, envío y recargo MP aplicados ese día.
// Audita el histórico — cambiar la comisión en Ajustes NO altera estos valores.
function OrderBreakdownModal({ o, onClose }) {
  const line = (icon, label, value, strong) => (
    <div className="flex-between" style={{ padding: '11px 0', borderBottom: strong ? 'none' : '1px solid var(--border)' }}>
      <span className="text-sm muted"><i className={`fa-solid ${icon}`} style={{ width: 18, marginRight: 8 }}></i>{label}</span>
      <span className="text-sm" style={{ fontWeight: strong ? 800 : 600 }}>{value}</span>
    </div>
  );
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-handle"></div>
        <div className="flex-between mb-4"><h2 className="h-md">Desglose del pedido</h2><button className="icon-btn" type="button" onClick={onClose} title="Cerrar"><i className="fa-solid fa-xmark"></i></button></div>
        <p className="text-sm muted mb-16">{o.code} · {o.label}{o.vehicle ? ` · ${o.vehicle}` : ''}</p>
        <div className="card" style={{ background: 'var(--bg-1)' }}>
          {line('fa-box', 'Repuesto', money(o.part))}
          {line('fa-percent', `Comisión (${o.commissionPct != null ? o.commissionPct : '—'}%)`, money(o.commission))}
          {line('fa-truck-fast', 'Envío', money(o.freight))}
          {line('fa-credit-card', 'Recargo Mercado Pago', o.mpFee ? money(o.mpFee) : 'No aplicado')}
          {o.creditAccount && line('fa-id-card-clip', 'Cuenta corriente', 'Sí · repuesto no cobrado acá')}
          {line('fa-receipt', 'Total cobrado', money(o.total), true)}
        </div>
        <div className="text-xs muted mt-12"><i className="fa-solid fa-circle-info"></i> Valores congelados al crearse el pedido. Cambiar la comisión/recargo en Ajustes solo afecta pedidos nuevos.</div>
      </div>
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
  const [s, setS] = useState({ commissionPct: '', mpFeePct: '', mpFeeEnabled: false, minShip: '', quoteWindowMin: '' });
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
      <div className="grid-2 mb-12">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Envío mínimo ($)</label>
          <input className="input" inputMode="numeric" value={s.minShip} onChange={(e) => set('minShip', e.target.value)} />
          <div className="text-xs muted mt-4">Ninguna banda de la tabla cobra menos que esto.</div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Contador de cotización (min)</label>
          <input className="input" inputMode="numeric" value={s.quoteWindowMin} onChange={(e) => set('quoteWindowMin', e.target.value)} />
          <div className="text-xs muted mt-4">Tiempo que ve el mecánico al publicar. <b>No vence el pedido</b> (informativo). 0 = sin contador.</div>
        </div>
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
