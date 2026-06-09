'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money, toast } from '@/lib/ui';
import { usePoll } from '@/lib/usePoll';
import { getAdminData, setUserStatus, getShippingTariffs, saveShippingTariffs, createUser, getBusinessSettings, saveBusinessSettings, getCreditRequests, adminActOnCredit, disableCreditAccount } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';

const ROLE_LABEL = { ADMIN: 'Admin', MECHANIC: 'Mecánico', STORE: 'Vendedor', DELIVERY: 'Repartidor' };
const ST_BADGE = { ACTIVE: 'badge-green', PENDING: 'badge-yellow', SUSPENDED: 'badge-red' };

export default function Admin() {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [tariffs, setTariffs] = useState([]);

  const load = async () => { const [a, t] = await Promise.all([getAdminData(), getShippingTariffs()]); setD(a); setTariffs(t); };
  usePoll(load, 6000);

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

        {/* Alta de usuarios */}
        <AltaUsuario onCreated={load} />

        {/* Comisión y recargo */}
        <Pricing />

        {/* Cuentas corrientes */}
        <CreditRequests />

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

const CC_BADGE = { PENDING: ['badge-yellow', 'Pendiente'], APPROVED: ['badge-green', 'Aprobado'], REJECTED: ['badge-red', 'Rechazado'] };
const CC_STATE = { PENDING: ['badge-yellow', 'Pendiente'], ACTIVE: ['badge-green', 'Activa'], REJECTED: ['badge-red', 'Rechazada'], DISABLED: ['badge-gray', 'Desactivada'] };

function CreditRequests() {
  const [rows, setRows] = useState([]);
  const load = async () => setRows(await getCreditRequests());
  usePoll(load, 6000);

  async function approve(r) { await adminActOnCredit(r.id, true, null); toast({ title: 'Vinculación validada', icon: 'fa-check', type: 'green' }); load(); }
  async function reject(r) { const note = window.prompt('Observación interna (opcional):') || null; await adminActOnCredit(r.id, false, note); toast({ title: 'Rechazada', icon: 'fa-ban', type: 'purple' }); load(); }
  async function disable(r) { await disableCreditAccount(r.id); toast({ title: 'Relación desactivada', icon: 'fa-ban', type: 'purple' }); load(); }

  return (
    <div className="card mb-16">
      <div className="section-title"><h2>Solicitudes de Cuenta Corriente</h2><span className="text-xs muted">{rows.length}</span></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead><tr><th>Mecánico</th><th>Comercio</th><th>Admin</th><th>Comercio</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 16 }}>Sin solicitudes</td></tr>}
            {rows.map((r) => {
              const st = CC_STATE[r.status] || ['badge-gray', r.status];
              const a = CC_BADGE[r.adminStatus]; const sc = CC_BADGE[r.storeStatus];
              return (
                <tr key={r.id}>
                  <td>{r.mechanicName}</td>
                  <td>{r.storeName}</td>
                  <td><span className={`badge ${a[0]}`}>{a[1]}</span></td>
                  <td><span className={`badge ${sc[0]}`}>{sc[1]}</span></td>
                  <td><span className={`badge ${st[0]}`}>{st[1]}</span>{r.adminNote && <div className="text-xs muted mt-4" title={r.adminNote}><i className="fa-solid fa-note-sticky"></i> nota</div>}</td>
                  <td>
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
    </div>
  );
}

function Pricing() {
  const [s, setS] = useState(null);
  useEffect(() => { getBusinessSettings().then(setS); }, []);
  if (!s) return null;
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  async function save() { const r = await saveBusinessSettings(s); if (r?.ok) toast({ title: 'Configuración guardada', icon: 'fa-check', type: 'green' }); }
  return (
    <div className="card mb-16">
      <div className="section-title"><h2>Comisión y recargo</h2></div>
      <div className="grid-2 mb-12">
        <div className="field" style={{ marginBottom: 0 }}><label>Comisión de la plataforma (%)</label><input className="input" inputMode="decimal" value={s.commissionPct} onChange={(e) => set('commissionPct', e.target.value)} /></div>
        <div className="field" style={{ marginBottom: 0 }}><label>Recargo Mercado Pago (%)</label><input className="input" inputMode="decimal" value={s.mpFeePct} onChange={(e) => set('mpFeePct', e.target.value)} /></div>
      </div>
      <label className="flex-center gap-8 mb-8" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={s.mpFeeEnabled} onChange={(e) => set('mpFeeEnabled', e.target.checked)} />
        <span className="text-sm">Sumar el recargo de Mercado Pago al total que paga el cliente</span>
      </label>
      <p className="text-xs muted mb-12">La fee de MP varía por plazo de acreditación (al instante 6,39% · 18 días 3,44% · 35 días 1,51%) + IVA. Cargá el % que quieras trasladar al cliente.</p>
      <button className="btn btn-yellow btn-sm" onClick={save}><i className="fa-solid fa-floppy-disk"></i> Guardar</button>
    </div>
  );
}

const EMPTY = { role: 'STORE', email: '', name: '', phone: '', whatsapp: '', address: '', barrio: '', cuit: '', ivaCondition: 'RESPONSABLE_INSCRIPTO', vehicleType: 'MOTO' };

function AltaUsuario({ onCreated }) {
  const [f, setF] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // {email, tempPassword, geocoded}
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const isStore = f.role === 'STORE';
  const isMech = f.role === 'MECHANIC';
  const isCourier = f.role === 'DELIVERY';

  async function submit(e) {
    e.preventDefault(); setError(''); setLoading(true);
    const res = await createUser(f); setLoading(false);
    if (res?.error) { setError(res.error); return; }
    setDone({ email: f.email.trim().toLowerCase(), tempPassword: res.tempPassword, geocoded: res.geocoded });
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
            <div className="text-xs muted mt-4">{done.geocoded ? '📍 Dirección geocodificada (envío por distancia OK)' : '⚠️ No se pudo geocodificar la dirección (usará envío mínimo)'} · <button className="text-purple" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700 }} onClick={() => navigator.clipboard?.writeText(`${done.email} / ${done.tempPassword}`)}>copiar</button></div>
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
            <div className="field" style={{ marginBottom: 0 }}><label>Dirección</label><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Av. Bustillo 1240" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Barrio / zona</label><input className="input" value={f.barrio} onChange={(e) => set('barrio', e.target.value)} placeholder="Centro" /></div>
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
          <div className="field mb-12" style={{ marginBottom: 12 }}>
            <label>Tipo de vehículo</label>
            <select className="select" value={f.vehicleType} onChange={(e) => set('vehicleType', e.target.value)}>
              <option value="MOTO">Moto</option><option value="AUTO">Auto</option><option value="UTILITARIO">Utilitario</option>
            </select>
          </div>
        )}

        {error && <div className="text-sm text-red mb-12"><i className="fa-solid fa-circle-exclamation"></i> {error}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading || !f.email}>{loading ? <span className="spinner"></span> : <><i className="fa-solid fa-user-plus"></i> Crear usuario</>}</button>
        <span className="text-xs muted" style={{ marginLeft: 12 }}>Se genera una contraseña temporal para compartir.</span>
      </form>
    </div>
  );
}
