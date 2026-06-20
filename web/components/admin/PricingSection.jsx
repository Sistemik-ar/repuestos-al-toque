import { useState, useEffect } from 'react';
import { toast } from '@/lib/ui';
import { getBusinessSettings, saveBusinessSettings } from '@/app/actions/data';

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

export default Pricing;
