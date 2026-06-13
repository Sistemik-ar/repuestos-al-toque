'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getMe, getMyJobs } from '@/app/actions/data';
import { logoutAction } from '@/app/actions/auth';
import { tierFor } from '@/lib/ui';

export default function Perfil() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [stats, setStats] = useState({ entregados: 0, activos: 0 });

  useEffect(() => {
    getMe().then(setMe).catch(() => {});
    getMyJobs().then((js) => {
      const items = (js || []).flatMap((j) => j.items || []);
      setStats({
        entregados: items.filter((i) => i.status === 'DELIVERED').length,
        activos: (js || []).filter((j) => ['DRAFT', 'OPEN', 'CLOSED'].includes(j.status)).length,
      });
    }).catch(() => {});
  }, []);

  async function logout() { await logoutAction(); router.push('/login'); }

  const badge = tierFor('mechanic', stats.entregados);
  const initials = (me?.name || 'TP').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="flex-center">
          <Link href="/mecanico" className="icon-btn"><i className="fa-solid fa-arrow-left"></i></Link>
          <div style={{ fontWeight: 800 }}>Mi perfil</div>
        </div>
        <button className="icon-btn" onClick={logout} title="Cerrar sesión"><i className="fa-solid fa-right-from-bracket"></i></button>
      </div>

      <div className="container">
        <div className="card glow mb-16" style={{ textAlign: 'center', padding: '28px 20px' }}>
          <div className="avatar" style={{ width: 72, height: 72, fontSize: 26, margin: '0 auto 12px' }}>{initials}</div>
          <div className="h-md">{me?.name || 'Taller'}</div>
          <div className="text-sm muted">{me?.email || ''}</div>
          <div className="mt-12"><span className={`rep-badge ${badge.cls}`}><i className={`fa-solid ${badge.icon}`}></i> {badge.label}</span></div>
        </div>

        <div className="grid-2 mb-16" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="card stat-card" style={{ padding: 16 }}><div className="stat-value text-green">{stats.entregados}</div><div className="stat-label">Repuestos recibidos</div></div>
          <div className="card stat-card" style={{ padding: 16 }}><div className="stat-value text-yellow">{stats.activos}</div><div className="stat-label">Trabajos activos</div></div>
        </div>

        <div className="section-title"><h2>Cuenta</h2></div>
        <Link href="/mecanico/cuentas" className="card mb-12 flex-between" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <span className="flex-center gap-12"><i className="fa-solid fa-id-card-clip text-purple"></i> <span className="text-sm" style={{ fontWeight: 700 }}>Cuentas corrientes</span></span>
          <i className="fa-solid fa-chevron-right muted"></i>
        </Link>
        <Link href="/terminos" className="card mb-12 flex-between" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <span className="flex-center gap-12"><i className="fa-solid fa-file-contract text-purple"></i> <span className="text-sm" style={{ fontWeight: 700 }}>Términos y condiciones</span></span>
          <i className="fa-solid fa-chevron-right muted"></i>
        </Link>

        <button className="btn btn-danger btn-block mt-16" onClick={logout}><i className="fa-solid fa-right-from-bracket"></i> Cerrar sesión</button>
      </div>
    </div>
  );
}
