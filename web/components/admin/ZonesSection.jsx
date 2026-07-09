import { useEffect, useState } from 'react';
import { toast } from '@/lib/ui';
import { getZones, saveZone } from '@/app/actions/data';

// Zonas de cobertura (Ajustes): dónde se dan de alta usuarios y si ahí opera la flota.
// Sin delivery habilitado, los pedidos de mecánicos de esa zona se entregan por
// coordinación interna (no se cobra flete y no aparecen a los repartidores).
const EMPTY = { id: null, name: '', latMin: '', latMax: '', lngMin: '', lngMax: '', active: true, deliveryEnabled: false, storesEnabled: false };

export default function ZonesSection() {
  const [zones, setZones] = useState(null);
  const [draft, setDraft] = useState(null); // zona en edición (nueva o existente)
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => getZones().then(setZones);
  useEffect(() => { load(); }, []);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setError(''); setSaving(true);
    const res = await saveZone(draft);
    setSaving(false);
    if (res?.error) { setError(res.error); return; }
    toast({ title: draft.id ? 'Zona actualizada' : 'Zona creada', sub: draft.name, icon: 'fa-map-location-dot', type: 'green' });
    setDraft(null); load();
  }

  return (
    <div className="card mb-16">
      <div className="section-title"><h2>Zonas de cobertura</h2><span className="text-xs muted">alta de usuarios y delivery por ciudad</span></div>
      <p className="text-sm muted mb-12">
        Los usuarios solo se dan de alta con dirección dentro de una zona activa. Sin <b>delivery</b>, los pedidos
        de los mecánicos de esa zona se entregan por coordinación interna (no se cobra flete y no aparecen a los
        repartidores; los movimientos se registran desde Pedidos). Sin <b>comercios</b>, en esa zona solo se dan
        de alta mecánicos.
      </p>
      {zones === null ? <p className="text-sm muted">Cargando…</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Zona</th><th>Activa</th><th>Delivery</th><th>Comercios</th><th></th></tr></thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id}>
                  <td data-label="Zona"><b>{z.name}</b><div className="text-xs muted">lat {z.latMin} a {z.latMax} · lng {z.lngMin} a {z.lngMax}</div></td>
                  <td data-label="Activa"><span className={`badge ${z.active ? 'badge-green' : 'badge-gray'}`}>{z.active ? 'Sí' : 'No'}</span></td>
                  <td data-label="Delivery"><span className={`badge ${z.deliveryEnabled ? 'badge-green' : 'badge-yellow'}`}>{z.deliveryEnabled ? 'Con flota' : 'Coordinación interna'}</span></td>
                  <td data-label="Comercios"><span className={`badge ${z.storesEnabled ? 'badge-green' : 'badge-gray'}`}>{z.storesEnabled ? 'Sí' : 'Solo mecánicos'}</span></td>
                  <td className="rat-actions"><button className="btn btn-ghost btn-sm" onClick={() => { setError(''); setDraft({ ...z }); }}><i className="fa-solid fa-pen"></i> Editar</button></td>
                </tr>
              ))}
              {zones.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 16 }}>Sin zonas cargadas — se usa Bariloche por defecto. Creá la primera para poder ajustarla.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {!draft && <button className="btn btn-ghost btn-sm mt-12" onClick={() => { setError(''); setDraft({ ...EMPTY }); }}><i className="fa-solid fa-plus"></i> Agregar zona</button>}

      {draft && (
        <div className="card mt-12" style={{ background: 'var(--bg-1)' }}>
          <div className="section-title"><h2>{draft.id ? `Editar «${draft.name}»` : 'Nueva zona'}</h2></div>
          <div className="grid-2 mb-12">
            <div className="field" style={{ marginBottom: 0 }}><label>Nombre</label><input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="El Bolsón" /></div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Interruptores</label>
              <div className="flex gap-12" style={{ flexWrap: 'wrap', paddingTop: 6 }}>
                <label className="text-sm" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!draft.active} onChange={(e) => set('active', e.target.checked)} /> Activa</label>
                <label className="text-sm" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!draft.deliveryEnabled} onChange={(e) => set('deliveryEnabled', e.target.checked)} /> Delivery con flota</label>
                <label className="text-sm" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!draft.storesEnabled} onChange={(e) => set('storesEnabled', e.target.checked)} /> Comercios</label>
              </div>
            </div>
          </div>
          <div className="text-xs muted mb-8"><i className="fa-solid fa-circle-info"></i> Área (bounding box): esquinas del rectángulo que cubre la ciudad. En Argentina lat/lng son negativos: min es el número MÁS negativo (sur/oeste).</div>
          <div className="grid-2 mb-12">
            <div className="field" style={{ marginBottom: 0 }}><label>Lat mín (sur)</label><input className="input" inputMode="decimal" value={draft.latMin} onChange={(e) => set('latMin', e.target.value)} placeholder="-41.99" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Lat máx (norte)</label><input className="input" inputMode="decimal" value={draft.latMax} onChange={(e) => set('latMax', e.target.value)} placeholder="-41.87" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Lng mín (oeste)</label><input className="input" inputMode="decimal" value={draft.lngMin} onChange={(e) => set('lngMin', e.target.value)} placeholder="-71.65" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Lng máx (este)</label><input className="input" inputMode="decimal" value={draft.lngMax} onChange={(e) => set('lngMax', e.target.value)} placeholder="-71.45" /></div>
          </div>
          {error && <div className="text-sm text-red mb-12"><i className="fa-solid fa-circle-exclamation"></i> {error}</div>}
          <div className="flex gap-12">
            <button className="btn btn-yellow btn-sm" disabled={saving || !draft.name} onClick={save}>{saving ? <span className="spinner"></span> : <><i className="fa-solid fa-floppy-disk"></i> Guardar zona</>}</button>
            <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => setDraft(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
