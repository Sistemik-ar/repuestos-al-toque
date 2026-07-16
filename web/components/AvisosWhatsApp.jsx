'use client';
// Sección "Avisos por WhatsApp" del perfil — reutilizable: comercio y mecánico.
// 4 estados (los decide el backend): setup | verify | active | baja.
import { useEffect, useRef, useState } from 'react';
import { toast, fmtDateTime } from '@/lib/ui';
import { getWaConfig, waStartVerify, waResendCode, waConfirmCode, waSetEnabled, waReactivate, waRemoveContact, waSendTest } from '@/app/actions/whatsapp';

const digits = (v) => String(v || '').replace(/\D/g, '');
const fmtPhone = (d) => (d.length <= 3 ? d : d.length <= 6 ? `${d.slice(0, 3)} ${d.slice(3)}` : `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 10)}`);

// Copy por rol: qué avisos recibe cada uno y cómo se ve el mensaje de ejemplo.
const COPY = {
  STORE: {
    heroT: 'Enterate al instante cuando un mecánico pide un repuesto de tu rubro',
    heroS: 'Te mandamos un WhatsApp con el detalle del pedido y el link directo para cotizar. Los primeros en cotizar venden más.',
    benefits: [['fa-bolt', 'Aviso al segundo de publicada la solicitud'], ['fa-filter', 'Solo de tus rubros'], ['fa-hand', 'Lo desactivás cuando quieras, sin vueltas']],
    toggleSub: (rubros) => (rubros?.length ? `Nuevas solicitudes de ${rubros.slice(0, 3).join(', ')}${rubros.length > 3 ? '…' : ''}` : 'Nuevas solicitudes de todos los rubros'),
    preview: (<><i className="fa-solid fa-wrench" style={{ marginRight: 4 }}></i> <b>Nueva solicitud:</b> Amortiguadores · Ford Fiesta 2017 · Bariloche.<br />Entrá a cotizar → <a onClick={(e) => e.preventDefault()} href="#">rat.ar/comercio</a><br /><span style={{ color: '#8696A0' }}>Respondé BAJA para dejar de recibir avisos.</span></>),
  },
  MECHANIC: {
    heroT: 'Enterate al instante cuando te cotizan un repuesto',
    heroS: 'Te mandamos un WhatsApp cuando llega una cotización a tu pedido y cuando se acredita un pago. Sin estar pendiente de la app.',
    benefits: [['fa-bolt', 'Aviso al segundo de cada cotización'], ['fa-circle-dollar-to-slot', 'Confirmación cuando se acredita el pago'], ['fa-hand', 'Lo desactivás cuando quieras, sin vueltas']],
    toggleSub: () => 'Cotizaciones nuevas y pagos acreditados',
    preview: (<><i className="fa-solid fa-comment-dollar" style={{ marginRight: 4 }}></i> <b>Nueva cotización:</b> Comercio A cotizó $48.500 tu pedido de pastillas.<br />Miralo → <a onClick={(e) => e.preventDefault()} href="#">rat.ar/mecanico</a><br /><span style={{ color: '#8696A0' }}>Respondé BAJA para dejar de recibir avisos.</span></>),
  },
};

export default function AvisosWhatsApp({ role }) {
  const C = COPY[role] || COPY.STORE;
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => getWaConfig().then(setCfg).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!cfg || (!cfg.configured && cfg.state === 'setup')) return null; // canal sin configurar y sin número previo: no mostrar

  return (
    <>
      <div className="section-title"><h2>Avisos por WhatsApp</h2>{cfg.state === 'active' && <span className="badge badge-green"><i className="fa-brands fa-whatsapp"></i> Activo</span>}</div>
      <div className="wa-state" key={cfg.state}>
        {cfg.state === 'setup' && <Setup C={C} busy={busy} setBusy={setBusy} onSent={load} />}
        {cfg.state === 'verify' && <Verify cfg={cfg} busy={busy} setBusy={setBusy} onDone={load} />}
        {cfg.state === 'active' && <Active cfg={cfg} C={C} busy={busy} setBusy={setBusy} onChanged={load} />}
        {cfg.state === 'baja' && <Baja cfg={cfg} busy={busy} setBusy={setBusy} onDone={load} />}
      </div>
    </>
  );
}

