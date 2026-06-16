'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getMyStoreProfile } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';
import Loading from '@/components/Loading';

const IVA = { RESPONSABLE_INSCRIPTO: 'Responsable Inscripto', MONOTRIBUTO: 'Monotributo', EXENTO: 'Exento', CONSUMIDOR_FINAL: 'Consumidor Final' };
const COND = { NUEVO: 'Nuevo', USADO: 'Usado', REACONDICIONADO: 'Reacondicionado' };

export default function ComercioPerfil() {
  const router = useRouter();
  const [p, setP] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { getMyStoreProfile().then((d) => { setP(d); setLoaded(true); }).catch(() => setLoaded(true)); }, []);
  async function logout() { await logoutAction(); router.push('/login'); }

  const initials = (p?.tradeName || p?.name || 'C').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

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
                  <div className="text-xs muted mt-4">{p.rating != null ? <><i className="fa-solid fa-star text-yellow"></i> {p.rating} ({p.ratingsCount}) · </> : ''}{p.points.toLocaleString('es-AR')} puntos</div>
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
