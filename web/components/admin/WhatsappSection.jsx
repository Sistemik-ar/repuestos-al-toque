'use client';
// Admin · Avisos por WhatsApp: números de guardia, salud del canal, kill switch y
// control total de los mensajes del bot (historial con estados, respuestas, plantillas).
import { useEffect, useState } from 'react';
import { toast } from '@/lib/ui';
import {
  getWaAdminData, getWaMessagesData, waSetPaused, waSaveGuard, waVerifyGuard, waResendGuard,
  waToggleGuard, waSetGuardEvents, waDeleteGuard, waRetryMessage, waRemindStores,
} from '@/app/actions/whatsapp';

const EVENTS = [
  { id: 'solicitud', label: 'Nueva solicitud', icon: 'fa-wrench', cls: 'purple' },
  { id: 'cotizacion', label: 'Nueva cotización', icon: 'fa-file-invoice-dollar', cls: 'yellow' },
  { id: 'pago', label: 'Pago acreditado', icon: 'fa-circle-dollar-to-slot', cls: 'green' },
  { id: 'mp', label: 'Comercio vinculó MP', icon: 'fa-link', cls: 'blue' },
];
const EV = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
EV.verificacion = { label: 'Código de verificación', icon: 'fa-key', cls: 'purple' };
EV.prueba = { label: 'Aviso de prueba', icon: 'fa-paper-plane', cls: 'green' };

const digits = (v) => String(v || '').replace(/\D/g, '');
const fmtPhoneInput = (d) => (d.length <= 3 ? d : d.length <= 6 ? `${d.slice(0, 3)} ${d.slice(3)}` : `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 10)}`);

// "Hoy 11:47" / "Ayer 19:32" / "12 jul 09:15"
function fmtWhen(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const hm = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return `Hoy ${hm}`;
  if (diff === 1) return `Ayer ${hm}`;
  return `${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} ${hm}`;
}

const roleChip = (r) => ({
  comercio: <span className="role-chip role-comercio"><i className="fa-solid fa-store"></i> Comercio</span>,
  admin: <span className="role-chip role-admin"><i className="fa-solid fa-user-shield"></i> Admin</span>,
  mecanico: <span className="role-chip role-mecanico"><i className="fa-solid fa-wrench"></i> Mecánico</span>,
}[r] || null);

