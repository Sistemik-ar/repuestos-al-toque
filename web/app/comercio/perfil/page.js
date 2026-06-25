'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getMyStoreProfile, getMpLinkStatus, getMpLinkUrl, unlinkMp, getStoreSales } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';
import { toast, money, fmtDateTime } from '@/lib/ui';
import Loading from '@/components/Loading';

const IVA = { RESPONSABLE_INSCRIPTO: 'Responsable Inscripto', MONOTRIBUTO: 'Monotributo', EXENTO: 'Exento', CONSUMIDOR_FINAL: 'Consumidor Final' };
const COND = { NUEVO: 'Nuevo', USADO: 'Usado', REACONDICIONADO: 'Reacondicionado' };

export default function ComercioPerfil() {
  const router = useRouter();
  const [p, setP] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [mp, setMp] = useState(null); // { configured, linked }
  const [mpBusy, setMpBusy] = useState(false);
  const [sales, setSales] = useState([]); // para "Tu dinero" cuando está vinculado

  const loadMp = () => getMpLinkStatus().then((s) => setMp(s)).catch(() => {});
  useEffect(() => {
    getMyStoreProfile().then((d) => { setP(d); setLoaded(true); }).catch(() => setLoaded(true));
    getStoreSales().then((r) => setSales(r || [])).catch(() => {});
    loadMp();
    try {
      const q = new URLSearchParams(window.location.search).get('mp');
      if (q === 'ok') toast({ title: 'Mercado Pago vinculado', sub: 'Ya vas a cobrar directo en tu cuenta', icon: 'fa-circle-check', type: 'green' });
      else if (q === 'error') toast({ title: 'No se pudo vincular', sub: 'Probá de nuevo en un momento', icon: 'fa-triangle-exclamation', type: 'yellow' });
      if (q) window.history.replaceState(null, '', '/comercio/perfil');
    } catch {}
  }, []);

  async function vincularMp() {
    setMpBusy(true);
    try { const r = await getMpLinkUrl(); if (r?.url) window.location.href = r.url; else toast({ title: r?.error || 'No disponible', icon: 'fa-triangle-exclamation', type: 'yellow' }); }
    finally { setMpBusy(false); }
  }
  async function desvincularMp() {
    if (!window.confirm('¿Desvincular tu Mercado Pago? Los cobros volverán a procesarse de forma centralizada.')) return;
    setMpBusy(true);
    try { await unlinkMp(); await loadMp(); toast({ title: 'Mercado Pago desvinculado', icon: 'fa-link-slash', type: 'purple' }); }
    finally { setMpBusy(false); }
  }
  async function logout() { await logoutAction(); router.push('/login'); }

  const initials = (p?.tradeName || p?.name || 'C').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const now = Date.now();
  const last7 = sales.filter((s) => now - (s.soldAt || 0) <= 7 * 86400000);
  const acred7 = last7.reduce((a, s) => a + (s.part || 0), 0);
  const com7 = last7.reduce((a, s) => a + (s.commission || 0), 0);

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="flex-center"><Link href="/comercio" className="icon-btn"><i className="fa-solid fa-arrow-left"></i></Link><div style={{ fontWeight: 800 }}>Mi perfil</div></div>
        <button className="icon-btn" onClick={logout} title="Cerrar sesión"><i className="fa-solid fa-right-from-bracket"></i></button>
      </div>

      <div className="container">
        {!loaded ? (
          <Loading label="Cargando tu perfil…" />
        ) : !p ? (
          <div className="empty-state"><div className="text-sm">No se pudo cargar el perfil</div></div>
        ) : (
          <>
            <div className="float-notif mb-16"><i className="fa-solid fa-circle-info text-purple"></i><div className="text-xs subtle">Estos son tus datos cargados. Son <b>solo de consulta</b>: si algo está mal, escribinos para corregirlo.</div></div>

            <div className="card glow mb-16" style={{ background: 'linear-gradient(135deg,rgba(250,204,21,0.16),rgba(31,41,55,0.6))' }}>
              <div className="flex-center gap-12">
                <div className="avatar" style={{ width: 46, height: 46, fontSize: 16, background: 'linear-gradient(135deg,var(--yellow),var(--purple))' }}>{initials}</div>
                <div>
                  <div style={{ fontWeight: 800 }}>{p.tradeName || p.name || 'Comercio'}</div>
                  <div className="text-xs muted mt-4">{p.rating != null ? <><i className="fa-solid fa-star text-yellow"></i> {p.rating} ({p.ratingsCount}) · </> : ''}{p.points.toLocaleString('es-AR')} puntos de reputación</div>
                </div>
              </div>
            </div>

            <div className="section-title"><h2>Mis datos</h2></div>
            <div className="card mb-16" style={{ paddingTop: 0 }}>
              <Row k="Nombre del comercio" v={p.tradeName || '—'} />
              <Row k="Razón social" v={p.legalName || '—'} />
              <Row k="CUIT" v={p.cuit || '—'} />
              <Row k="Condición IVA" v={IVA[p.ivaCondition] || p.ivaCondition || '—'} />
              <Row k="Email" v={p.email || '—'} />
              <Row k="WhatsApp" v={p.whatsapp || '—'} />
              <Row k="Teléfono" v={p.phone || '—'} />
              <Row k="Dirección" v={p.address ? `${p.address}${p.barrio ? ' · ' + p.barrio : ''}` : '—'} />
              <Row k="Condición de las piezas" v={COND[p.partCondition] || p.partCondition || '—'} />
            </div>

            {mp?.configured && (<>
              <div className="section-title"><h2>Cobros</h2>{mp.linked ? <span className="mp-chip"><span className="dot"></span> MP conectado</span> : <span className="text-xs muted">Mercado Pago</span>}</div>
              {mp.linked ? (<>
                <div className="card mb-12" style={{ borderColor: 'rgba(34,197,94,0.25)', background: 'linear-gradient(180deg,rgba(34,197,94,0.08),rgba(17,24,39,0.6))' }}>
                  <div className="text-xs muted" style={{ fontWeight: 700 }}>Acreditado en tu Mercado Pago · últimos 7 días</div>
                  <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6, letterSpacing: '-0.02em' }}>{money(acred7)}</div>
                  <div className="text-xs" style={{ color: '#4ADE80', fontWeight: 700, marginTop: 6 }}><i className="fa-solid fa-bolt"></i> Directo a tu cuenta · sin esperar liquidación</div>
                </div>
                <div className="grid-2 mb-12">
                  <div className="card" style={{ padding: '13px 15px' }}><div className="text-xs muted" style={{ fontWeight: 700 }}>Ventas (7d)</div><div style={{ fontSize: 21, fontWeight: 800, marginTop: 5 }}>{last7.length}</div></div>
                  <div className="card" style={{ padding: '13px 15px' }}><div className="text-xs muted" style={{ fontWeight: 700 }}>Comisión retenida</div><div style={{ fontSize: 21, fontWeight: 800, marginTop: 5 }}>{money(com7)}</div></div>
                </div>
                {last7.length > 0 && (
                  <div className="card mb-12" style={{ paddingTop: 4 }}>
                    <div className="text-xs muted mt-8 mb-4" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Detalle por venta</div>
                    {last7.slice(0, 8).map((s) => (
                      <div key={s.orderId} className="flex-between" style={{ padding: '9px 0', borderTop: '1px solid var(--border)', gap: 12 }}>
                        <div style={{ minWidth: 0 }}><div className="text-sm" style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.desc || s.catLabel || 'Repuesto'}</div><div className="text-xs muted">{`${s.brand || ''} ${s.model || ''}`.trim()} · {fmtDateTime(s.soldAt)}</div></div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}><div className="text-sm" style={{ fontWeight: 800, color: '#4ADE80' }}>+{money(s.part)}</div><div className="text-xs muted">−{money(s.commission)} comisión</div></div>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn btn-ghost btn-sm mb-16" disabled={mpBusy} onClick={desvincularMp}><i className="fa-solid fa-link-slash"></i> Desvincular Mercado Pago</button>
              </>) : (<>
                <div className="card mb-16">
                  <p className="text-sm muted mb-12">Conectá tu cuenta de Mercado Pago para <b>cobrar directo</b> en tu cuenta cada venta — sin esperar la liquidación. La plataforma retiene su comisión automáticamente.</p>
                  <div className="mb-12" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="flex gap-12" style={{ alignItems: 'flex-start' }}><span className="badge badge-purple" style={{ flexShrink: 0 }}>1</span><span className="text-sm">Conectás tu cuenta (la misma que ya usás). Te lleva a Mercado Pago, autorizás y volvés.</span></div>
                    <div className="flex gap-12" style={{ alignItems: 'flex-start' }}><span className="badge badge-purple" style={{ flexShrink: 0 }}>2</span><span className="text-sm">Cuando un mecánico paga, MP divide el cobro solo: vos cobrás el repuesto, la plataforma su comisión.</span></div>
                    <div className="flex gap-12" style={{ alignItems: 'flex-start' }}><span className="badge badge-purple" style={{ flexShrink: 0 }}>3</span><span className="text-sm">La plata queda en <b>tu</b> cuenta de MP; la retirás según tus plazos.</span></div>
                  </div>
                  <div className="float-notif mb-12" style={{ padding: '10px 12px' }}><i className="fa-solid fa-shield-halved text-purple"></i><div className="text-xs subtle">Nunca vemos tu plata ni tu clave. Solo recibimos permiso para cobrar la comisión de cada venta. Podés desconectar cuando quieras.</div></div>
                  <button className="btn btn-mp btn-block" disabled={mpBusy} onClick={vincularMp}>{mpBusy ? <span className="spinner" style={{ width: 16, height: 16 }}></span> : <><i className="fa-solid fa-handshake"></i> Conectar con Mercado Pago</>}</button>
                </div>
              </>)}
            </>)}

            <div className="section-title"><h2>Lo que vendo</h2><span className="text-xs muted">{p.categories.length} rubro{p.categories.length === 1 ? '' : 's'}</span></div>
            <div className="card">
              {p.categories.length === 0 ? (
                <div className="text-sm muted">Recibís pedidos de <b>todos los rubros</b> (no tenés rubros específicos asignados).</div>
              ) : (
                <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>{p.categories.map((c) => <span key={c} className="chip" style={{ background: 'var(--purple)', color: '#fff', borderColor: 'var(--purple)' }}>{c}</span>)}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex-between" style={{ padding: '8px 0', borderTop: '1px solid var(--border)', gap: 12 }}>
      <span className="text-xs muted" style={{ flexShrink: 0 }}>{k}</span>
      <span className="text-sm" style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
    </div>
  );
}
