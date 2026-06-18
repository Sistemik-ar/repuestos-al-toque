'use client';
import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast, ping, fmtDateTime } from '@/lib/ui';
import { usePoll, keep } from '@/lib/usePoll';
import { useTitleBell } from '@/lib/useTitleBell';
import { getMe, getOpenRequestsForStore, getStoreSales, createQuote, getStoreCreditRequests, storeActOnCredit, storeConfirmPickup, getStoreCreditAccounts, registerCreditPayment } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';
import { uploadPhoto } from '@/lib/upload';
import Loading from '@/components/Loading';
import PushButton from '@/components/PushButton';
import FontScale from '@/components/FontScale';

const money = (n) => '$' + Math.round(n || 0).toLocaleString('es-AR');
const PER = 5;

function pageButtons(page, pages) {
  if (pages <= 1) return [];
  const out = []; const want = new Set([1, pages, page, page - 1, page + 1].filter((x) => x >= 1 && x <= pages)); let prev = 0;
  for (let i = 1; i <= pages; i++) if (want.has(i)) { if (i - prev > 1) out.push({ ell: true }); out.push({ n: i }); prev = i; }
  return out;
}
function Pager({ total, page, setPage }) {
  const pages = Math.max(1, Math.ceil(total / PER));
  if (pages <= 1) return null;
  const cur = Math.min(page, pages), from = (cur - 1) * PER + 1, to = Math.min(cur * PER, total);
  return (
    <div className="cmz-pager">
      <span className="text-xs muted">{from}–{to} de {total}</span>
      <div className="flex gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm cmz-pgbtn" onClick={() => setPage(Math.max(1, cur - 1))} disabled={cur <= 1}><i className="fa-solid fa-chevron-left"></i></button>
        {pageButtons(cur, pages).map((p, i) => p.ell ? <span key={i} className="muted" style={{ padding: '0 4px' }}>…</span> : <button key={i} className={`btn btn-sm cmz-pgbtn ${p.n === cur ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPage(p.n)}>{p.n}</button>)}
        <button className="btn btn-ghost btn-sm cmz-pgbtn" onClick={() => setPage(Math.min(pages, cur + 1))} disabled={cur >= pages}><i className="fa-solid fa-chevron-right"></i></button>
      </div>
    </div>
  );
}

const timeAgo = (ts) => {
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400); return `hace ${d} día${d === 1 ? '' : 's'}`;
};
const label = (r) => r.desc || r.catLabel || 'Repuesto';
const veh = (r) => `${r.brand || ''} ${r.model || ''} ${r.year || ''}`.trim() + (r.engine ? ` · ${r.engine}` : '');
const windowOpen = (r) => ['OPEN', 'QUOTED'].includes(r.status) && (!r.windowEndsAt || r.windowEndsAt > Date.now());
function cotBadge(r) {
  if (r.status === 'CANCELLED') return ['badge-red', 'fa-ban', 'Cancelado · no pagó'];
  if (r.status === 'CLOSED') return r.mySelected ? ['badge-yellow', 'fa-clock', 'Pendiente de pago'] : ['badge-gray', 'fa-circle-xmark', 'No elegida'];
  return ['badge-purple', 'fa-hourglass-half', 'Esperando decisión'];
}

export default function Comercio() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState([]);
  const [sales, setSales] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [creditReqs, setCreditReqs] = useState([]);
  const [tab, setTab] = useState('pend');
  const [entSub, setEntSub] = useState('curso');
  const [cobFilt, setCobFilt] = useState('pend');
  const [modal, setModal] = useState(null);    // cotizar (pendiente)
  const [detalle, setDetalle] = useState(null); // detalle read-only (ventas/cotizadas)
  const [payAcc, setPayAcc] = useState(null);   // registrar pago CC
  const [credModal, setCredModal] = useState(false);
  const [zoom, setZoom] = useState(null);
  const [dismissed, setDismissed] = useState([]);
  const [drafts, setDrafts] = useState({});     // precio inline por pedido
  const [loaded, setLoaded] = useState(false);
  const [histPage, setHistPage] = useState(1);
  const [cobPage, setCobPage] = useState(1);

  const arrivalsRef = useRef(null);
  const load = async () => {
    // secundarias (no bloquean el refresco crítico de solicitudes/ventas)
    getStoreCreditAccounts().then((a) => setAccounts((p) => keep(p, a || []))).catch(() => {});
    getStoreCreditRequests().then((r) => setCreditReqs((p) => keep(p, r || []))).catch(() => {});
    try {
      const [m, o, s] = await Promise.all([getMe(), getOpenRequestsForStore(), getStoreSales()]);
      setMe((p) => keep(p, m || null));
      setOpen((p) => keep(p, o || []));
      setSales((p) => keep(p, s || []));
      setLoaded(true);
      const ahora = new Set((s || []).filter((x) => x.orderStatus === 'PAID' && x.arrivedPickup).map((x) => x.orderId));
      if (arrivalsRef.current) {
        for (const x of s || []) {
          if (ahora.has(x.orderId) && !arrivalsRef.current.has(x.orderId)) {
            ping(3);
            toast({ title: '🛵 ¡Llegó el repartidor!', sub: `Está en tu local por «${label(x)}» — pedile su PIN y confirmá el retiro (Ventas › En curso)`, icon: 'fa-location-dot', type: 'yellow', duration: 20000 });
          }
        }
      }
      arrivalsRef.current = ahora;
    } catch {}
  };
  usePoll(load, 4000);

  useEffect(() => { const t = sessionStorage.getItem('rat_comercio_tab'); if (t) setTab(t); }, []);
  useEffect(() => { try { sessionStorage.setItem('rat_comercio_tab', tab); } catch {} }, [tab]);

  const initials = (me?.name || 'RC').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  // listas derivadas
  const pend = open
    .filter((r) => r.myCount === 0 && windowOpen(r) && !dismissed.includes(r.id))
    .sort((a, b) => (a.windowEndsAt || Infinity) - (b.windowEndsAt || Infinity) || (a.urgency === 'Necesito ahora' ? -1 : 1));
  const cot = open.filter((r) => r.myCount > 0).sort((a, b) => b.createdAt - a.createdAt);
  const enCurso = sales.filter((r) => r.orderStatus === 'PAID' || r.orderStatus === 'SHIPPED').sort((a, b) => b.soldAt - a.soldAt);
  const hist = sales.filter((r) => r.orderStatus === 'DELIVERED').sort((a, b) => b.soldAt - a.soldAt);
  const pickupCount = sales.filter((r) => r.orderStatus === 'PAID' && r.arrivedPickup).length;
  useTitleBell(pend.length + pickupCount, 'Comercio · RepuestosAlToque');

  // por cobrar
  const plataforma = sales.filter((r) => !r.creditAccount);
  const plataformaSum = plataforma.reduce((a, r) => a + (r.part || 0), 0);
  const ccSaldo = accounts.reduce((a, x) => a + (x.saldo || 0), 0);
  const conSaldoCount = accounts.filter((a) => a.saldo > 0).length;
  const porCobrarTotal = plataformaSum + ccSaldo;
  const accountsFilt = accounts.filter((a) => cobFilt === 'all' ? true : cobFilt === 'cob' ? a.saldo === 0 : a.saldo > 0);
  const credPending = creditReqs.filter((r) => r.storeStatus === 'PENDING');

  async function quickQuote(r, priceStr) {
    const price = String(priceStr || '').trim();
    if (!price) { toast({ title: 'Escribí el precio', icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
    const res = await createQuote(r.id, { price, partBrand: 'Original / OEM', optionLabel: 'Original / OEM' });
    if (res?.error) { toast({ title: res.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
    setDrafts((d) => { const n = { ...d }; delete n[r.id]; return n; });
    ping(); toast({ title: 'Cotización enviada', sub: 'El mecánico la ve al cerrar la ventana', icon: 'fa-paper-plane', type: 'green' });
    load();
  }
  async function sendQuote(payload) {
    const res = await createQuote(modal.id, payload);
    setModal(null);
    if (res?.error) { toast({ title: res.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
    ping(); toast({ title: 'Cotización enviada', sub: 'El mecánico la ve al cerrar la ventana', icon: 'fa-paper-plane', type: 'green' });
    load();
  }
  async function logout() { await logoutAction(); router.push('/login'); }

  const TABS = [
    ['pend', 'Pedidos', pend.length],
    ['cot', 'Enviadas', 0],
    ['ent', 'Ventas', enCurso.length],
    ['cobrar', 'Por cobrar', 0],
  ];

  return (
    <div className="app-shell wide cmz">
      <div className="topbar">
        <Link href="/comercio" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>Panel Comercio</span></Link>
        <div className="topbar-actions">
          <FontScale />
          <Link href="/comercio/perfil" className="icon-btn" title="Mi perfil"><i className="fa-solid fa-user"></i></Link>
          <button className="icon-btn" onClick={logout} title="Salir"><i className="fa-solid fa-right-from-bracket"></i></button>
          <Link href="/comercio/perfil" className="avatar" style={{ background: 'linear-gradient(135deg,var(--yellow),var(--purple))', textDecoration: 'none' }}>{initials}</Link>
        </div>
      </div>

      <div className="container">
        <div className="mb-24">
          <h1 className="h-lg" style={{ fontSize: 26 }}>Hola, {me?.name || 'Comercio'}</h1>
          <p className="subtle mt-4" style={{ fontSize: 17 }}>Acá ves los pedidos nuevos. Cargá tu precio y enviálo: es rápido.</p>
        </div>
        <div className="mb-16"><PushButton /></div>

        <div className="cmz-grid">
          {/* Columna principal */}
          <div>
            <div className="cmz-tabs mb-16">
              <div className="pill-tabs">
                {TABS.map(([k, lbl, n]) => (
                  <button key={k} type="button" className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{lbl}{n > 0 && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>{n}</span>}</button>
                ))}
              </div>
            </div>

            {/* PEDIDOS (en vivo) */}
            {tab === 'pend' && (!loaded ? <Loading label="Cargando solicitudes…" /> : pend.length === 0 ? (
              <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-inbox"></i></div><div className="text-sm">No hay solicitudes con la ventana abierta</div><div className="text-xs">Cuando un mecánico pida un repuesto de tus rubros, aparece acá con su cuenta regresiva.</div></div>
            ) : <div className="cmz-feed">{pend.map((r) => {
              const urgent = r.urgency === 'Necesito ahora';
              return (
                <div className={`card cmz-opp ${urgent ? 'is-urgent' : ''}`} key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 20 }}>
                  <div>
                    <div className="flex-between gap-12 mb-8" style={{ alignItems: 'center' }}>
                      <span className="badge badge-purple" style={{ fontSize: 15, fontWeight: 800 }}>Pedido Nº {r.code}</span>
                      <div className="flex-center gap-8" style={{ flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {r.invoiceType === 'factura_a' && <span className="badge badge-gray"><i className="fa-solid fa-file-invoice"></i> Factura A</span>}
                        {(r.photoUrls?.length > 0) && <span className="badge badge-purple"><i className="fa-solid fa-image"></i> {r.photoUrls.length}</span>}
                        {urgent && <span className="badge badge-red">Urgente</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 21, fontWeight: 800 }}>{label(r)}</div>
                    <div className="subtle mt-8" style={{ fontSize: 17 }}>{veh(r)}</div>
                    <div className="muted mt-8" style={{ fontSize: 15 }}><i className="fa-regular fa-clock"></i> {fmtDateTime(r.createdAt)}</div>
                    <div className="locked-info mt-8"><i className="fa-solid fa-user-secret"></i> Mecánico anónimo hasta concretar</div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 17, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>¿A cuánto lo vendés?</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-1)', fontWeight: 800, fontSize: 22, pointerEvents: 'none' }}>$</span>
                      <input className="input" inputMode="numeric" placeholder="Escribí el precio" value={drafts[r.id] || ''} onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))} style={{ paddingLeft: 36, fontSize: 22, fontWeight: 700 }} />
                    </div>
                  </div>
                  <button className="btn btn-yellow btn-lg btn-block" onClick={() => quickQuote(r, drafts[r.id])}><i className="fa-solid fa-paper-plane"></i> Enviar precio</button>
                  <div className="flex gap-12">
                    <button className="btn btn-ghost btn-block" onClick={() => setModal(r)}>Ver detalle</button>
                    <button className="btn btn-ghost btn-block" onClick={() => { setDismissed((d) => [...d, r.id]); toast({ title: 'Marcado: no lo tengo', sub: 'No penaliza tu balance', icon: 'fa-ban', type: 'purple' }); }}>No lo tengo</button>
                  </div>
                </div>
              );
            })}</div>)}

            {/* ENVIADAS (cotizadas) */}
            {tab === 'cot' && (!loaded ? <Loading label="Cargando tus cotizaciones…" /> : cot.length === 0 ? (
              <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-tags"></i></div><div className="text-sm">Todavía no cotizaste nada</div></div>
            ) : <div className="cmz-feed">{cot.map((r) => {
              const [cls, icon, txt] = cotBadge(r);
              const canAdd = ['OPEN', 'QUOTED'].includes(r.status) && r.myCount < 3;
              return (
                <div className="card" key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="flex-between" style={{ gap: 12 }}>
                    <div style={{ minWidth: 0 }}><div className="text-xs" style={{ fontWeight: 800, color: 'var(--purple-light)' }}>Pedido Nº {r.code}</div><div className="text-sm mt-4" style={{ fontWeight: 700 }}>{label(r)}</div><div className="text-xs muted">{veh(r)}</div></div>
                    <span className={`badge ${cls}`} style={{ flexShrink: 0 }}><i className={`fa-solid ${icon}`}></i> {txt}</span>
                  </div>
                  <div className="flex-between text-sm">
                    <span className="muted">{r.mySelected ? 'Eligió tu precio' : 'Tus precios'}</span>
                    <span style={{ fontWeight: 800 }} className={r.mySelected ? 'text-yellow' : ''}>{r.mySelected && r.mySelectedPrice ? money(r.mySelectedPrice) : (r.myPrices || []).map((p) => money(p)).join(' · ')}</span>
                  </div>
                  <div className="text-xs muted"><i className="fa-regular fa-clock"></i> {timeAgo(r.createdAt)}</div>
                  <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDetalle(r)}><i className="fa-solid fa-circle-info"></i> Ver detalle</button>
                    {canAdd && <button className="btn btn-ghost btn-sm" onClick={() => setModal(r)}><i className="fa-solid fa-plus"></i> Agregar opción</button>}
                  </div>
                </div>
              );
            })}</div>)}

            {/* VENTAS (concretadas) */}
            {tab === 'ent' && (!loaded ? <Loading label="Cargando tus ventas…" /> : (
              <>
                <div className="cmz-tabs mb-16">
                  <div className="pill-tabs">
                    <button type="button" className={entSub === 'curso' ? 'active' : ''} onClick={() => setEntSub('curso')}>En curso <span className="badge badge-yellow" style={{ marginLeft: 4 }}>{enCurso.length}</span></button>
                    <button type="button" className={entSub === 'hist' ? 'active' : ''} onClick={() => setEntSub('hist')}>Historial <span className="badge badge-gray" style={{ marginLeft: 4 }}>{hist.length}</span></button>
                  </div>
                </div>
                {entSub === 'curso' && (enCurso.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-truck-fast"></i></div><div className="text-sm">Nada en curso</div><div className="text-xs">Las ventas con retiro o envío pendiente aparecen acá.</div></div>
                ) : <div className="cmz-feed">{enCurso.map((r) => <EntregaCard key={r.orderId} r={r} onChanged={load} onDetail={() => setDetalle(r)} />)}</div>)}
                {entSub === 'hist' && (hist.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-box"></i></div><div className="text-sm">Sin ventas en el historial</div></div>
                ) : <>
                  <div className="cmz-feed">{hist.slice((histPage - 1) * PER, histPage * PER).map((r) => (
                    <div className="card" key={r.orderId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="flex-between" style={{ gap: 12 }}>
                        <div style={{ minWidth: 0 }}><div className="text-xs" style={{ fontWeight: 800, color: 'var(--purple-light)' }}>Pedido Nº {r.code}</div><div className="text-sm mt-4" style={{ fontWeight: 700 }}>{label(r)}</div><div className="text-xs muted">{veh(r)}</div></div>
                        <div className="flex-center gap-8" style={{ flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 }}>
                          {r.creditAccount && <span className="badge badge-yellow"><i className="fa-solid fa-id-card-clip"></i> Cta. corriente</span>}
                          <span className="badge badge-green"><i className="fa-solid fa-box-open"></i> Entregado</span>
                        </div>
                      </div>
                      <div className="flex-between text-sm"><span className="muted">Venta · {timeAgo(r.soldAt)}</span><span className="text-green" style={{ fontWeight: 800 }}>{money(r.part)}</span></div>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDetalle(r)}><i className="fa-solid fa-circle-info"></i> Ver detalle</button>
                    </div>
                  ))}</div>
                  <Pager total={hist.length} page={histPage} setPage={setHistPage} />
                </>)}
              </>
            ))}

            {/* POR COBRAR */}
            {tab === 'cobrar' && (!loaded ? <Loading label="Cargando cobros…" /> : (
              <>
                <div className="grid-2 mb-16">
                  <div className="card stat-card"><div className="flex-between"><span className="stat-label">Te liquida RAT</span><i className="fa-solid fa-building-columns text-purple"></i></div><div className="stat-value">{money(plataformaSum)}</div><div className="text-xs muted">{plataforma.length} venta{plataforma.length === 1 ? '' : 's'} por plataforma</div></div>
                  <div className="card stat-card"><div className="flex-between"><span className="stat-label">Saldo en cta. corriente</span><i className="fa-solid fa-id-card-clip text-yellow"></i></div><div className="stat-value text-yellow">{money(ccSaldo)}</div><div className="text-xs muted">{conSaldoCount} taller{conSaldoCount === 1 ? '' : 'es'} con saldo</div></div>
                </div>
                <div className="cmz-tabs mb-16">
                  <div className="pill-tabs">
                    <button type="button" className={cobFilt === 'pend' ? 'active' : ''} onClick={() => { setCobFilt('pend'); setCobPage(1); }}>Con saldo</button>
                    <button type="button" className={cobFilt === 'cob' ? 'active' : ''} onClick={() => { setCobFilt('cob'); setCobPage(1); }}>Saldadas</button>
                    <button type="button" className={cobFilt === 'all' ? 'active' : ''} onClick={() => { setCobFilt('all'); setCobPage(1); }}>Todas</button>
                  </div>
                </div>
                <div className="card">
                  {accountsFilt.length === 0
                    ? <div className="empty-state" style={{ padding: 28 }}><div className="empty-icon"><i className="fa-solid fa-id-card-clip"></i></div><div className="text-sm">No hay cuentas en este filtro</div></div>
                    : accountsFilt.slice((cobPage - 1) * PER, cobPage * PER).map((a) => <AccountCard key={a.mechanicId} a={a} onPay={() => setPayAcc(a)} />)}
                  <Pager total={accountsFilt.length} page={cobPage} setPage={setCobPage} />
                  <div className="text-xs muted mt-8">Las ventas por plataforma se liquidan semanalmente. Las de cuenta corriente las cobrás vos al taller — registrá los pagos a medida que los recibís.</div>
                </div>
              </>
            ))}
          </div>

          {/* Columna lateral */}
          <div className="cmz-rail">
            {pickupCount > 0 && <button className="btn btn-yellow btn-lg btn-block" onClick={() => { setTab('ent'); setEntSub('curso'); }}><i className="fa-solid fa-motorcycle"></i> Entregar al repartidor ({pickupCount})</button>}

            <div className="card">
              <div className="flex-between" style={{ gap: 12 }}>
                <div style={{ minWidth: 0 }}><div className="muted" style={{ fontSize: 15 }}>Por cobrar en total</div><div className="text-yellow" style={{ fontWeight: 800, fontSize: 26, marginTop: 4 }}>{money(porCobrarTotal)}</div></div>
                <div className="store-avatar" style={{ flexShrink: 0 }}><i className="fa-solid fa-coins"></i></div>
              </div>
              <button className="btn btn-ghost btn-block mt-16" onClick={() => setTab('cobrar')}>Ver cobros</button>
            </div>

            {credPending.length > 0 && (
              <div className="card">
                <div className="section-title"><h2>Solicitud de cuenta corriente</h2><span className="badge badge-yellow">{credPending.length}</span></div>
                <p className="muted mb-16" style={{ fontSize: 15 }}>Talleres que piden comprarte en cuenta corriente.</p>
                {credPending.map((r) => <CredRow key={r.id} r={r} onChanged={load} />)}
              </div>
            )}

            <button className="btn btn-ghost btn-block" onClick={() => setCredModal(true)} style={{ justifyContent: 'space-between' }}><span><i className="fa-solid fa-id-card-clip"></i> Cuentas corrientes</span><i className="fa-solid fa-chevron-right"></i></button>
          </div>
        </div>

        <p className="text-center text-xs muted mt-24 mb-24">RepuestosAlToque · Comercio</p>
      </div>

      {modal && <CotizarModal lead={modal} onClose={() => setModal(null)} onSend={sendQuote} />}
      {detalle && <DetalleModal r={detalle} onClose={() => setDetalle(null)} />}
      {payAcc && <RegisterPaymentModal acc={payAcc} onClose={() => setPayAcc(null)} onSaved={load} />}
      {credModal && <CuentasModal rows={creditReqs} onClose={() => setCredModal(false)} />}
      {zoom && <div onClick={() => setZoom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 300, display: 'grid', placeItems: 'center', padding: 20, cursor: 'zoom-out' }}><img src={zoom} alt="" style={{ maxWidth: '92vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12 }} /></div>}
    </div>
  );
}

function AccountCard({ a, onPay }) {
  const [exp, setExp] = useState(false);
  const pct = a.facturado > 0 ? Math.min(100, Math.round((a.pagado / a.facturado) * 100)) : 0;
  return (
    <div className="card cmz-acc mb-12" style={{ background: 'var(--bg-1)' }}>
      <div className="flex-between" style={{ gap: 12 }}>
        <div className="flex-center gap-12" style={{ minWidth: 0 }}>
          <div className="store-avatar" style={{ flexShrink: 0 }}><i className="fa-solid fa-screwdriver-wrench"></i></div>
          <div style={{ minWidth: 0 }}><div className="text-sm" style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.mechanicName}</div><div className="text-xs muted">{a.itemsCount} compras · últ. {timeAgo(a.lastAt)}</div></div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}><div className="text-xs muted">Saldo</div><div className={a.saldo > 0 ? 'text-yellow' : 'text-green'} style={{ fontWeight: 800, fontSize: 18 }}>{money(a.saldo)}</div></div>
      </div>
      <div className="progress-track mt-12"><div className="progress-fill" style={{ width: `${pct}%` }}></div></div>
      <div className="flex-between text-xs muted mt-8"><span>Facturado {money(a.facturado)}</span><span>Pagado {money(a.pagado)}</span></div>
      <div className="flex gap-8 mt-12" style={{ flexWrap: 'wrap' }}>
        {a.saldo > 0 ? <button className="btn btn-yellow btn-sm" onClick={onPay}><i className="fa-solid fa-hand-holding-dollar"></i> Registrar pago</button> : <span className="badge badge-green"><i className="fa-solid fa-circle-check"></i> Saldada</span>}
        <button className="btn btn-ghost btn-sm" onClick={() => setExp((x) => !x)}><i className="fa-solid fa-list"></i> {exp ? 'Ocultar detalle' : 'Ver detalle'}</button>
      </div>
      {exp && (
        <>
          <div className="divider"></div>
          <div className="text-xs muted mb-8">Compras a cuenta</div>
          {a.items.map((it, i) => <div className="flex-between text-xs" key={i} style={{ padding: '5px 0' }}><span className="subtle">{it.part}</span><span style={{ fontWeight: 700 }}>{money(it.amount)}</span></div>)}
          {a.payments.length > 0 && (
            <>
              <div className="text-xs muted mb-8 mt-12">Pagos recibidos</div>
              {a.payments.map((p) => <div className="flex-between text-xs" key={p.id} style={{ padding: '5px 0' }}><span className="text-green"><i className="fa-solid fa-arrow-down"></i> {timeAgo(p.at)}{p.note ? ` · ${p.note}` : ''}</span><span className="text-green" style={{ fontWeight: 700 }}>+ {money(p.amount)}</span></div>)}
            </>
          )}
        </>
      )}
    </div>
  );
}

function RegisterPaymentModal({ acc, onClose, onSaved }) {
  const [amount, setAmount] = useState(String(acc.saldo || ''));
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  async function save() {
    setSending(true);
    try {
      const res = await registerCreditPayment(acc.mechanicId, amount, note);
      if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
      toast({ title: 'Pago registrado', sub: `${acc.mechanicName} · ${money(amount)}`, icon: 'fa-hand-holding-dollar', type: 'green' });
      onSaved?.(); onClose();
    } finally { setSending(false); }
  }
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-handle"></div>
        <h2 className="h-md mb-4">Registrar pago</h2>
        <p className="text-sm muted mb-16">Cuenta corriente · {acc.mechanicName}</p>
        <div className="card mb-16" style={{ background: 'var(--bg-1)' }}>
          <div className="flex-between" style={{ padding: '8px 0' }}><span className="text-sm muted">Facturado</span><span className="text-sm" style={{ fontWeight: 700 }}>{money(acc.facturado)}</span></div>
          <div className="flex-between" style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}><span className="text-sm muted">Ya pagó</span><span className="text-sm text-green" style={{ fontWeight: 700 }}>{money(acc.pagado)}</span></div>
          <div className="flex-between" style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}><span className="text-sm muted">Saldo actual</span><span className="text-sm text-yellow" style={{ fontWeight: 800 }}>{money(acc.saldo)}</span></div>
        </div>
        <div className="field"><label>Monto del pago</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)', fontWeight: 700, pointerEvents: 'none' }}>$</span>
            <input className="input" inputMode="numeric" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ paddingLeft: 26 }} />
          </div>
        </div>
        <div className="field"><label>Nota <span className="muted">(opcional)</span></label><input className="input" maxLength={200} placeholder="Efectivo, transferencia…" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="flex gap-12">
          <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} disabled={sending} onClick={onClose}>Cancelar</button>
          <button className="btn btn-yellow btn-block" disabled={sending || !String(amount).trim()} onClick={save}>{sending ? <span className="spinner" style={{ width: 16, height: 16 }}></span> : <><i className="fa-solid fa-check"></i> Registrar pago</>}</button>
        </div>
      </div>
    </div>
  );
}

function CuentasModal({ rows, onClose }) {
  const CC = { APPROVED: ['badge-green', 'Aprobada'], PENDING: ['badge-yellow', 'Pendiente'], REJECTED: ['badge-red', 'Rechazada'] };
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-handle"></div>
        <div className="flex-between mb-4"><h2 className="h-md">Cuentas corrientes</h2><button className="icon-btn" onClick={onClose} title="Cerrar"><i className="fa-solid fa-xmark"></i></button></div>
        <p className="subtle mb-16" style={{ fontSize: 16 }}>Talleres habilitados a comprarte en cuenta corriente.</p>
        {rows.length === 0 && <div className="empty-state" style={{ padding: 24 }}><div className="text-sm">Sin solicitudes todavía</div></div>}
        {rows.map((r) => {
          const m = CC[r.storeStatus] || ['badge-gray', r.storeStatus];
          return (
            <div className="card mb-12" key={r.id} style={{ background: 'var(--bg-1)' }}>
              <div className="flex-between gap-12" style={{ alignItems: 'center' }}>
                <div className="flex-center gap-12" style={{ minWidth: 0 }}><div className="store-avatar" style={{ flexShrink: 0 }}><i className="fa-solid fa-screwdriver-wrench"></i></div><div className="text-sm" style={{ fontWeight: 700 }}>{r.mechanicName}</div></div>
                <span className={`badge ${m[0]}`} style={{ flexShrink: 0 }}>{m[1]}</span>
              </div>
            </div>
          );
        })}
        <button className="btn btn-ghost btn-block mt-8" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

function CredRow({ r, onChanged }) {
  const [busy, setBusy] = useState(false);
  async function act(approve) {
    setBusy(true);
    await storeActOnCredit(r.id, approve);
    toast({ title: approve ? 'Cuenta corriente aprobada' : 'Solicitud rechazada', icon: approve ? 'fa-check' : 'fa-ban', type: approve ? 'green' : 'purple' });
    await onChanged?.(); setBusy(false);
  }
  return (
    <div className="mb-16">
      <div className="flex-center gap-12 mb-12" style={{ minWidth: 0 }}><div className="store-avatar"><i className="fa-solid fa-screwdriver-wrench"></i></div><div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 17 }}>{r.mechanicName}</div></div></div>
      <div className="flex gap-12">
        <button className="btn btn-success btn-block" disabled={busy} onClick={() => act(true)}>{busy ? <span className="spinner" style={{ width: 14, height: 14 }}></span> : 'Aceptar'}</button>
        <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => act(false)}>Rechazar</button>
      </div>
    </div>
  );
}

function EntregaCard({ r, onChanged, onDetail }) {
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false);
  async function confirmar() {
    if (sending) return;
    setSending(true);
    try {
      const res = await storeConfirmPickup(r.orderId, pin);
      setPin('');
      if (res?.error) { toast({ title: res.error, icon: 'fa-triangle-exclamation', type: 'yellow' }); return; }
      toast({ title: 'Retiro confirmado', sub: 'La pieza va en camino al taller', icon: 'fa-truck-fast', type: 'green' });
      onChanged?.();
    } finally { setSending(false); }
  }
  // se puede confirmar el retiro apenas hay repartidor asignado (pieza paga); el cartel "está en tu local" sale solo si ya llegó
  const canConfirm = r.orderStatus === 'PAID' && r.hasDelivery;
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="flex-between" style={{ gap: 12 }}>
        <div style={{ minWidth: 0 }}><div className="text-xs" style={{ fontWeight: 800, color: 'var(--purple-light)' }}>Pedido Nº {r.code}</div><div className="text-sm mt-4" style={{ fontWeight: 700 }}>{label(r)}</div><div className="text-xs muted">{veh(r)}</div></div>
        <div className="flex-center gap-8" style={{ flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 }}>
          {r.creditAccount && <span className="badge badge-yellow"><i className="fa-solid fa-id-card-clip"></i> Cta. corriente</span>}
          {r.orderStatus === 'SHIPPED' && <span className="badge badge-orange"><i className="fa-solid fa-truck-fast"></i> En camino al taller</span>}
          {r.orderStatus === 'PAID' && !r.hasDelivery && <span className="badge badge-gray"><i className="fa-solid fa-clock"></i> Esperando repartidor</span>}
          {r.orderStatus === 'PAID' && r.hasDelivery && !r.arrivedPickup && <span className="badge badge-yellow"><i className="fa-solid fa-motorcycle"></i> Repartidor en camino</span>}
          {canConfirm && r.arrivedPickup && <span className="badge badge-green"><i className="fa-solid fa-location-dot"></i> Llegó a tu local</span>}
        </div>
      </div>
      <div className="flex-between text-sm"><span className="muted">Venta</span><span className="text-green" style={{ fontWeight: 800 }}>{money(r.part)}</span></div>
      {r.issue && <div className="float-notif" style={{ padding: '8px 12px', borderColor: 'rgba(239,68,68,0.4)' }}><i className="fa-solid fa-flag text-red"></i><span className="text-xs subtle"><b>Incidencia:</b> {r.issue}</span></div>}
      {canConfirm && (
        <>
          {r.arrivedPickup
            ? <div className="float-notif" style={{ padding: '8px 12px', borderColor: 'rgba(250,204,21,0.45)' }}><i className="fa-solid fa-location-dot text-yellow"></i><span className="text-xs subtle"><b>El repartidor está en tu local</b> — pedile el PIN y confirmá el retiro.</span></div>
            : <div className="text-xs muted"><i className="fa-solid fa-key"></i> Cuando venga el repartidor, pedile su PIN y confirmá el retiro.</div>}
          <div className="flex gap-8">
            <input className="input" inputMode="numeric" maxLength={4} placeholder="PIN" aria-label="PIN de retiro" value={pin} onChange={(e) => setPin(e.target.value)} style={{ maxWidth: 110, textAlign: 'center', letterSpacing: '0.2em', fontWeight: 800 }} />
            <button className="btn btn-yellow btn-block" disabled={pin.length !== 4 || sending} onClick={confirmar}>{sending ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Confirmando…</> : <><i className="fa-solid fa-box"></i> Confirmar retiro</>}</button>
          </div>
        </>
      )}
      <div className="flex-between">
        <span className="text-xs muted"><i className="fa-regular fa-clock"></i> {fmtDateTime(r.soldAt)}</span>
        <button className="btn btn-ghost btn-sm" onClick={onDetail}><i className="fa-solid fa-circle-info"></i> Ver detalle</button>
      </div>
    </div>
  );
}

function DRow({ k, v }) {
  return <div className="flex-between" style={{ padding: '10px 0', borderTop: '1px solid var(--border)', gap: 12 }}><span className="text-sm" style={{ flexShrink: 0, color: '#fff' }}>{k}</span><span className="text-sm" style={{ fontWeight: 700, textAlign: 'right', color: '#fff' }}>{v}</span></div>;
}

function DetalleModal({ r, onClose }) {
  const [zoom, setZoom] = useState(null);
  const v = `${r.brand || ''} ${r.model || ''} ${r.year || ''}`.trim();
  const isSale = !!r.orderId || !!r.orderStatus;
  const ESTADO = { PAID: r.hasDelivery ? 'Pagado · repartidor en camino' : 'Pagado · esperando repartidor', SHIPPED: 'Retirado · en camino al taller', DELIVERED: 'Entregado al mecánico', READY: 'Listo', REFUNDED: 'Reembolsado' };
  const estadoCot = isSale ? null
    : r.status === 'CANCELLED' ? 'Cancelado — el mecánico no pagó'
    : r.status === 'CLOSED' ? (r.mySelected ? 'Esperando pago del mecánico' : 'No elegida')
    : r.myCount > 0 ? 'Esperando decisión del mecánico'
    : 'Pendiente — todavía no cotizaste';
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-handle"></div>
        <div className="flex-between mb-4"><h2 className="h-md">{label(r)}</h2>{r.code && <span className="badge badge-gray">#{r.code}</span>}</div>
        <p className="text-sm muted mb-16">{v || 'Vehículo'}{r.catLabel ? ` · ${r.catLabel}` : ''}</p>
        <div className="card mb-12" style={{ background: 'var(--bg-1)', paddingTop: 0 }}>
          <DRow k="Repuesto" v={label(r)} />
          <DRow k="Categoría" v={r.catLabel || '—'} />
          <DRow k="Vehículo" v={v || '—'} />
          <DRow k="Motorización" v={r.engine || 'No especificado'} />
          {r.vin && <DRow k="VIN / Chasis" v={r.vin} />}
          <DRow k="Urgencia" v={r.urgency || '—'} />
          <DRow k="Fecha del pedido" v={fmtDateTime(r.createdAt)} />
          <DRow k="Factura" v={r.invoiceType === 'factura_a' ? 'Factura A' : 'Consumidor Final'} />
          {r.invoiceType === 'factura_a' && <DRow k="A nombre de" v={`${r.solicRazon || '—'}${r.solicCuit ? ` · CUIT ${r.solicCuit}` : ''}`} />}
        </div>
        {estadoCot && (
          <div className="card mb-12" style={{ background: 'var(--bg-1)', paddingTop: 0 }}>
            <DRow k="Estado" v={estadoCot} />
            {r.mySelected && r.mySelectedPrice ? <DRow k="Precio elegido" v={money(r.mySelectedPrice)} /> : null}
          </div>
        )}
        {isSale && (
          <div className="card mb-12" style={{ background: 'var(--bg-1)', paddingTop: 0 }}>
            <DRow k="Mecánico" v={r.mechanicName || '—'} />
            <DRow k="Fecha de venta" v={fmtDateTime(r.soldAt)} />
            <DRow k="Monto de la venta" v={r.part ? money(r.part) : '—'} />
            <DRow k="Estado" v={ESTADO[r.orderStatus] || r.orderStatus || '—'} />
            {r.creditAccount && <DRow k="Cuenta corriente" v={r.creditSettledAt ? 'Sí · cobrada' : 'Sí · pendiente de pago'} />}
            {r.issue && <DRow k="Incidencia" v={r.issue} />}
          </div>
        )}
        {r.photoUrls?.length > 0 && (
          <div className="mb-12">
            <div className="text-xs muted mb-8">Fotos <span className="muted">(tocá para agrandar)</span></div>
            <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>{r.photoUrls.map((u, i) => <img key={i} src={u} alt="" onClick={() => setZoom(u)} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', cursor: 'zoom-in' }} />)}</div>
          </div>
        )}
        <button className="btn btn-ghost btn-block" onClick={onClose}>Cerrar</button>
      </div>
      {zoom && <div onClick={() => setZoom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 500, display: 'grid', placeItems: 'center', padding: 20, cursor: 'zoom-out' }}><img src={zoom} alt="" style={{ maxWidth: '92vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12 }} /></div>}
    </div>
  );
}

function CotizarModal({ lead, onClose, onSend }) {
  const [price, setPrice] = useState('');
  const [sending, setSending] = useState(false);
  const [brand, setBrand] = useState('Bosch');
  const [opcion, setOpcion] = useState('Original / OEM');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [zoom, setZoom] = useState(null);
  const fileRef = useRef(null);
  const v = veh(lead);

  async function onPick(e) {
    const files = [...e.target.files].slice(0, 3 - photos.length);
    e.target.value = '';
    setUploading(true);
    for (const f of files) {
      try { const url = await uploadPhoto(f, 'cotizaciones'); setPhotos((p) => (p.length < 3 ? [...p, url] : p)); } catch { toast({ title: 'No se pudo subir', icon: 'fa-triangle-exclamation', type: 'yellow' }); }
    }
    setUploading(false);
  }
  function tryClose() {
    if (uploading) { toast({ title: 'Esperá un toque', sub: 'Se está subiendo la foto…', icon: 'fa-spinner', type: 'yellow' }); return; }
    const dirty = !!(String(price).trim() || photos.length || String(note).trim());
    if (dirty && !window.confirm('¿Descartar esta cotización? Vas a perder el precio y las fotos que cargaste.')) return;
    onClose();
  }

  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) tryClose(); }}>
      <div className="modal">
        <div className="modal-handle"></div>
        <div className="flex-between mb-4"><h2 className="h-md">Detalle del pedido</h2><span className="badge badge-purple" style={{ fontWeight: 800 }}>Pedido Nº {lead.code}</span></div>
        <p className="text-sm muted mb-16">{label(lead)} · {v}</p>

        <div className="card mb-16" style={{ background: 'var(--bg-1)', paddingTop: 0 }}>
          <DRow k="Categoría" v={lead.catLabel || '—'} />
          <DRow k="Motorización" v={lead.engine || 'No especificado'} />
          <DRow k="Urgencia" v={lead.urgency || '—'} />
          <DRow k="Factura" v={lead.invoiceType === 'factura_a' ? 'Factura A' : 'Consumidor Final'} />
          {lead.invoiceType === 'factura_a' && <DRow k="A nombre de" v={`${lead.solicRazon || '—'}${lead.solicCuit ? ` · CUIT ${lead.solicCuit}` : ''}`} />}
        </div>
        {lead.photoUrls?.length > 0 && (
          <div className="mb-16">
            <div className="text-xs muted mb-8">Fotos del mecánico <span className="muted">(tocá para agrandar)</span></div>
            <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>{lead.photoUrls.map((u, i) => <img key={i} src={u} alt="" onClick={() => setZoom(u)} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', cursor: 'zoom-in' }} />)}</div>
          </div>
        )}

        <div className="divider"></div>
        <h3 className="h-md mb-12" style={{ fontSize: 16 }}>Tu cotización{lead.myCount > 0 ? ` · opción ${lead.myCount + 1}` : ''}</h3>
        <div className="field"><label>Precio final</label><input className="input" inputMode="numeric" placeholder="$ 0" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div className="grid-2">
          <div className="field"><label>Marca de la pieza</label><select className="select" value={brand} onChange={(e) => setBrand(e.target.value)}><option>Bosch</option><option>TRW</option><option>Ferodo</option><option>Original / OEM</option><option>Alternativa</option></select></div>
          <div className="field"><label>Tipo de opción</label><select className="select" value={opcion} onChange={(e) => setOpcion(e.target.value)}><option>Original / OEM</option><option>Alternativa</option><option>Usado</option><option>Reacondicionado</option></select></div>
        </div>
        <div className="field">
          <label>Fotos de la pieza <span className="muted">(hasta 3, opcional)</span></label>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPick} />
          <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
            {photos.map((src, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={src} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
                <button onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>✕</button>
              </div>
            ))}
            {photos.length < 3 && <button type="button" className="upload-area" style={{ width: 64, height: 64, padding: 0, display: 'grid', placeItems: 'center' }} onClick={() => fileRef.current?.click()}><i className={`fa-solid ${uploading ? 'fa-spinner fa-spin' : 'fa-camera'}`}></i></button>}
          </div>
        </div>
        <div className="field"><label>Notas <span className="muted">(opcional)</span></label><textarea className="textarea" maxLength={300} placeholder="Stock disponible, garantía…" value={note} onChange={(e) => setNote(e.target.value)}></textarea></div>
        <div className="flex gap-12">
          <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} disabled={sending} onClick={tryClose}>Cancelar</button>
          <button className="btn btn-yellow btn-block" disabled={!price || sending} onClick={async () => { setSending(true); try { await onSend({ price, partBrand: brand, optionLabel: opcion, note, photoUrls: photos }); } finally { setSending(false); } }}>{sending ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Enviando…</> : <><i className="fa-solid fa-paper-plane"></i> Enviar cotización</>}</button>
        </div>
      </div>
      {zoom && <div onClick={() => setZoom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 500, display: 'grid', placeItems: 'center', padding: 20, cursor: 'zoom-out' }}><img src={zoom} alt="" style={{ maxWidth: '92vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12 }} /></div>}
    </div>
  );
}
