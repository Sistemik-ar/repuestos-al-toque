'use client';
import { useState } from 'react';
import Link from 'next/link';
import { toast } from '@/lib/ui';
import { usePoll, keep } from '@/lib/usePoll';
import { getStoresForCredit, requestCreditAccount } from '@/app/actions/data';

const BADGE = {
  NONE: null,
  PENDING: { cls: 'badge-yellow', icon: 'fa-clock', txt: 'Pendiente de validación' },
  ACTIVE: { cls: 'badge-green', icon: 'fa-circle-check', txt: 'Aprobada' },
  REJECTED: { cls: 'badge-red', icon: 'fa-circle-xmark', txt: 'Rechazada' },
  DISABLED: { cls: 'badge-gray', icon: 'fa-ban', txt: 'Desactivada' },
};

export default function Cuentas() {
  const [stores, setStores] = useState([]);
  const load = async () => { try { const d = await getStoresForCredit(); setStores((p) => keep(p, d || [])); } catch {} };
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
        {stores.length === 0 ? (
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
                  {canRequest && <button className="btn btn-primary btn-sm" onClick={() => solicitar(st)}><i className="fa-solid fa-id-card-clip"></i> {st.status === 'NONE' ? 'Solicitar' : 'Solicitar de nuevo'}</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