export default function WhatsappSection() {
  const [d, setD] = useState(null); // guardia y canal
  const [m, setM] = useState(null); // mensajes
  const [tab, setTab] = useState('guardia');
  const [modal, setModal] = useState(null); // null | {} (alta) | guard (edición)

  const load = async () => {
    const [a, b] = await Promise.all([getWaAdminData(), getWaMessagesData()]);
    setD(a); setM(b);
  };
  useEffect(() => { load(); }, []);

  if (d === null) return <div className="card"><p className="muted text-sm" style={{ padding: 8 }}>Cargando…</p></div>;

  const failCount = (m?.messages || []).filter((x) => x.status === 'failed').length;

  async function togglePause(on) {
    if (on && !window.confirm('¿Pausar TODOS los avisos? Nadie va a recibir mensajes del bot hasta reanudarlos.')) return;
    const r = await waSetPaused(on);
    if (r?.error) { toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
    toast(on
      ? { title: 'Avisos pausados globalmente', sub: 'Los eventos se siguen registrando', icon: 'fa-hand', type: 'red' }
      : { title: 'Avisos reanudados', sub: 'El bot vuelve a enviar mensajes', icon: 'fa-play', type: 'green' });
    load();
  }

  return (
    <>
      <div className="flex-between mb-16" style={{ flexWrap: 'wrap', gap: 10 }}>
        <p className="cm-intro" style={{ margin: 0, flex: 1, minWidth: 260 }}>Números de guardia, eventos que reciben y salud del canal. {d.testMode && <span className="badge badge-yellow"><i className="fa-solid fa-flask"></i> Modo prueba</span>}</p>
        <div className="flex gap-12">
          {!d.paused && <button className="btn btn-ghost btn-sm" style={{ borderColor: 'rgba(239,68,68,0.35)', color: '#FCA5A5' }} onClick={() => togglePause(true)}><i className="fa-solid fa-hand"></i> Pausar todos los avisos</button>}
          <button className="btn btn-primary btn-sm" onClick={() => setModal({})}><i className="fa-solid fa-plus"></i> Agregar número</button>
        </div>
      </div>

      {d.paused && (
        <div className="wa-alert danger mb-16">
          <div className="al-ic"><i className="fa-solid fa-hand"></i></div>
          <div className="al-main">
            <div className="al-t">Todos los avisos están pausados</div>
            <div className="al-s">Nadie recibe mensajes del bot — ni comercios, ni mecánicos, ni guardia. Los eventos se siguen registrando.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => togglePause(false)}><i className="fa-solid fa-play"></i> Reanudar avisos</button>
        </div>
      )}

      <div className="pill-tabs mb-16">
        <button className={tab === 'guardia' ? 'active' : ''} onClick={() => setTab('guardia')}><i className="fa-solid fa-tower-broadcast"></i> Guardia y canal</button>
        <button className={tab === 'mensajes' ? 'active' : ''} onClick={() => setTab('mensajes')}>
          <i className="fa-solid fa-comment-dots"></i> Mensajes {failCount > 0 && <span className="badge badge-red" style={{ marginLeft: 6 }}>{failCount}</span>}
        </button>
      </div>

      {tab === 'guardia' && (!d.configured
        ? <SetupChecklist />
        : <GuardTab d={d} onReload={load} onEdit={(g) => setModal(g)} onAdd={() => setModal({})} />)}

      {tab === 'mensajes' && <MessagesTab m={m} onReload={load} />}

      {modal !== null && <GuardModal guard={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </>
  );
}

// ── Canal sin configurar: checklist de setup ──
function SetupChecklist() {
  return (
    <div className="panel">
      <div className="panel-h"><h2><i className="fa-solid fa-plug" style={{ color: 'var(--yellow)' }}></i> Canal sin configurar — setup pendiente</h2><span className="badge badge-yellow">0 de 3 listo</span></div>
      <p className="text-sm muted mb-12" style={{ lineHeight: 1.5 }}>Hasta completar estos pasos, el bot no puede enviar avisos. La guía completa está en <b>docs/WHATSAPP.md</b> del repo.</p>
      <div className="det-grid">
        <div className="det-row"><i className="fa-regular fa-circle muted"></i><span className="dr-name">Conectar número de WhatsApp Business (Meta Cloud API)</span><span className="badge badge-gray">Falta WHATSAPP_TOKEN / WHATSAPP_PHONE_ID</span></div>
        <div className="det-row"><i className="fa-regular fa-circle muted"></i><span className="dr-name">Verificación del negocio en Meta</span><span className="badge badge-gray">Se hace en el Business Manager</span></div>
        <div className="det-row"><i className="fa-regular fa-circle muted"></i><span className="dr-name">Plantillas enviadas a aprobación</span><span className="badge badge-gray">6 plantillas definidas · sin enviar</span></div>
      </div>
    </div>
  );
}

// ── Tab Guardia y canal ──
function GuardTab({ d, onReload, onEdit, onAdd }) {
  const k = d.kpis;
  async function remind() {
    const r = await waRemindStores();
    if (r?.error) toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' });
    else toast({ title: 'Recordatorio enviado', sub: `Push a ${r.count} comercio${r.count === 1 ? '' : 's'} sin WhatsApp`, icon: 'fa-paper-plane', type: 'green' });
  }
  return (
    <>
      <div className="wa-kpis">
        <div className={`kpi channel ${d.paused ? 'err' : 'ok'}`}>
          <div className="kl">Canal WhatsApp <i className="fa-brands fa-whatsapp" style={{ color: '#25D366' }}></i></div>
          <div className="kv">{d.paused ? <><i className="fa-solid fa-hand"></i> Pausado</> : <><span className="live-dot"></span> API conectada</>}</div>
          <div className="ks">{d.testMode ? 'Modo prueba (sin llamadas a Meta)' : 'Meta Cloud API'}</div>
        </div>
        <div className="kpi">
          <div className="kl">Avisos enviados hoy <i className="fa-solid fa-paper-plane"></i></div>
          <div className="kv">{k.sentToday}</div>
          <div className="ks">sin contar códigos de verificación</div>
        </div>
        <div className={`kpi ${k.failedToday ? 'red' : ''}`}>
          <div className="kl">Fallidos hoy <i className="fa-solid fa-triangle-exclamation"></i></div>
          <div className="kv">{k.failedToday}</div>
          <div className="ks">{k.failTotal} fallidos en total</div>
        </div>
        <div className="kpi">
          <div className="kl">Comercios con WhatsApp <i className="fa-solid fa-store"></i></div>
          <div className="kv split-kv"><span className="text-green">{k.storesWa}</span><span className="sep">/</span><span className="b">{k.storesTotal}</span></div>
          <div className="ks">{k.storesTotal - k.storesWa} sin configurar — <a href="#" className="link-ev" onClick={(e) => { e.preventDefault(); remind(); }}>recordarles</a></div>
        </div>
      </div>

      <div className="wa-grid">
        <div className="panel">
          <div className="panel-h"><h2><i className="fa-solid fa-tower-broadcast" style={{ color: 'var(--wa)' }}></i> Números de guardia <span className="badge badge-gray">{d.guards.length}</span></h2></div>
          <p className="text-sm muted mb-12" style={{ lineHeight: 1.5 }}>Reciben <b>todos</b> los avisos de la plataforma, sin importar el rubro del pedido. Tocá los chips para elegir qué eventos recibe cada número.</p>
          {d.guards.length === 0 ? (
            <div className="empty-state" style={{ padding: 28 }}>
              <div className="empty-icon" style={{ color: 'var(--wa)', background: 'rgba(37,211,102,0.1)' }}><i className="fa-brands fa-whatsapp"></i></div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-1)' }}>Sin números de guardia</div>
              <p className="text-sm" style={{ margin: '8px auto 18px', maxWidth: 300, lineHeight: 1.5 }}>Agregá al menos un número para que alguien del equipo reciba todos los avisos de la plataforma.</p>
              <button className="btn btn-primary" onClick={onAdd}><i className="fa-solid fa-plus"></i> Agregar número</button>
            </div>
          ) : d.guards.map((g) => <GuardRow key={g.id} g={g} onReload={onReload} onEdit={() => onEdit(g)} />)}
        </div>

        <div className="panel">
          <div className="panel-h">
            <h2><i className="fa-solid fa-clock-rotate-left" style={{ color: 'var(--purple-light)' }}></i> Últimos avisos</h2>
            <span className="badge badge-gray">{d.recent.filter((x) => fmtWhen(x.at).startsWith('Hoy')).length} hoy</span>
          </div>
          {d.recent.length === 0
            ? <p className="text-sm muted" style={{ padding: 8 }}>Todavía no se envió ningún aviso.</p>
            : d.recent.map((l) => {
              const ev = EV[l.event] || EV.prueba;
              return (
                <div className="log-row" key={l.id}>
                  <div className={`log-ic ${ev.cls}`}><i className={`fa-solid ${ev.icon}`}></i></div>
                  <div className="log-main">
                    <div className="log-t">{ev.label} → {l.dest}</div>
                    <div className="log-s">{l.body}</div>
                  </div>
                  <div className="log-right">
                    <span className="log-time">{fmtWhen(l.at)}</span>
                    {l.status === 'failed'
                      ? <span className="badge badge-red"><i className="fa-solid fa-circle-xmark"></i> Fallido</span>
                      : <span className="badge badge-green"><i className="fa-solid fa-check-double"></i> {l.status === 'read' ? 'Leído' : l.status === 'delivered' ? 'Entregado' : 'Enviado'}</span>}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}

function GuardRow({ g, onReload, onEdit }) {
  const [code, setCode] = useState('');

  async function toggleEvent(ev) {
    const next = g.events.includes(ev) ? g.events.filter((x) => x !== ev) : [...g.events, ev];
    if (!next.length) { toast({ title: 'Tiene que recibir al menos un evento', icon: 'fa-circle-info', type: 'yellow' }); return; }
    const r = await waSetGuardEvents(g.id, next);
    if (r?.error) toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' });
    onReload();
  }
  async function toggleActive(on) {
    const r = await waToggleGuard(g.id, on);
    if (r?.error) { toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
    toast(on
      ? { title: `${g.name} activado`, sub: 'Vuelve a recibir avisos', icon: 'fa-bell', type: 'green' }
      : { title: `${g.name} desactivado`, sub: 'No recibe avisos hasta reactivarlo', icon: 'fa-bell-slash', type: 'yellow' });
    onReload();
  }
  async function del() {
    if (!window.confirm(`¿Eliminar el número de ${g.name}? Deja de recibir todos los avisos.`)) return;
    await waDeleteGuard(g.id);
    toast({ title: 'Número eliminado', sub: `${g.name} · ${g.phoneFmt}`, icon: 'fa-trash', type: 'red' });
    onReload();
  }
  async function onCode(v) {
    const c = digits(v).slice(0, 6);
    setCode(c);
    if (c.length === 6) {
      const r = await waVerifyGuard(g.id, c);
      if (r?.error) { toast({ title: r.error, icon: 'fa-circle-xmark', type: 'red' }); setCode(''); }
      else { toast({ title: 'Número verificado', sub: `${g.name} ya recibe avisos`, icon: 'fa-circle-check', type: 'green' }); onReload(); }
    }
  }
  async function resend() {
    const r = await waResendGuard(g.id);
    if (r?.error) toast({ title: r.error, icon: 'fa-circle-info', type: 'yellow' });
    else toast({ title: 'Código reenviado', sub: g.phoneFmt, icon: 'fa-rotate-right', type: 'purple' });
  }

  return (
    <div className={`gd-row ${g.active ? '' : 'off'}`}>
      <div className="gd-top">
        <div className="gd-av"><i className="fa-solid fa-user-shield"></i></div>
        <div className="gd-main">
          <div className="gd-name">{g.name} {g.verified
            ? <span className="badge badge-green"><i className="fa-solid fa-circle-check"></i> Verificado</span>
            : <span className="badge badge-yellow"><i className="fa-solid fa-hourglass-half"></i> Pendiente</span>}</div>
          <div className="gd-num">{g.phoneFmt}</div>
        </div>
        {g.last
          ? <div className="gd-last">Último aviso<b>{fmtWhen(g.last.at)} · {(EV[g.last.event] || {}).label || g.last.event}</b></div>
          : <div className="gd-last">Sin avisos<b>todavía</b></div>}
        <div className="gd-actions">
          <label className="switch" title={g.active ? 'Activo' : 'Inactivo'}>
            <input type="checkbox" checked={g.active} disabled={!g.verified} onChange={(e) => toggleActive(e.target.checked)} />
            <span className="track"></span><span className="thumb"></span>
          </label>
          <button className="icon-mini" title="Editar" onClick={onEdit}><i className="fa-solid fa-pen"></i></button>
          <button className="icon-mini danger" title="Eliminar" onClick={del}><i className="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div className="gd-events">
        {EVENTS.map((e) => (
          <span key={e.id} className={`ev-chip ${g.events.includes(e.id) ? 'on' : ''}`} onClick={() => toggleEvent(e.id)}>
            <i className={`fa-solid ${e.icon}`}></i>{e.label}
          </span>
        ))}
      </div>
      {!g.verified && (
        <div className="gd-verify">
          <span className="vt"><i className="fa-solid fa-key"></i> Código enviado a {g.phoneFmt}</span>
          <input type="tel" inputMode="numeric" maxLength={6} placeholder="••••••" value={code} onChange={(e) => onCode(e.target.value)} />
          <button className="link-btn" onClick={resend}><i className="fa-solid fa-rotate-right"></i> Reenviar</button>
        </div>
      )}
    </div>
  );
}

// ── Modal agregar / editar número de guardia ──
function GuardModal({ guard, onClose, onSaved }) {
  const [name, setName] = useState(guard?.name || '');
  const [phone, setPhone] = useState(guard ? fmtPhoneInput(guard.phone) : '');
  const [events, setEvents] = useState(guard?.events || ['solicitud']);
  const [busy, setBusy] = useState(false);

  function toggleEv(id) { setEvents((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id])); }
  async function save() {
    if (!name.trim() || digits(phone).length !== 10) { toast({ title: 'Revisá los datos', sub: 'Nombre y número de 10 dígitos', icon: 'fa-circle-xmark', type: 'red' }); return; }
    if (!events.length) { toast({ title: 'Elegí al menos un evento', icon: 'fa-circle-info', type: 'yellow' }); return; }
    setBusy(true);
    try {
      const r = await waSaveGuard({ id: guard?.id, name, phone: digits(phone), events });
      if (r?.error) { toast({ title: r.error, icon: 'fa-circle-xmark', type: 'red' }); return; }
      if (guard && !r.reverify) toast({ title: 'Cambios guardados', icon: 'fa-circle-check', type: 'green' });
      else toast({ title: 'Código enviado por WhatsApp', sub: 'Ingresá el código para activarlo', icon: 'fa-paper-plane', type: guard ? 'yellow' : 'green' });
      onSaved();
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-handle"></div>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{guard ? 'Editar número' : 'Agregar número de guardia'}</h3>
        <p className="text-sm muted mb-16">{guard ? 'Si cambiás el número, hay que verificarlo de nuevo.' : 'Le mandamos un código de 6 dígitos por WhatsApp para verificarlo.'}</p>
        <div className="field">
          <label>Etiqueta / nombre</label>
          <input className="input" placeholder='Ej: "Jorge", "Guardia finde"' value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Número de WhatsApp</label>
          <div className="phone-wrap">
            <span className="phone-prefix">🇦🇷 +54 9</span>
            <input type="tel" inputMode="numeric" placeholder="294 412 3456" value={phone} onChange={(e) => setPhone(fmtPhoneInput(digits(e.target.value).slice(0, 10)))} />
          </div>
        </div>
        <div className="field">
          <label>Eventos que recibe</label>
          <div className="flex gap-12" style={{ flexWrap: 'wrap', gap: 8 }}>
            {EVENTS.map((e) => (
              <span key={e.id} className={`ev-chip ${events.includes(e.id) ? 'on' : ''}`} onClick={() => toggleEv(e.id)}>
                <i className={`fa-solid ${e.icon}`}></i>{e.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-12 mt-16">
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={save}>{guard ? 'Guardar cambios' : 'Enviar código y agregar'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Tab Mensajes: historial / respuestas / plantillas ──
function MessagesTab({ m, onReload }) {
  const [view, setView] = useState('historial');
  const [f, setF] = useState({ estado: '', dest: '', ev: '', fecha: '' });
  const [open, setOpen] = useState(null); // fila expandida

  if (!m) return <div className="card"><p className="muted text-sm" style={{ padding: 8 }}>Cargando…</p></div>;

  const msgs = m.messages;
  const blocked = [...new Set(msgs.filter((x) => x.status === 'failed' && /bloque/i.test(x.failReason || '')).map((x) => x.dest))];
  const pausedTpls = m.templates.filter((t) => t.status === 'paused');

  let list = msgs.slice();
  if (f.estado === 'failed') list.sort((a, b) => (a.status === 'failed' ? -1 : 0) - (b.status === 'failed' ? -1 : 0));
  else if (f.estado) list = list.filter((x) => x.status === f.estado);
  if (f.dest) list = list.filter((x) => x.dest === f.dest);
  if (f.ev) list = list.filter((x) => x.event === f.ev);
  if (f.fecha) list = list.filter((x) => fmtWhen(x.at).startsWith(f.fecha));
  const hasFilters = f.estado || f.dest || f.ev || f.fecha;
  const dests = [...new Set(msgs.map((x) => x.dest))].sort();

  async function retry(msg) {
    if (/bloque/i.test(msg.failReason || '')) { toast({ title: 'No se puede reintentar', sub: 'El destinatario nos tiene bloqueados', icon: 'fa-user-slash', type: 'red' }); return; }
    const r = await waRetryMessage(msg.id);
    if (r?.error) toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' });
    else { toast({ title: 'Aviso reenviado', sub: msg.dest, icon: 'fa-check-double', type: 'green' }); onReload(); }
  }

  return (
    <>
      <div className="wa-alerts">
        {pausedTpls.length > 0 && (
          <div className="wa-alert warn">
            <div className="al-ic"><i className="fa-solid fa-file-circle-xmark"></i></div>
            <div className="al-main">
              <div className="al-t">Meta pausó la plantilla “{pausedTpls[0].label}”</div>
              <div className="al-s">Ese evento no se está notificando. Afecta la calidad del número — revisala en el Business Manager.</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setView('plantillas')}>Ver plantilla</button>
          </div>
        )}
        {blocked.length > 0 && (
          <div className="wa-alert danger">
            <div className="al-ic"><i className="fa-solid fa-user-slash"></i></div>
            <div className="al-main">
              <div className="al-t">{blocked.join(' y ')} nos bloqueó en WhatsApp</div>
              <div className="al-s">No va a recibir ningún aviso hasta que nos desbloquee. Conviene avisarle por otro canal.</div>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-h" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h2><i className="fa-solid fa-comment-dots" style={{ color: 'var(--wa)' }}></i> Mensajes enviados por el bot</h2>
          <div className="wa-subseg">
            <button className={view === 'historial' ? 'active' : ''} onClick={() => setView('historial')}><i className="fa-solid fa-list"></i> Historial</button>
            <button className={view === 'respuestas' ? 'active' : ''} onClick={() => setView('respuestas')}><i className="fa-solid fa-reply"></i> Respuestas</button>
            <button className={view === 'plantillas' ? 'active' : ''} onClick={() => setView('plantillas')}><i className="fa-solid fa-file-lines"></i> Plantillas</button>
          </div>
        </div>

        {view === 'historial' && (<>
          <div className="wa-filters">
            <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
              <option value="">Estado: todos</option>
              <option value="failed">Fallidos primero</option>
              <option value="read">Leídos</option>
              <option value="delivered">Entregados</option>
              <option value="sent">Enviados</option>
            </select>
            <select value={f.dest} onChange={(e) => setF({ ...f, dest: e.target.value })}>
              <option value="">Destinatario: todos</option>
              {dests.map((x) => <option key={x}>{x}</option>)}
            </select>
            <select value={f.ev} onChange={(e) => setF({ ...f, ev: e.target.value })}>
              <option value="">Evento: todos</option>
              {Object.entries(EV).map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}
            </select>
            <select value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })}>
              <option value="">Fecha: todas</option>
              <option value="Hoy">Hoy</option>
              <option value="Ayer">Ayer</option>
            </select>
            {hasFilters && <button className="btn btn-ghost btn-sm f-clear" onClick={() => setF({ estado: '', dest: '', ev: '', fecha: '' })}><i className="fa-solid fa-xmark"></i> Limpiar filtros</button>}
          </div>
          {list.length === 0 ? (
            <div className="empty-state" style={{ padding: 28 }}>
              <div className="empty-icon"><i className="fa-solid fa-filter"></i></div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-1)' }}>{hasFilters ? 'Nada con esos filtros' : 'Todavía no hay mensajes'}</div>
              <p className="text-sm" style={{ marginTop: 6 }}>{hasFilters ? 'Probá con otro estado, destinatario o fecha.' : 'Cuando el bot envíe avisos, van a aparecer acá.'}</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="msg-table">
                <thead><tr><th>Fecha / hora</th><th>Destinatario</th><th>Evento</th><th>Mensaje</th><th>Estado</th></tr></thead>
                <tbody>
                  {list.map((msg) => {
                    const ev = EV[msg.event] || EV.prueba;
                    const siblings = msgs.filter((x) => x.groupId && x.groupId === msg.groupId && x.id !== msg.id);
                    const isOpen = open === msg.id;
                    return (
                      <FragmentRow key={msg.id} msg={msg} ev={ev} siblings={siblings} isOpen={isOpen}
                        onToggle={() => setOpen(isOpen ? null : msg.id)} onRetry={() => retry(msg)} />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>)}

        {view === 'respuestas' && (<>
          <p className="text-sm muted mb-12" style={{ marginTop: 10, lineHeight: 1.5 }}>Lo que la gente le contesta al bot y qué hizo el sistema con cada respuesta.</p>
          {m.replies.length === 0 ? (
            <p className="text-sm muted" style={{ padding: 8 }}>Todavía no hay respuestas.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="msg-table">
                <thead><tr><th>Fecha / hora</th><th>Remitente</th><th>Respuesta</th><th>Acción del sistema</th></tr></thead>
                <tbody>
                  {m.replies.map((r) => (
                    <tr key={r.id}>
                      <td className="m-when">{fmtWhen(r.at)}</td>
                      <td className="m-dest"><div className="dn" style={{ fontSize: 12.5 }}>{r.from}</div><div className="dnum">{r.phoneFmt}</div></td>
                      <td className="m-txt" style={{ color: 'var(--text-1)' }}>“{r.body}”</td>
                      <td>{r.action === 'baja'
                        ? <span className="badge badge-yellow"><i className="fa-solid fa-bell-slash"></i> BAJA procesada — no recibe más avisos</span>
                        : <span className="badge badge-gray"><i className="fa-solid fa-robot"></i> Auto-respuesta enviada</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>)}

        {view === 'plantillas' && (<>
          <p className="text-sm muted mb-12" style={{ marginTop: 10, lineHeight: 1.5 }}>Plantillas aprobadas por Meta que usa el bot. Si Meta pausa una plantilla, ese evento deja de notificarse hasta reactivarla.</p>
          <div className="tpl-grid">
            {m.templates.map((t) => (
              <div key={t.name} className={`tpl ${t.status === 'paused' ? 'paused' : ''}`}>
                <div className="tpl-h">
                  <span className="tn">{t.label}</span>
                  {t.status === 'approved' && <span className="badge badge-green"><i className="fa-solid fa-circle-check"></i> Aprobada</span>}
                  {t.status === 'pending' && <span className="badge badge-yellow"><i className="fa-solid fa-hourglass-half"></i> Pendiente en Meta</span>}
                  {t.status === 'paused' && <span className="badge badge-red"><i className="fa-solid fa-pause"></i> Pausada por Meta</span>}
                  {t.status === 'rejected' && <span className="badge badge-red"><i className="fa-solid fa-circle-xmark"></i> Rechazada</span>}
                </div>
                <div className="tpl-body">{t.body}</div>
                <div className="tpl-foot">
                  <span><i className="fa-solid fa-paper-plane"></i> {t.uses.toLocaleString('es-AR')} envíos</span>
                  {t.status === 'paused' && <a className="link-ev" href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noreferrer">Revisar en Business Manager →</a>}
                </div>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </>
  );
}

// Fila del historial + detalle expandible ("el mismo aviso también se envió a…").
function FragmentRow({ msg, ev, siblings, isOpen, onToggle, onRetry }) {
  const stBadge = (s, reason) => s === 'failed'
    ? <span className="badge badge-red">Fallido{reason ? ` · ${reason}` : ''}</span>
    : s === 'read'
      ? <span className="badge badge-blue"><i className="fa-solid fa-check-double"></i> Leído</span>
      : s === 'delivered'
        ? <span className="badge badge-green"><i className="fa-solid fa-check-double"></i> Entregado</span>
        : <span className="badge badge-gray"><i className="fa-solid fa-check"></i> Enviado</span>;
  return (
    <>
      <tr className={`m-row ${isOpen ? 'expanded' : ''}`} onClick={onToggle}>
        <td className="m-when">{fmtWhen(msg.at)}</td>
        <td className="m-dest">
          <div className="dn">{msg.dest}</div>
          <div className="dnum">{msg.phoneFmt}</div>
          <div style={{ marginTop: 4 }}>{roleChip(msg.role)}</div>
        </td>
        <td>
          <span className="ev-chip on" style={{ cursor: 'default' }}><i className={`fa-solid ${ev.icon}`}></i>{ev.label}</span>
          {msg.refCode && <> <span className="link-ev">{msg.refCode}</span></>}
        </td>
        <td className="m-txt">{msg.body}</td>
        <td>
          {msg.status === 'failed' ? (
            <div className="tl-fail">
              <span className="badge badge-red"><i className="fa-solid fa-circle-xmark"></i> Fallido</span>
              <span className="fail-reason">{msg.failReason || 'Error de entrega'}</span>
              <button className="btn-retry" onClick={(e) => { e.stopPropagation(); onRetry(); }}><i className="fa-solid fa-rotate-right"></i> Reintentar</button>
            </div>
          ) : (
            <Timeline status={msg.status} />
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="m-detail">
          <td colSpan={5}>
            {siblings.length ? (<>
              <div className="det-label"><i className="fa-solid fa-share-nodes"></i> El mismo aviso también se envió a</div>
              <div className="det-grid">
                {siblings.map((s) => (
                  <div className="det-row" key={s.id}>
                    <span style={{ flexShrink: 0 }}>{roleChip(s.role)}</span>
                    <span className="dr-name">{s.dest}</span>
                    <span className="dr-num">{s.phoneFmt}</span>
                    {stBadge(s.status, s.failReason)}
                  </div>
                ))}
              </div>
            </>) : (
              <div className="det-label"><i className="fa-solid fa-share-nodes"></i> Este aviso se envió solo a {msg.dest}</div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Timeline({ status }) {
  const steps = [
    { k: 'sent', l: 'Enviado', i: 'fa-check' },
    { k: 'delivered', l: 'Entregado', i: 'fa-check-double' },
    { k: 'read', l: 'Leído', i: 'fa-check-double' },
  ];
  const lvl = { sent: 0, delivered: 1, read: 2 }[status] ?? 0;
  return (
    <div className="tl">
      {steps.map((s, i) => {
        const done = i <= lvl;
        const cls = s.k === 'read' && done ? 'read' : done ? 'done' : '';
        return (
          <span key={s.k} style={{ display: 'contents' }}>
            {i > 0 && <span className={`tl-bar ${i <= lvl ? 'done' : ''}`}></span>}
            <span className={`tl-step ${cls}`}><i className={`fa-solid ${s.i}`}></i>{s.l}</span>
          </span>
        );
      })}
    </div>
  );
}
