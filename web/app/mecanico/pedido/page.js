'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { data } from '@/lib/data';
import { toast } from '@/lib/ui';
import { addJobItem, publishJob } from '@/app/actions/data';
import { uploadPhoto } from '@/lib/upload';

const plateOk = (p) => /^([A-Z]{3}\s?\d{3}|[A-Z]{2}\s?\d{3}\s?[A-Z]{2})$/i.test(String(p || '').trim());

const years = [];
for (let y = 2026; y >= 1990; y--) years.push(String(y));
const labels = ['Vehículo', 'Categoría', 'Descripción', 'Urgencia', 'Confirmar'];

export default function Pedido() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [st, setSt] = useState({ brand: '', model: '', modelOther: '', year: '', plate: '', vin: '', cat: '', catLabel: '', desc: '', urgency: 'Necesito ahora', photoUrls: [], invoiceType: 'consumidor_final', emisorRazon: '', emisorCuit: '', solicRazon: '', solicCuit: '' });
  const [searching, setSearching] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [itemCount, setItemCount] = useState(0);
  const [added, setAdded] = useState(false); // pantalla "¿seguir comprando?"
  const [error, setError] = useState(''); // error persistente (no desaparece solo)
  const [uploading, setUploading] = useState(false);

  async function onPickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file, 'pedidos');
      setSt((s) => ({ ...s, photoUrls: [...s.photoUrls, url] }));
      toast({ title: 'Foto subida', icon: 'fa-image', type: 'green' });
    } catch (err) {
      toast({ title: 'No se pudo subir la foto', sub: String(err?.message || err), icon: 'fa-triangle-exclamation', type: 'yellow' });
    }
    setUploading(false);
  }

  const models = st.brand && data.models[st.brand] ? data.models[st.brand] : [];
  const needsOther = st.brand && (models.length === 0 || st.model === 'Otro');
  const set = (patch) => setSt((s) => ({ ...s, ...patch }));

  const cuitOk = (v) => /^\d{11}$/.test(String(v || '').replace(/\D/g, ''));
  const idOk = plateOk(st.plate) || String(st.vin).trim().length === 17; // patente O VIN, obligatorio
  const step1Valid = !!st.brand && !!(needsOther ? st.modelOther.trim() : st.model) && idOk;
  const step3Valid = !!st.desc.trim() &&
    (st.invoiceType !== 'factura_a' || (st.solicRazon.trim() && cuitOk(st.solicCuit)));
  const stepOk = step === 1 ? step1Valid : step === 3 ? step3Valid : true;

  function quickVehicle(b, m, y) {
    set({ brand: b, model: m, year: y, modelOther: '' });
    toast({ title: `${b} ${m}`, sub: 'Vehículo cargado', icon: 'fa-car', type: 'purple', duration: 1800 });
  }

  function next() {
    if (!stepOk) {
      if (step === 1) toast({ title: 'Elegí el vehículo', sub: 'Marca y modelo', icon: 'fa-car', type: 'yellow' });
      else if (step === 3 && !st.desc.trim()) toast({ title: 'Describí el repuesto', sub: 'Contá qué pieza necesitás', icon: 'fa-pen', type: 'yellow' });
      else toast({ title: 'Completá los datos de Factura A', sub: 'Razón social y CUIT (11 dígitos) en ambos bloques', icon: 'fa-triangle-exclamation', type: 'yellow' });
      return;
    }
    if (step < 5) { setStep(step + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else submit();
  }

  async function submit() {
    setError('');
    const payload = { ...st, model: needsOther ? st.modelOther : st.model, jobId };
    setSearching(true);
    const res = await addJobItem(payload);
    setSearching(false);
    if (res?.error) { setError(res.error); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setJobId(res.jobId);
    setItemCount((c) => c + 1);
    setAdded(true); // pantalla: ¿seguir comprando o publicar?
  }

  function otroRepuesto() {
    set({ cat: '', catLabel: '', desc: '', urgency: 'Necesito ahora', photoUrls: [] });
    setAdded(false); setStep(2); window.scrollTo({ top: 0 });
  }
  async function esoEsTodo() {
    const res = await publishJob(jobId);
    if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
    toast({ title: 'Presupuesto solicitado', sub: 'Los comercios tienen 10 minutos para cotizar', icon: 'fa-paper-plane', type: 'green' });
    router.push('/mecanico/trabajo?id=' + jobId);
  }
  async function otroAuto() {
    const res = await publishJob(jobId);
    if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
    toast({ title: 'Presupuesto solicitado', sub: 'Arranquemos con el otro auto', icon: 'fa-car', type: 'green' });
    setSt({ brand: '', model: '', modelOther: '', year: '', plate: '', vin: '', cat: '', catLabel: '', desc: '', urgency: 'Necesito ahora', photoUrls: [], invoiceType: 'consumidor_final', emisorRazon: '', emisorCuit: '', solicRazon: '', solicCuit: '' });
    setJobId(null); setItemCount(0); setAdded(false); setStep(1); window.scrollTo({ top: 0 });
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="flex-center">
          <Link href="/mecanico" className="icon-btn"><i className="fa-solid fa-arrow-left"></i></Link>
          <div>
            <div style={{ fontWeight: 800 }}>Nuevo pedido</div>
            <div className="text-xs muted">Paso {step} de 5 · {labels[step - 1]}</div>
          </div>
        </div>
        <Link href="/mecanico" className="icon-btn"><i className="fa-solid fa-xmark"></i></Link>
      </div>

      <div className="container form-narrow">
        {error && (
          <div className="card mb-16" style={{ borderColor: 'rgba(239,68,68,0.55)', background: 'rgba(239,68,68,0.10)' }}>
            <div className="flex-center gap-12">
              <div className="store-avatar" style={{ width: 36, height: 36, background: 'rgba(239,68,68,0.2)', color: '#FCA5A5', flexShrink: 0 }}><i className="fa-solid fa-triangle-exclamation"></i></div>
              <div style={{ flex: 1 }}><div className="text-sm" style={{ fontWeight: 800, color: '#FCA5A5' }}>No pudimos enviar el pedido</div><div className="text-sm subtle mt-4">{error}</div></div>
              <button className="icon-btn" style={{ flexShrink: 0 }} onClick={() => setError('')}><i className="fa-solid fa-xmark"></i></button>
            </div>
            {/^La patente/.test(error) && (
              <button className="btn btn-ghost btn-sm btn-block mt-12" onClick={() => { setError(''); setStep(1); window.scrollTo({ top: 0 }); }}><i className="fa-solid fa-pen"></i> Corregir la patente</button>
            )}
          </div>
        )}
        <div className="steps">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`step ${i < step ? 'done' : i === step ? 'current' : ''}`}></div>
          ))}
        </div>

        {step === 1 && (
          <div>
            <div className="eyebrow mb-8">Paso 1</div>
            <h2 className="h-lg mb-16">¿Para qué vehículo?</h2>
            <div className="field">
              <label>Marca</label>
              <select className="select" value={st.brand} onChange={(e) => set({ brand: e.target.value, model: '', modelOther: '' })}>
                <option value="">Elegí una marca</option>
                {data.brands.map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Modelo</label>
              {!needsOther ? (
                <select className="select" value={st.model} disabled={!st.brand} onChange={(e) => set({ model: e.target.value })}>
                  <option value="">{st.brand ? 'Elegí un modelo' : 'Elegí primero la marca'}</option>
                  {models.map((m) => <option key={m}>{m}</option>)}
                  {st.brand && models.length > 0 && <option>Otro</option>}
                </select>
              ) : (
                <input className="input" placeholder="Escribí el modelo" value={st.modelOther} onChange={(e) => set({ modelOther: e.target.value })} />
              )}
            </div>
            <div className="field">
              <label>Año</label>
              <select className="select" value={st.year} onChange={(e) => set({ year: e.target.value })}>
                <option value="">Año</option>
                {years.map((y) => <option key={y}>{y}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Patente *</label>
              <input className="input" placeholder="ABC123 o AB123CD" style={{ textTransform: 'uppercase' }} value={st.plate} onChange={(e) => set({ plate: e.target.value.toUpperCase() })} />
              {st.plate && !plateOk(st.plate) && <div className="text-xs text-red mt-4">Formato: ABC123 o AB123CD</div>}
              <div className="text-xs muted mt-4"><i className="fa-solid fa-truck-fast"></i> La patente agrupa los repuestos de este auto en un solo envío. ¡Cargala bien!</div>
            </div>
            <div className="field">
              <label>VIN <span className="muted">(opcional si cargaste patente)</span></label>
              <input className="input" placeholder="Ej: 8AJHA8CD9J1234567" value={st.vin} onChange={(e) => set({ vin: e.target.value })} />
            </div>
            <div className="chip-row mb-8">
              <span className="text-xs muted" style={{ alignSelf: 'center' }}>Frecuentes:</span>
              <button className="chip" onClick={() => quickVehicle('Toyota', 'Hilux', '2019')}>Toyota Hilux</button>
              <button className="chip" onClick={() => quickVehicle('Volkswagen', 'Amarok', '2021')}>VW Amarok</button>
              <button className="chip" onClick={() => quickVehicle('Ford', 'Ranger', '2020')}>Ford Ranger</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="eyebrow mb-8">Paso 2</div>
            <h2 className="h-lg mb-16">¿Qué tipo de repuesto?</h2>
            <div className="grid-3">
              {data.categories.map((c) => (
                <button key={c.id} className={`card hoverable text-center ${st.cat === c.id ? 'glow' : ''}`} style={{ padding: '18px 8px', cursor: 'pointer' }}
                  onClick={() => { set({ cat: c.id, catLabel: c.label }); setTimeout(() => { setStep(3); window.scrollTo({ top: 0 }); }, 200); }}>
                  <i className={`fa-solid ${c.icon} text-purple`} style={{ fontSize: 22 }}></i>
                  <div className="text-sm mt-8" style={{ fontWeight: 700 }}>{c.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="eyebrow mb-8">Paso 3</div>
            <h2 className="h-lg mb-16">Describí el repuesto</h2>
            <div className="field">
              <label>Detalle</label>
              <textarea className="textarea" maxLength={500} placeholder="Ej: Juego de pastillas de freno delanteras, originales o equivalentes." value={st.desc} onChange={(e) => set({ desc: e.target.value })}></textarea>
            </div>
            <div className="field">
              <label>Foto <span className="muted">(opcional)</span></label>
              <input id="reqPhoto" type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPickPhoto} />
              <label htmlFor="reqPhoto" className="upload-area" style={{ display: 'block', cursor: 'pointer' }}>
                <i className={`fa-solid ${uploading ? 'fa-spinner fa-spin' : 'fa-camera'}`} style={{ fontSize: 24 }}></i>
                <div className="text-sm mt-8" style={{ fontWeight: 600 }}>{uploading ? 'Subiendo…' : 'Agregar foto'}</div>
                <div className="text-xs">Sacá foto de la pieza o el número de parte</div>
              </label>
              {st.photoUrls.length > 0 && (
                <div className="flex gap-8 mt-12" style={{ flexWrap: 'wrap' }}>
                  {st.photoUrls.map((url, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img src={url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
                      <button onClick={() => set({ photoUrls: st.photoUrls.filter((_, j) => j !== i) })} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <InvoiceSection st={st} set={set} />
          </div>
        )}

        {step === 4 && (
          <div>
            <div className="eyebrow mb-8">Paso 4</div>
            <h2 className="h-lg mb-8">¿Para cuándo lo necesitás?</h2>
            <p className="text-sm muted mb-16">Define la prioridad con la que notificamos a los comercios.</p>
            <div className="flex-col gap-12">
              {[
                { v: 'Necesito ahora', d: 'Auto parado · máxima prioridad', i: 'fa-bolt', bg: 'rgba(239,68,68,0.16)', c: '#FCA5A5' },
                { v: 'Hoy', d: 'En el día', i: 'fa-sun', bg: 'rgba(250,204,21,0.16)', c: 'var(--yellow)' },
                { v: 'Mañana', d: 'Sin apuro', i: 'fa-calendar-day', bg: 'rgba(109,40,217,0.18)', c: 'var(--purple-light)' },
              ].map((o) => (
                <div key={o.v} className={`card hoverable ${st.urgency === o.v ? 'glow' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }} onClick={() => set({ urgency: o.v })}>
                  <div className="store-avatar" style={{ background: o.bg, color: o.c }}><i className={`fa-solid ${o.i}`}></i></div>
                  <div style={{ flex: 1 }}><div className="h-md">{o.v}</div><div className="text-sm muted">{o.d}</div></div>
                  {st.urgency === o.v && <i className="fa-solid fa-circle-check text-yellow"></i>}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <div className="eyebrow mb-8">Paso 5</div>
            <h2 className="h-lg mb-16">Revisá y enviá</h2>
            <div className="card mb-12">
              <Row icon="fa-car" label="Vehículo" value={`${st.brand || 'Toyota'} ${(needsOther ? st.modelOther : st.model) || 'Hilux'} ${st.year || '2019'}`} />
              <Row icon="fa-layer-group" label="Categoría" value={st.catLabel || 'Frenos'} />
              <Row icon="fa-align-left" label="Detalle" value={st.desc || 'Pastillas de freno delanteras'} />
              <Row icon="fa-bolt" label="Urgencia" value={st.urgency} />
              <Row icon="fa-file-invoice" label="Factura" value={st.invoiceType === 'factura_a' ? 'Factura A' : 'Consumidor Final'} last />
            </div>
            <div className="float-notif">
              <i className="fa-solid fa-circle-info text-purple"></i>
              <div className="text-sm subtle">Notificamos a las casas de <b>{st.catLabel || 'Frenos'}</b> en Bariloche. Recibís las ofertas al cerrarse la ventana de <b className="text-yellow">10 minutos</b>.</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, padding: '14px 16px', background: 'linear-gradient(0deg,var(--bg-0),transparent)' }}>
        <div className="flex gap-12">
          {step > 1 && <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => setStep(step - 1)}><i className="fa-solid fa-arrow-left"></i></button>}
          <button className={`btn btn-block ${step === 5 ? 'btn-yellow' : 'btn-primary'}`} disabled={!stepOk} onClick={next}>
            {step === 5 ? <><i className="fa-solid fa-paper-plane"></i> Enviar pedido</> : <>Continuar <i className="fa-solid fa-arrow-right"></i></>}
          </button>
        </div>
      </div>

      {searching && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-0)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner"></div>
        </div>
      )}

      {/* ¿Seguir comprando? (los 3 botones) */}
      {added && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-0)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="form-narrow" style={{ width: '100%', maxWidth: 480 }}>
            <div className="card glow mb-16" style={{ textAlign: 'center' }}>
              <div className="store-avatar" style={{ margin: '0 auto 10px', background: 'rgba(34,197,94,0.16)', color: '#4ADE80' }}><i className="fa-solid fa-check"></i></div>
              <div className="h-md">Repuesto agregado</div>
              <div className="text-sm muted mt-4">{st.brand} {needsOther ? st.modelOther : st.model} · {st.plate || st.vin} · <b>{itemCount} ítem{itemCount === 1 ? '' : 's'}</b> en este trabajo</div>
              <div className="text-xs muted mt-8"><i className="fa-solid fa-circle-info"></i> Los comercios recién lo ven cuando publiques. Todo lo de este auto viaja en un solo envío por comercio.</div>
            </div>
            <button className="btn btn-primary btn-block btn-lg mb-12" onClick={otroRepuesto}><i className="fa-solid fa-plus"></i> Agregar otro repuesto a este auto</button>
            <button className="btn btn-ghost btn-block mb-12" onClick={otroAuto}><i className="fa-solid fa-car"></i> Publicar y comprar para otro auto</button>
            <button className="btn btn-yellow btn-block btn-lg" onClick={esoEsTodo}><i className="fa-solid fa-paper-plane"></i> Eso es todo · solicitar presupuesto</button>
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceSection({ st, set }) {
  const cuitErr = (v) => v && !/^\d{11}$/.test(String(v).replace(/\D/g, ''));
  return (
    <div className="field">
      <label>Tipo de factura *</label>
      <div className="grid-2 mb-12">
        <button type="button" className={`card hoverable text-center ${st.invoiceType === 'consumidor_final' ? 'glow' : ''}`} style={{ cursor: 'pointer', padding: '14px 8px' }} onClick={() => set({ invoiceType: 'consumidor_final' })}>
          <i className="fa-solid fa-user text-purple" style={{ fontSize: 18 }}></i>
          <div className="text-sm mt-8" style={{ fontWeight: 700 }}>Consumidor Final</div>
        </button>
        <button type="button" className={`card hoverable text-center ${st.invoiceType === 'factura_a' ? 'glow' : ''}`} style={{ cursor: 'pointer', padding: '14px 8px' }} onClick={() => set({ invoiceType: 'factura_a' })}>
          <i className="fa-solid fa-file-invoice text-yellow" style={{ fontSize: 18 }}></i>
          <div className="text-sm mt-8" style={{ fontWeight: 700 }}>Factura A</div>
        </button>
      </div>

      {st.invoiceType === 'factura_a' && (
        <div className="animate-in">
          <div className="float-notif mb-12" style={{ padding: '10px 12px' }}><i className="fa-solid fa-circle-info text-purple"></i><div className="text-xs subtle">Los datos del <b>emisor</b> los completa el comercio que te vende (con su CUIT). Vos cargás los datos a nombre de quién va la factura.</div></div>
          <div className="card mb-12">
            <div className="eyebrow mb-8">Datos del solicitante de la factura</div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Razón Social</label>
              <input className="input" value={st.solicRazon} onChange={(e) => set({ solicRazon: e.target.value })} placeholder="Tu razón social" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>CUIT</label>
              <input className="input" inputMode="numeric" value={st.solicCuit} onChange={(e) => set({ solicCuit: e.target.value })} placeholder="11 dígitos" />
              {cuitErr(st.solicCuit) && <div className="text-xs text-red mt-4">El CUIT debe tener 11 dígitos</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, value, last }) {
  return (
    <div className="list-row" style={{ paddingTop: 0, ...(last ? { paddingBottom: 0, borderBottom: 'none' } : {}) }}>
      <i className={`fa-solid ${icon} text-purple`} style={{ width: 20 }}></i>
      <div style={{ flex: 1 }}>
        <div className="text-xs muted">{label}</div>
        <div className="text-sm" style={{ fontWeight: 700 }}>{value}</div>
      </div>
    </div>
  );
}
