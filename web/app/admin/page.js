'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money, toast } from '@/lib/ui';
import { getAdminData, setUserStatus, getShippingTariffs, saveShippingTariffs } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';

const ROLE_LABEL = { ADMIN: 'Admin', MECHANIC: 'Mecánico', STORE: 'Vendedor', DELIVERY: 'Repartidor' };
const ST_BADGE = { ACTIVE: 'badge-green', PENDING: 'badge-yellow', SUSPENDED: 'badge-red' };

export default function Admin() {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [tariffs, setTariffs] = useState([]);

  const load = async () => { const [a, t] = await Promise.all([getAdminData(), getShippingTariffs()]); setD(a); setTariffs(t); };
  useEffect(() => { load(); const i = setInterval(load, 6000); return () => clearInterval(i); }, []);

  async function logout() { await logoutAction(); router.push('/login'); }
  async function toggleUser(u) {
    const next = u.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    await setUserStatus(u.id, next); toast({ title: next === 'ACTIVE' ? 'Reactivado' : 'Suspendido', sub: u.email, icon: 'fa-user', type: 'green' }); load();
  }

  // editor de tarifas
  function setRow(i, k, v) { setTariffs((t) => t.map((r, j) => (j === i ? { ...r, [k]: v } : r))); }
  function addRow() { setTariffs((t) => [...t, { uptoKm: '', price: '' }]); }
  function delRow(i) { setTariffs((t) => t.filter((_, j) => j !== i)); }
  async function saveT() { const res = await saveShippingTariffs(tariffs); if (res?.ok) { toast({ title: 'Tarifas guardadas', sub: `${res.count} bandas · mínimo $5.000`, icon: 'fa-check', type: 'green' }); load(); } }

  const k = d?.kpis || { users: 0, requests: 0, paid: 0, commission: 0 };

  return (
    <div className="app-shell wide">
      <div className="topbar">
        <Link href="/" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Admin · RepuestosAlToque</span></Link>
        <div className="topbar-actions">
          <span className="badge badge-gray"><i className="fa-solid fa-location-dot"></i> Bariloche</span>
          <button className="icon-btn" onClick={logout} title="Salir"><i className="fa-solid fa-right-from-bracket"></i></button>
        </div>
      </div>

      <div className="container">
        <div className="mb-16"><div className="eyebrow">Panel de control</div><h1 className="h-lg">Resumen</h1></div>

        <div className="dash-grid grid-2 mb-16">
          <Kpi label="Pedidos" value={String(k.requests)} icon="fa-receipt" />
          <Kpi label="Pagados" value={String(k.paid)} icon="fa-circle-check" />
          <Kpi label="Ingresos (comisión)" value={money(k.commission)} icon="fa-coins" yellow />
          <Kpi label="Usuarios" value={String(k.users)} icon="fa-users" />
        </div>

        {/* Tarifas de envío */}
        <div className="card mb-16">
          <div className="section-title"><h2>Tarifas de envío (por km)</h2><span className="text-xs muted">mínimo $5.000</span></div>
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

        {/* Usuarios */}
        <div className="card mb-16">
          <div className="section-title"><h2>Usuarios</h2><span className="text-xs muted">{d?.users?.length || 0}</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {(d?.users || []).map((u) => (
                  <tr key={u.id}>
                    <td>{u.name || '—'}</td>
                    <td className="text-xs">{u.email}</td>
                    <td><span className="badge badge-gray">{ROLE_LABEL[u.role] || u.role}</span></td>
                    <td><span className={`badge ${ST_BADGE[u.status] || 'badge-gray'}`}>{u.status}</span></td>
                    <td>{u.role !== 'ADMIN' && <button className={`btn btn-sm ${u.status === 'SUSPENDED' ? 'btn-success' : 'btn-ghost'}`} onClick={() => toggleUser(u)}>{u.status === 'SUSPENDED' ? 'Reactivar' : 'Suspender'}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Últimos pedidos */}
        <div className="card">
          <div className="section-title"><h2>Últimos pedidos</h2></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>#</th><th>Repuesto</th><th>Vehículo</th><th>Total</th><th>Estado</th></tr></thead>
              <tbody>
                {(d?.recent || []).length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 16 }}>Sin pedidos todavía</td></tr>}
                {(d?.recent || []).map((r) => (
                  <tr key={r.id}><td>{r.code}</td><td>{r.label}</td><td>{r.vehicle}</td><td>{r.total ? money(r.total) : '—'}</td><td><span className="badge badge-gray">{r.status}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-center text-xs muted mt-24 mb-24">RepuestosAlToque · Admin</p>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon, yellow }) {
  return (
    <div className="card stat-card">
      <div className="flex-between"><span className="stat-label">{label}</span><i className={`fa-solid ${icon} ${yellow ? 'text-yellow' : 'text-purple'}`}></i></div>
      <div className={`stat-value ${yellow ? 'text-yellow' : ''}`}>{value}</div>
    </div>
  );
}