// ── Estado 1: sin configurar ──
function Setup({ C, busy, setBusy, onSent }) {
  const [phone, setPhone] = useState('');
  const d = digits(phone);
  const valid = d.length === 10 && !d.startsWith('0') && !d.startsWith('15');
  const hint = !phone
    ? { cls: '', icon: 'fa-circle-info', txt: 'Código de área sin 0 y número sin 15. Ej: 294 412 3456' }
    : valid
      ? { cls: 'ok', icon: 'fa-circle-check', txt: 'Formato correcto' }
      : d.startsWith('0') || d.startsWith('15')
        ? { cls: 'err', icon: 'fa-circle-xmark', txt: 'Sin el 0 del área ni el 15. Ej: 294 412 3456' }
        : d.length > 10
          ? { cls: 'err', icon: 'fa-circle-xmark', txt: 'Son 10 dígitos en total (área + número)' }
          : { cls: '', icon: 'fa-circle-info', txt: `Te faltan ${10 - d.length} dígitos` };

  async function verificar() {
    setBusy(true);
    try {
      const r = await waStartVerify(d);
      if (r?.error) toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' });
      else { toast({ title: 'Código enviado', sub: `Mirá tu WhatsApp: ${r.sentTo}`, icon: 'fa-paper-plane', type: 'green' }); onSent(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="card mb-16">
      <div className="wa-hero">
        <div className="wa-ic"><i className="fa-brands fa-whatsapp"></i></div>
        <div>
          <div className="ht">{C.heroT}</div>
          <div className="hs">{C.heroS}</div>
        </div>
      </div>
      <div className="wa-benefits">
        {C.benefits.map(([ic, txt]) => <div className="wa-benefit" key={ic}><i className={`fa-solid ${ic}`}></i>{txt}</div>)}
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label htmlFor="waPhone">Tu número de WhatsApp</label>
        <div className={`phone-wrap ${hint.cls === 'err' ? 'invalid' : ''}`}>
          <span className="phone-prefix"><span>🇦🇷</span>+54 9</span>
          <input id="waPhone" type="tel" inputMode="numeric" placeholder="294 412 3456" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(fmtPhone(digits(e.target.value).slice(0, 11)))} />
        </div>
        <div className={`field-hint ${hint.cls}`}><i className={`fa-solid ${hint.icon}`}></i>{hint.txt}</div>
      </div>
      <button className="btn btn-wa btn-block mt-8" disabled={!valid || busy} onClick={verificar}>
        {busy ? <span className="spinner" style={{ width: 16, height: 16 }}></span> : <><i className="fa-brands fa-whatsapp"></i> Verificar mi número</>}
      </button>
    </div>
  );
}

// ── Estado 2: pendiente de verificación ──
function Verify({ cfg, busy, setBusy, onDone }) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [err, setErr] = useState('');
  const [cd, setCd] = useState(0); // countdown del reenvío
  const refs = useRef([]);
  useEffect(() => { refs.current[0]?.focus(); }, []);
  useEffect(() => {
    if (!cd) return;
    const t = setInterval(() => setCd((x) => x - 1), 1000);
    return () => clearInterval(t);
  }, [cd]);

  async function submit(full) {
    setBusy(true);
    try {
      const r = await waConfirmCode(full);
      if (r?.error) { setErr(r.error); setCode(['', '', '', '', '', '']); refs.current[0]?.focus(); }
      else { toast({ title: 'Número verificado', sub: 'Ya estás recibiendo avisos', icon: 'fa-circle-check', type: 'green' }); onDone(); }
    } finally { setBusy(false); }
  }
  function setAt(i, v) {
    const next = [...code];
    next[i] = v;
    setCode(next);
    setErr('');
    if (v && i < 5) refs.current[i + 1]?.focus();
    const full = next.join('');
    if (full.length === 6) submit(full);
  }
  function onPaste(e) {
    const txt = digits(e.clipboardData.getData('text')).slice(0, 6);
    if (txt.length > 1) {
      e.preventDefault();
      const next = txt.split('').concat(Array(6).fill('')).slice(0, 6);
      setCode(next);
      refs.current[Math.min(txt.length, 5)]?.focus();
      if (txt.length === 6) submit(txt);
    }
  }
  async function resend() {
    const r = await waResendCode();
    if (r?.error) toast({ title: r.error, icon: 'fa-circle-info', type: 'yellow' });
    else { toast({ title: 'Código reenviado', sub: 'Puede tardar unos segundos', icon: 'fa-rotate-right', type: 'purple' }); setCd(30); }
  }
  async function changeNum() { await waRemoveContact(); onDone(); }

  return (
    <div className="card mb-16">
      <div className="text-center" style={{ paddingTop: 6 }}>
        <div className="wa-ic" style={{ margin: '0 auto 12px', width: 54, height: 54, fontSize: 26 }}><i className="fa-solid fa-shield-halved"></i></div>
        <div style={{ fontWeight: 800, fontSize: 17 }}>Revisá tu WhatsApp</div>
        <p className="text-sm muted mt-8" style={{ lineHeight: 1.5 }}>Te mandamos un código de 6 dígitos para confirmar que el número es tuyo.</p>
      </div>
      <div className="sent-to mt-16"><i className="fa-brands fa-whatsapp"></i>Enviado a <b>{cfg.phoneFmt}</b></div>
      <div className="code-row">
        {code.map((v, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el; }} className={`code-box ${v ? 'filled' : ''}`} type="tel" inputMode="numeric" maxLength={1}
            aria-label={`Dígito ${i + 1}`} value={v} disabled={busy}
            onChange={(e) => setAt(i, digits(e.target.value).slice(0, 1))}
            onKeyDown={(e) => { if (e.key === 'Backspace' && !v && i > 0) refs.current[i - 1]?.focus(); }}
            onPaste={onPaste} />
        ))}
      </div>
      {err && <div className="field-hint err text-center" style={{ justifyContent: 'center' }}><i className="fa-solid fa-circle-xmark"></i>{err}</div>}
      <div className="code-actions">
        <button className="link-btn" disabled={cd > 0} onClick={resend}><i className="fa-solid fa-rotate-right"></i> Reenviar código{cd > 0 ? ` (${cd}s)` : ''}</button>
        <button className="link-btn" style={{ color: 'var(--text-1)' }} onClick={changeNum}><i className="fa-solid fa-pen"></i> Cambiar número</button>
      </div>
    </div>
  );
}

