'use client';
import { useState } from 'react';
import Link from 'next/link';
import { toast } from '@/lib/ui';
import { usePoll, keep } from '@/lib/usePoll';
import { getStoresForCredit, requestCreditAccount, getMyCreditPurchases } from '@/app/actions/data';
import Loading from '@/components/Loading';
import BusyButton from '@/components/BusyButton';

const BADGE = {
  NONE: null,
  PENDING: { cls: 'badge-yellow', icon: 'fa-clock', txt: 'Pendiente de validación' },
  ACTIVE: { cls: 'badge-green', icon: 'fa-circle-check', txt: 'Aprobada' },
  REJECTED: { cls: 'badge-red', icon: 'fa-circle-xmark', txt: 'Rechazada' },
  DISABLED: { cls: 'badge-gray', icon: 'fa-ban', txt: 'Desactivada' },
};

export default function Cuentas() {
  const [stores, setStores] = useState([]);
  const [compras, setCompras] = useState([]); // compras hechas en cuenta corriente
  const [loaded, setLoaded] = useState(false); // primer fetch completado (evita parpadeo del empty state)
  const load = async () => {
    try {
      const [d, c] = await Promise.all([getStoresForCredit(), getMyCreditPurchases()]);
      setStores((p) => keep(p, d || [])); setCompras((p) => keep(p, c || [])); setLoaded(true);
    } catch {}
  };
  usePoll(load, 6000);

  async function solicitar(st) {
    const res = await requestCreditAccount(st.storeId);
    if (res?.error) { toast({ title: res.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
    toast({ title: 'Solicitud enviada', sub: 'Queda pendiente de validación', icon: 'fa-paper-plane', type: 'green' });
    load();
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="flex-center"><Link href="/mecanico" className="icon-btn"><i className="fa-solid fa-arrow-left"></i></Link><div><div style={{ fontWeight: 800 }}>Mis Cuentas Corrientes</div><div className="text-xs muted">Vinculá tus proveedores habituales</div></div></div>
      </div>

      <div className="container">
        <div className="float-notif mb-16"><i className="fa-solid fa-circle-info text-purple"></i><div className="text-xs subtle">Pedí cuenta corriente con los comercios donde ya tenés cuenta. Cuando esté aprobada, en las cotizaciones vas a ver la etiqueta <b>“Cuenta Corriente disponible”</b> y vas a poder pagar solo comisión + envío.</div></div>

        <div className="section-title"><h2>Comercios adheridos</h2></div>
        {!loaded ? (
          <Loading label="Cargando comercios…" />
        ) : stores.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-store"></i></div><div className="text-sm">Todavía no hay comercios cargados</div></div>
        ) : stores.map((st) => {
          const b = BADGE[st.status];
          const canRequest = st.status === 'NONE' || st.status === 'REJECTED' || st.status === 'DISABLED';
          return (
            <div className="card mb-12" key={st.storeId}>
              <div className="flex-between">
                <div className="flex-center gap-12"><div className="store-avatar" style={{ background: 'linear-gradient(135deg,var(--yellow),var(--purple))', color: '#0B0B0F' }}><i className="fa-solid fa-store"></i></div><div><div className="text-sm" style={{ fontWeight: 700 }}>{st.name}</div><div className="text-xs muted">{st.barrio || 'Bariloche'}</div></div></div>
                <div className="flex-center gap-8">
                  {b && <span className={`badge ${b.cls}`}><i className={`fa-solid ${b.icon}`}></i> {b.txt}</span>}
                  {canRequest && <BusyButton className="btn btn-primary btn-sm" busyLabel="Enviando…" onClick={() => solicitar(st)}><i className="fa-solid fa-id-card-clip"></i> {st.status === 'NONE' ? 'Solicitar' : 'Solicitar de nuevo'}</BusyButton>}
                </div>
              </div>
            </div>
          );
        })}

        {/* Control de las compras hechas en cuenta corriente (lo que el mecánico le debe a cada comercio) */}
        <div className="section-title mt-24"><h2>Mis compras en cuenta corriente</h2>{compras.length > 0 && <span className="text-sm" style={{ fontWeight: 800 }}>{'$' + compras.reduce((a, c) => a + (c.part || 0), 0).toLocaleString('es-AR')}</span>}</div>
        {!loaded ? (
          <Loading label="Cargando compras…" />
        ) : compras.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><i className="fa-solid fa-id-card-clip"></i></div><div className="text-sm">Todavía no compraste con cuenta corriente</div><div className="text-xs">Cuando elijas pagar un repuesto con CC, aparece acá</div></div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Producto</th><th>Fecha</th><th>Comercio</th><th>Monto</th><th>Estado</th></tr></thead>
              <tbody>
                {compras.map((c) => (
                  <tr key={c.orderId}>
                    <td className="text-xs">{c.producto}{c.brand || c.model ? <span className="muted"> · {`${c.brand || ''} ${c.model || ''}`.trim()}</span> : null}</td>
                    <td className="text-xs">{c.soldAt ? new Date(c.soldAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</td>
                    <td className="text-xs">{c.storeName}</td>
                    <td className="text-xs" style={{ fontWeight: 800 }}>{c.part ? '$' + c.part.toLocaleString('es-AR') : '—'}</td>
                    <td>{c.settled
                      ? <span className="badge badge-green"><i className="fa-solid fa-circle-check"></i> Procesada por el comercio</span>
                      : <span className="badge badge-yellow"><i className="fa-solid fa-clock"></i> Pendiente</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
