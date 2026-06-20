import { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { fmtDateTime, toast } from '@/lib/ui';
import Loading from '@/components/Loading';
import { createUser, getUserDetail, updateUser, setUserStatus, setUserTempPassword, searchAddresses } from '@/app/actions/data';
import { useTable, Search, SortBar, Thead, Pager } from './table';
const LocationPicker = dynamic(() => import('@/components/LocationPicker'), { ssr: false });

const ROLE_LABEL = { ADMIN: 'Admin', MECHANIC: 'Mecánico', STORE: 'Vendedor', DELIVERY: 'Repartidor' };

const ST_BADGE = { ACTIVE: 'badge-green', PENDING: 'badge-yellow', SUSPENDED: 'badge-red' };

const USER_COLS = [
  { label: 'Nombre', key: 'name', type: 'str' },
  { label: 'Email', key: 'email', type: 'str' },
  { label: 'Rol', key: 'roleLabel', type: 'str' },
  { label: 'Estado', key: 'status', type: 'str' },
  { label: 'Alta', key: 'createdAt', type: 'num', date: true },
  { label: '', key: null },
];

const USER_SEARCH = ['name', 'email', 'roleLabel'];

const EMPTY = { role: 'STORE', email: '', name: '', phone: '', whatsapp: '', address: '', lat: null, lng: null, barrio: '', cuit: '', ivaCondition: 'RESPONSABLE_INSCRIPTO', vehicleType: 'MOTO', dni: '', licenseNumber: '', insurance: '', plate: '' };

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

export default UsersSection;
export { AltaUsuario };