// ── Estado 3: verificado y activo ──
function Active({ cfg, C, busy, setBusy, onChanged }) {
  const [on, setOn] = useState(cfg.enabled);
  const [testing, setTesting] = useState(false);

  async function toggle(v) {
    setOn(v);
    await waSetEnabled(v).catch(() => {});
    toast(v
      ? { title: 'Avisos activados', icon: 'fa-bell', type: 'green' }
      : { title: 'Avisos pausados', sub: 'Los reactivás cuando quieras', icon: 'fa-bell-slash', type: 'yellow' });
  }
  async function test() {
    setTesting(true);
    try {
      const r = await waSendTest();
      if (r?.error) toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' });
      else toast({ title: 'Aviso de prueba enviado', sub: 'Revisá tu WhatsApp', icon: 'fa-brands fa-whatsapp', type: 'green' });
    } finally { setTesting(false); }
  }
  async function changeNum() {
    setBusy(true);
    try { await waRemoveContact(); onChanged(); toast({ title: 'Ingresá el número nuevo', sub: 'Vas a tener que verificarlo de nuevo', icon: 'fa-pen', type: 'purple' }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="card mb-12">
        <div className="num-card">
          <div className="wa-ic"><i className="fa-brands fa-whatsapp"></i></div>
          <div className="nm">
            <div className="nv">{cfg.phoneMasked}</div>
            <div className="nl">Verificado el {fmtDateTime(cfg.verifiedAt)}</div>
          </div>
          <span className="badge badge-green"><i className="fa-solid fa-circle-check"></i> Verificado</span>
        </div>
        <div style={{ paddingTop: 6 }}>
          <div className="setting-row">
            <div className="setting-ic" style={{ background: 'rgba(37,211,102,0.12)', color: 'var(--wa)' }}><i className="fa-solid fa-bell"></i></div>
            <div className="sm">
              <div className="st">Recibir avisos</div>
              <div className="ss">{C.toggleSub(cfg.rubros)}</div>
            </div>
            <label className="switch"><input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} /><span className="track"></span><span className="thumb"></span></label>
          </div>
          {!on && <div className="paused-note"><i className="fa-solid fa-bell-slash"></i>Avisos pausados. No vas a recibir mensajes hasta que lo actives de nuevo.</div>}
        </div>
      </div>

      <div className="card mb-12" style={{ opacity: on ? 1 : 0.55 }}>
        <div className="wa-preview">
          <div className="pv-label"><i className="fa-solid fa-eye"></i>Así se ve el aviso que te llega</div>
          <div className="wa-bubble">
            <div className="from">RepuestosAlToque</div>
            <div className="msg">{C.preview}</div>
            <div className="meta">10:42 <i className="fa-solid fa-check-double" style={{ color: '#53BDEB' }}></i></div>
          </div>
        </div>
        <button className="btn btn-ghost btn-block btn-sm mt-12" disabled={testing} onClick={test}>
          {testing ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Enviando…</> : <><i className="fa-solid fa-paper-plane"></i> Enviarme un aviso de prueba</>}
        </button>
      </div>

      <div className="card mb-12">
        <div className="setting-row" style={{ paddingTop: 0 }}>
          <div className="setting-ic"><i className="fa-solid fa-pen"></i></div>
          <div className="sm">
            <div className="st">Cambiar número</div>
            <div className="ss">Vas a tener que verificar el número nuevo</div>
          </div>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={changeNum}>Cambiar</button>
        </div>
      </div>

      <div className="consent-note mb-16"><i className="fa-solid fa-lock"></i><span>Solo usamos tu número para avisos de la plataforma. Podés desactivarlos cuando quieras desde acá o respondiendo <b>BAJA</b> al mensaje.</span></div>
    </>
  );
}

// ── Estado 4: dado de baja (respondió BAJA) ──
function Baja({ cfg, busy, setBusy, onDone }) {
  async function reactivar() {
    setBusy(true);
    try {
      const r = await waReactivate();
      if (r?.error) toast({ title: r.error, icon: 'fa-triangle-exclamation', type: 'yellow' });
      else { toast({ title: 'Avisos reactivados', sub: 'Volvés a recibir avisos al instante', icon: 'fa-bell', type: 'green' }); onDone(); }
    } finally { setBusy(false); }
  }
  return (
    <div className="card mb-16">
      <div className="text-center" style={{ paddingTop: 6 }}>
        <div className="wa-ic" style={{ margin: '0 auto 12px', width: 54, height: 54, fontSize: 24, background: 'rgba(250,204,21,0.12)', color: 'var(--yellow)' }}><i className="fa-solid fa-bell-slash"></i></div>
        <div style={{ fontWeight: 800, fontSize: 17 }}>Desactivaste los avisos respondiendo BAJA</div>
        <p className="text-sm muted mt-8" style={{ lineHeight: 1.5 }}>El {fmtDateTime(cfg.optedOutAt)} respondiste <b>BAJA</b> al bot desde el <span style={{ fontVariantNumeric: 'tabular-nums' }}>{cfg.phoneMasked}</span>. No te mandamos más mensajes desde entonces.</p>
      </div>
      <div className="paused-note" style={{ marginTop: 16 }}><i className="fa-solid fa-circle-info"></i>Tu número sigue verificado. Si reactivás, volvés a recibir avisos al instante.</div>
      <button className="btn btn-wa btn-block mt-16" disabled={busy} onClick={reactivar}><i className="fa-solid fa-bell"></i> Reactivar avisos</button>
      <div className="consent-note"><i className="fa-solid fa-lock"></i><span>Podés volver a darte de baja cuando quieras, desde acá o respondiendo <b>BAJA</b> al mensaje.</span></div>
    </div>
  );
}
