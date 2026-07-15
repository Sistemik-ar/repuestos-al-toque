'use client';
import { useEffect, useState, useRef } from 'react';
import { usePoll, keep } from '@/lib/usePoll';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money, toast } from '@/lib/ui';
import { getAdminData, getShippingTariffs, saveShippingTariffs, getCreditRequests } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';
import Loading from '@/components/Loading';
import FontScale from '@/components/FontScale';
import StatsSection from '@/components/admin/StatsSection';
import Pricing from '@/components/admin/PricingSection';
import CreditSection from '@/components/admin/CreditSection';
import StoreCategories from '@/components/admin/StoreCategories';
import OrdersSection from '@/components/admin/OrdersSection';
import ZonesSection from '@/components/admin/ZonesSection';
import UsersSection, { AltaUsuario } from '@/components/admin/UsersSection';
import HomeSection from '@/components/admin/HomeSection';
import CobrosSection from '@/components/admin/CobrosSection';

const NAV = [
  ['inicio', 'fa-house', 'Inicio'],
  ['usuarios', 'fa-users', 'Usuarios'],
  ['comercios', 'fa-store', 'Comercios'],
  ['pedidos', 'fa-receipt', 'Pedidos'],
  ['cuentas', 'fa-id-card-clip', 'Cuenta corriente'],
  ['cobros', 'fa-money-bill-transfer', 'Cobros'],
  ['stats', 'fa-chart-line', 'Estadísticas'],
  ['ajustes', 'fa-sliders', 'Ajustes'],
];
const SEC_TITLE = { inicio: 'Inicio', usuarios: 'Usuarios', comercios: 'Comercios', pedidos: 'Pedidos', cuentas: 'Cuenta corriente', cobros: 'Cobros', stats: 'Estadísticas', ajustes: 'Ajustes' };

export default function Admin() {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [creds, setCreds] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('inicio');
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

  // Auto-poll con keep(): si los datos no cambiaron se mantiene la referencia anterior,
  // así el refresco de fondo no re-renderiza ni pisa búsqueda/filtros de las secciones.
  // El spinner solo gira en el refresh manual (el de fondo es silencioso).
  const load = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [a, c] = await Promise.all([getAdminData(), getCreditRequests()]);
      setD((p) => keep(p, a || null));
      setCreds((p) => keep(p, c || []));
    } catch {}
    if (manual) setRefreshing(false);
  };
  usePoll(load, 8000);
  // tarifas: se cargan una vez y se recargan tras guardar (no se pollean, para no pisar la edición)
  useEffect(() => { getShippingTariffs().then(setTariffs); }, []);

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
          <button className="icon-btn" onClick={() => load(true)} title="Actualizar" disabled={refreshing}><i className={`fa-solid fa-rotate ${refreshing ? 'fa-spin' : ''}`}></i></button>
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

        {tab !== 'inicio' && (d === null ? (
          <Loading label="Cargando el resumen…" />
        ) : (
          <div className="dash-grid grid-2 mb-16">
            <Kpi label="Pedidos" value={String(k.requests)} icon="fa-receipt" />
            <Kpi label="Pagados" value={String(k.paid)} icon="fa-circle-check" />
            <Kpi label="Ingresos (comisión)" value={money(k.commission)} icon="fa-coins" yellow />
            <Kpi label="Usuarios" value={String(k.users)} icon="fa-users" />
          </div>
        ))}

        {tab === 'inicio' && <HomeSection onNav={setTab} />}

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

        {tab === 'cobros' && <CobrosSection stores={d?.stores} />}

        {tab === 'pedidos' && <OrdersSection orders={d?.recent} loading={d === null} onReload={load} />}

        {tab === 'stats' && <StatsSection />}

        {tab === 'ajustes' && (<>
          <Pricing />
          <ZonesSection />
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

// ===================== CUENTA CORRIENTE =====================

// ===================== ÚLTIMOS PEDIDOS =====================

// Desglose CONGELADO de un pedido: comisión % + $, envío y recargo MP aplicados ese día.
// Audita el histórico — cambiar la comisión en Ajustes NO altera estos valores.

// ===================== CATEGORÍAS POR COMERCIO =====================

// ===================== KPI / PRICING / ALTA / EDIT (sin cambios funcionales) =====================
function Kpi({ label, value, icon, yellow }) {
  return (
    <div className="card stat-card">
      <div className="flex-between"><span className="stat-label">{label}</span><i className={`fa-solid ${icon} ${yellow ? 'text-yellow' : 'text-purple'}`}></i></div>
      <div className={`stat-value ${yellow ? 'text-yellow' : ''}`}>{value}</div>
    </div>
  );
}

