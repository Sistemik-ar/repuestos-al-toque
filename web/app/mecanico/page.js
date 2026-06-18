'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import Loading from '@/components/Loading';
import PushButton from '@/components/PushButton';
import FontScale from '@/components/FontScale';
import { toast, ping } from '@/lib/ui';
import { usePoll, keep } from '@/lib/usePoll';
import { useTitleBell } from '@/lib/useTitleBell';
import { getMe, getMyJobs } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';

const PER = 6;
// estado mostrado por trabajo -> [badgeCls, badgeIcon, badgeLabel, hintCls, hintIcon, hintText, btnCls, btnLabel]
const META = {
  cotizando: ['badge-purple', 'fa-tower-broadcast', 'Buscando precios', 'muted', 'fa-clock', 'Estamos pidiendo precios a los comercios de tus rubros.', 'btn-ghost', 'Ver pedido'],
  elegir: ['badge-yellow', 'fa-hand-pointer', 'Elegí un precio', 'text-yellow', 'fa-hand-pointer', 'Llegaron precios — entrá a elegir el que más te convenga.', 'btn-yellow', 'Ver precios y elegir'],
  pagar: ['badge-yellow', 'fa-credit-card', 'Falta pagar', 'text-yellow', 'fa-credit-card', 'Ya elegiste. Falta pagar para que salga la pieza.', 'btn-yellow', 'Pagar ahora'],
  en_camino: ['badge-orange', 'fa-truck-fast', 'En camino', 'subtle', 'fa-truck-fast', 'El repartidor lleva la pieza a tu taller.', 'btn-ghost', 'Seguir pedido'],
  llego: ['badge-green', 'fa-location-dot', 'Llegó a tu taller', 'text-yellow', 'fa-location-dot', 'El repartidor está en tu taller. Recibí la pieza con tu PIN.', 'btn-yellow', 'Recibir con PIN'],
  entregado: ['badge-green', 'fa-box-open', 'Recibido', '', '', '', 'btn-ghost', 'Ver detalle'],
  cancelado: ['badge-red', 'fa-ban', 'Cancelado', '', '', '', 'btn-ghost', 'Ver detalle'],
};
const PRIO = { llego: 0, elegir: 1, pagar: 2, en_camino: 3, cotizando: 4 };
function dstate(jb) {
  if (jb.status === 'CANCELLED') return 'cancelado';
  if (jb.status === 'DONE') return 'entregado';
  if (jb.status === 'PAID') return (jb.items || []).some((i) => i.arrivedDrop) ? 'llego' : 'en_camino';
  if (jb.status === 'CLOSED') return 'pagar';
  if (jb.status === 'OPEN') return (jb.items || []).some((i) => i.status === 'QUOTED') ? 'elegir' : 'cotizando';
  return 'cotizando';
}
const veh = (jb) => `${jb.brand || ''} ${jb.model || ''}`.trim() || 'Vehículo';
const partsStr = (jb) => (jb.items || []).map((i) => i.desc || i.catLabel).filter(Boolean).join(' · ') || 'Repuesto';
const timeAgo = (ts) => { if (!ts) return ''; const s = (Date.now() - ts) / 1000; if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))} min`; if (s < 86400) return `hace ${Math.round(s / 3600)} h`; const d = Math.round(s / 86400); return `hace ${d} día${d === 1 ? '' : 's'}`; };

function JobCard({ jb, st, compact }) {
  const m = META[st];
  if (compact) return (
    <Link href={`/mecanico/trabajo?id=${jb.id}`} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, textDecoration: 'none', color: 'inherit', opacity: st === 'cancelado' ? 0.75 : 1 }}>
      <div className="flex-between gap-12" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}><div className="text-xs" style={{ fontWeight: 800, color: 'var(--purple-light)' }}>Pedido #{jb.code}</div><div className="text-sm mt-4" style={{ fontWeight: 700 }}>{veh(jb)}{(jb.plate || jb.vin) ? ` · ${jb.plate || jb.vin}` : ''}</div><div className="text-xs muted">{partsStr(jb)}</div></div>
        <span className={`badge ${m[0]}`} style={{ flexShrink: 0 }}><i className={`fa-solid ${m[1]}`}></i> {m[2]}</span>
      </div>
      <div className="flex-between"><span className="muted text-sm">{timeAgo(jb.createdAt)}</span><span className="text-xs text-purple" style={{ fontWeight: 700 }}>Ver detalle →</span></div>
    </Link>
  );
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
      <div>
        <div className="flex-between gap-12 mb-8" style={{ alignItems: 'center' }}>
          <span className="badge badge-purple" style={{ fontSize: 15, fontWeight: 800 }}>Pedido #{jb.code}</span>
          <span className={`badge ${m[0]}`}><i className={`fa-solid ${m[1]}`}></i> {m[2]}</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{veh(jb)}</div>
        <div className="subtle mt-4" style={{ fontSize: 16 }}>{partsStr(jb)}</div>
        <div className="muted mt-4" style={{ fontSize: 15 }}>{jb.plate || jb.vin}</div>
      </div>
      {m[5] && <div className={m[3]} style={{ fontSize: 16, fontWeight: 700 }}><i className={`fa-solid ${m[4]}`}></i> {m[5]}</div>}
      <Link href={`/mecanico/trabajo?id=${jb.id}`} className={`btn ${m[6]} btn-lg btn-block`} style={{ textDecoration: 'none' }}>{m[7]}</Link>
    </div>
  );
}

function MecPager({ total, page, setPage }) {
  const pages = Math.max(1, Math.ceil(total / PER));
  if (pages <= 1) return null;
  const cur = Math.min(page, pages);
  return (
    <div className="mec-pager">
      <span className="text-xs muted">{(cur - 1) * PER + 1}–{Math.min(cur * PER, total)} de {total}</span>
      <div className="flex gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm mec-pgbtn" onClick={() => setPage(Math.max(1, cur - 1))} disabled={cur <= 1}><i className="fa-solid fa-chevron-left"></i></button>
        <span className="text-sm muted" style={{ padding: '0 4px' }}>{cur} / {pages}</span>
        <button className="btn btn-ghost btn-sm mec-pgbtn" onClick={() => setPage(Math.min(pages, cur + 1))} disabled={cur >= pages}><i className="fa-solid fa-chevron-right"></i></button>
      </div>
    </div>
  );
}

export default function MecanicoDashboard() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('curso');
  const [recPage, setRecPage] = useState(1);
  const arrivalsRef = useRef(null);

  const load = async () => {
    try {
      const [m, js] = await Promise.all([getMe(), getMyJobs()]);
      setMe((p) => keep(p, m || null)); setJobs((p) => keep(p, js || [])); setLoaded(true);
      const items = (js || []).flatMap((jb) => jb.items || []);
      const ahora = new Set(items.filter((i) => i.arrivedDrop).map((i) => i.id));
      if (arrivalsRef.current) for (const i of items) if (ahora.has(i.id) && !arrivalsRef.current.has(i.id)) ping(3);
      arrivalsRef.current = ahora;
    } catch {}
  };
  usePoll(load, 4000);

  // vuelta desde Mercado Pago (?pago=ok | pend)
  useEffect(() => {
    const pago = new URLSearchParams(window.location.search).get('pago');
    if (!pago) return;
    if (pago === 'ok') { ping(); toast({ title: '¡Pago confirmado!', sub: 'El trabajo quedó pago — coordinamos el envío', icon: 'fa-circle-check', type: 'green', duration: 9000 }); }
    else if (pago === 'pend') toast({ title: 'Pago en proceso', sub: 'Esperando que Mercado Pago lo acredite. Apenas se confirme, el pedido avanza solo.', icon: 'fa-clock', type: 'yellow', duration: 11000 });
    router.replace('/mecanico');
  }, []); // eslint-disable-line

  const initials = (me?.name || 'TP').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const withState = jobs.map((jb) => ({ jb, st: dstate(jb) }));
  const enCurso = withState.filter((x) => PRIO[x.st] !== undefined).sort((a, b) => PRIO[a.st] - PRIO[b.st] || b.jb.createdAt - a.jb.createdAt);
  const recibidos = withState.filter((x) => x.st === 'entregado').sort((a, b) => b.jb.createdAt - a.jb.createdAt);
  const cancelados = withState.filter((x) => x.st === 'cancelado');
  const arrivedItems = jobs.flatMap((jb) => (jb.items || []).filter((i) => i.arrivedDrop));
  const elegirCount = enCurso.filter((x) => x.st === 'elegir').length;
  const pagarCount = enCurso.filter((x) => x.st === 'pagar').length;
  useTitleBell(elegirCount + pagarCount + arrivedItems.length);

  const firstTrabajo = (st) => { const x = enCurso.find((y) => y.st === st); return x ? `/mecanico/trabajo?id=${x.jb.id}` : '/mecanico'; };
  async function logout() { await logoutAction(); router.push('/login'); }

  return (
    <div className="app-shell mec">
      <div className="topbar">
        <Link href="/mecanico" className="brand"><span className="logo-mark"><i className="fa-solid fa-gear"></i></span><span>RepuestosAlToque</span></Link>
        <div className="topbar-actions">
          <FontScale />
          <button className="icon-btn" onClick={logout} title="Salir"><i className="fa-solid fa-right-from-bracket"></i></button>
          <div className="avatar">{initials}</div>
        </div>
      </div>

      <div className="container">
        <div className="mec-wrap">
          <div className="mb-24">
            <h1 className="h-lg" style={{ fontSize: 26 }}>Hola, {me?.name || 'Taller'}</h1>
            <p className="subtle mt-4" style={{ fontSize: 17 }}>¿Qué repuesto necesitás hoy? Pedilo y te llegan los precios.</p>
          </div>
          <div className="mb-16"><PushButton /></div>

          {arrivedItems.length > 0 && (
            <div className="card mec-arrival mb-16">
              <div className="flex-center gap-12 mb-16">
                <div className="store-avatar" style={{ background: 'var(--yellow)', color: '#0B0B0F', flexShrink: 0 }}><i className="fa-solid fa-location-dot"></i></div>
                <div style={{ minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 19 }}>¡Llegó el repartidor!</div><div className="subtle" style={{ fontSize: 16 }}>Está en tu taller esperando. Recibí la pieza con tu PIN.</div></div>
              </div>
              <Link className="btn btn-yellow btn-lg btn-block" href={`/mecanico/detalle?id=${arrivedItems[0].id}`} style={{ textDecoration: 'none' }}><i className="fa-solid fa-key"></i> Recibir ahora{arrivedItems.length > 1 ? ` (${arrivedItems.length})` : ''}</Link>
            </div>
          )}

          <Link href="/mecanico/pedido" className="btn btn-primary btn-lg btn-block mb-16" style={{ padding: 22, textDecoration: 'none' }}><i className="fa-solid fa-bolt"></i> Pedir un repuesto</Link>

          {(elegirCount > 0 || pagarCount > 0) && (
            <div className="mec-feed mb-24">
              {elegirCount > 0 && <Link className="btn btn-ghost btn-block" href={firstTrabajo('elegir')} style={{ justifyContent: 'space-between', textDecoration: 'none' }}><span><i className="fa-solid fa-hand-pointer"></i> Tenés precios para elegir</span><span className="badge badge-yellow">{elegirCount}</span></Link>}
              {pagarCount > 0 && <Link className="btn btn-ghost btn-block" href={firstTrabajo('pagar')} style={{ justifyContent: 'space-between', textDecoration: 'none' }}><span><i className="fa-solid fa-credit-card"></i> Tenés pedidos para pagar</span><span className="badge badge-yellow">{pagarCount}</span></Link>}
            </div>
          )}

          <div className="mec-tabs">
            <div className="pill-tabs">
              <button type="button" className={tab === 'curso' ? 'active' : ''} onClick={() => setTab('curso')}>En curso{enCurso.length > 0 && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>{enCurso.length}</span>}</button>
              <button type="button" className={tab === 'rec' ? 'active' : ''} onClick={() => setTab('rec')}>Recibidos</button>
              {cancelados.length > 0 && <button type="button" className={tab === 'cancel' ? 'active' : ''} onClick={() => setTab('cancel')}>Cancelados</button>}
            </div>
          </div>

          {!loaded ? <Loading label="Cargando tus pedidos…" /> : (<>
            {tab === 'curso' && (enCurso.length === 0
              ? <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-clipboard-list"></i></div><div className="text-sm">No tenés pedidos en curso</div><div className="text-xs">Tocá "Pedir un repuesto" para empezar.</div></div>
              : <div className="mec-feed">{enCurso.map((x) => <JobCard key={x.jb.id} jb={x.jb} st={x.st} />)}</div>)}

            {tab === 'rec' && (recibidos.length === 0
              ? <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-box-open"></i></div><div className="text-sm">Todavía no recibiste pedidos</div></div>
              : <>
                <div className="mec-feed">{recibidos.slice((recPage - 1) * PER, recPage * PER).map((x) => <JobCard key={x.jb.id} jb={x.jb} st={x.st} compact />)}</div>
                <MecPager total={recibidos.length} page={recPage} setPage={setRecPage} />
              </>)}

            {tab === 'cancel' && <div className="mec-feed">{cancelados.map((x) => <JobCard key={x.jb.id} jb={x.jb} st={x.st} compact />)}</div>}
          </>)}

          <div className="mt-24">
            <Link href="/mecanico/cuentas" className="btn btn-ghost btn-block" style={{ justifyContent: 'space-between', textDecoration: 'none' }}><span><i className="fa-solid fa-id-card-clip"></i> Mis cuentas corrientes</span><i className="fa-solid fa-chevron-right"></i></Link>
          </div>

          <p className="text-center text-xs muted mt-24 mb-24">RepuestosAlToque · Mecánico</p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
