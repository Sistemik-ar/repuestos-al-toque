import Link from 'next/link';

export default function Home() {
  return (
    <div className="app-shell">
      <div className="container" style={{ paddingTop: 32 }}>
        <div className="flex-center mb-24" style={{ justifyContent: 'space-between' }}>
          <div className="flex-center" style={{ gap: 10 }}>
            <div className="logo-mark" style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,var(--purple),var(--purple-light))', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-glow)' }}>
              <i className="fa-solid fa-gear" style={{ color: 'white', fontSize: 20 }}></i>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>RepuestosAlToque</div>
              <div className="text-xs muted">Bariloche · Patagonia</div>
            </div>
          </div>
          <Link href="/login" className="btn btn-ghost btn-sm"><i className="fa-solid fa-right-to-bracket"></i> Ingresar</Link>
        </div>

        <div className="badge badge-yellow mb-12"><i className="fa-solid fa-bolt"></i> Repuestos en minutos, no en días</div>
        <h1 className="h-xl mb-12">
          El repuesto que necesitás,<br />
          <span className="text-purple">al toque.</span>
        </h1>
        <p className="subtle mb-24" style={{ lineHeight: 1.5 }}>
          Pedí un repuesto y recibí cotizaciones de casas cercanas <b className="text-yellow">en tiempo real</b>. Vos elegís. Sin perder horas al teléfono.
        </p>

        <div className="flex-col gap-12 mb-24">
          <Link href="/login" className="btn btn-primary btn-lg btn-block"><i className="fa-solid fa-right-to-bracket"></i> Ingresar a mi cuenta</Link>
          <Link href="/demo/" className="btn btn-yellow btn-lg btn-block"><i className="fa-solid fa-play"></i> Ver la demo</Link>
        </div>

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

        <div className="card mb-16">
          <div className="text-sm" style={{ fontWeight: 700, marginBottom: 6 }}>¿Cómo funciona?</div>
          <ol className="text-sm subtle" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>El mecánico pide un repuesto (vehículo, pieza, urgencia).</li>
            <li>Las casas cercanas cotizan en una ventana de 10 minutos.</li>
            <li>Elige la mejor oferta y paga por Mercado Pago.</li>
            <li>La empresa de envíos retira y entrega en el taller.</li>
          </ol>
        </div>

        <p className="text-center text-xs muted mt-24">
          Bariloche, AR · <Link href="/terminos" className="text-purple" style={{ fontWeight: 600 }}>Términos y Condiciones</Link>
        </p>
      </div>
    </div>
  );
}
