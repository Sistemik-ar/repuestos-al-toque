import Link from 'next/link';

export default function Home() {
  return (
    <div className="app-shell">
      <div className="container" style={{ paddingTop: 32 }}>
        <div className="flex-center mb-24">
          <div
            className="logo-mark"
            style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,var(--purple),var(--purple-light))', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-glow)' }}
          >
            <i className="fa-solid fa-gear" style={{ color: 'white', fontSize: 20 }}></i>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>RepuestosAlToque</div>
            <div className="text-xs muted">Bariloche · Patagonia</div>
          </div>
        </div>

        <div className="badge badge-yellow mb-12">
          <i className="fa-solid fa-bolt"></i> Repuestos en minutos, no en días
        </div>
        <h1 className="h-xl mb-12">
          El repuesto que necesitás,<br />
          <span className="text-purple">al toque.</span>
        </h1>
        <p className="subtle mb-24" style={{ lineHeight: 1.5 }}>
          Pedí un repuesto y recibí cotizaciones de casas cercanas <b className="text-yellow">en tiempo real</b>. Vos elegís. Sin perder horas al teléfono.
        </p>

        <div className="grid-3 mb-24">
          <div className="card text-center" style={{ padding: '14px 8px' }}>
            <i className="fa-solid fa-bolt text-yellow" style={{ fontSize: 20 }}></i>
            <div className="text-sm mt-8" style={{ fontWeight: 700 }}>Velocidad</div>
            <div className="text-xs muted">No el precio más bajo</div>
          </div>
          <div className="card text-center" style={{ padding: '14px 8px' }}>
            <i className="fa-solid fa-tower-broadcast text-purple" style={{ fontSize: 20 }}></i>
            <div className="text-sm mt-8" style={{ fontWeight: 700 }}>En vivo</div>
            <div className="text-xs muted">Cotizaciones reales</div>
          </div>
          <div className="card text-center" style={{ padding: '14px 8px' }}>
            <i className="fa-solid fa-user-secret text-yellow" style={{ fontSize: 20 }}></i>
            <div className="text-sm mt-8" style={{ fontWeight: 700 }}>Anónimo</div>
            <div className="text-xs muted">Hasta pagar</div>
          </div>
        </div>

        <div className="section-title">
          <h2>Ingresá como…</h2>
          <span className="text-xs muted">demo</span>
        </div>
        <div className="flex-col gap-12">
          <Link href="/mecanico" className="card hoverable" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="store-avatar" style={{ background: 'rgba(109,40,217,0.2)' }}>
              <i className="fa-solid fa-screwdriver-wrench"></i>
            </div>
            <div style={{ flex: 1 }}>
              <div className="h-md">Mecánico</div>
              <div className="text-sm muted">Pedí repuestos y recibí cotizaciones</div>
            </div>
            <i className="fa-solid fa-chevron-right muted"></i>
          </Link>
          <Link href="/comercio" className="card hoverable" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="store-avatar" style={{ background: 'rgba(250,204,21,0.18)', color: 'var(--yellow)' }}>
              <i className="fa-solid fa-store"></i>
            </div>
            <div style={{ flex: 1 }}>
              <div className="h-md">Casa de Repuestos</div>
              <div className="text-sm muted">Recibí pedidos y cotizá rápido</div>
            </div>
            <i className="fa-solid fa-chevron-right muted"></i>
          </Link>
          <Link href="/admin" className="card hoverable" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="store-avatar" style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}>
              <i className="fa-solid fa-chart-line"></i>
            </div>
            <div style={{ flex: 1 }}>
              <div className="h-md">Admin</div>
              <div className="text-sm muted">Métricas y gestión de la plataforma</div>
            </div>
            <i className="fa-solid fa-chevron-right muted"></i>
          </Link>
        </div>

        <p className="text-center text-xs muted mt-24">
          Prototipo · Bariloche · v0.1<br />
          <Link href="/terminos" className="text-purple" style={{ fontWeight: 600 }}>Términos y Condiciones</Link>
        </p>
      </div>
    </div>
  );
}
