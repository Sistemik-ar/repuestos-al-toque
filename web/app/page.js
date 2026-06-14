import Link from 'next/link';

export const metadata = {
  title: 'RepuestosAlToque — Repuestos urgentes en Bariloche',
  description: 'Pedí un repuesto y recibí cotizaciones de casas cercanas en tiempo real. Vos elegís. Sin perder horas al teléfono.',
};

export default function Home() {
  return (
    <>
      {/* NAV */}
      <header className="land-nav">
        <Link href="/" className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800 }}>
          <span className="logo-mark" style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,var(--purple),var(--purple-light))', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-glow)' }}><i className="fa-solid fa-gear"></i></span>
          <span>RepuestosAlToque <small style={{ display: 'block', fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>Bariloche · Patagonia</small></span>
        </Link>
        <div className="flex-center gap-12">
          <Link href="/demo/" prefetch={false} className="text-sm muted nowrap hide-mobile" style={{ fontWeight: 600 }}>Ver demo</Link>
          <Link href="/terminos" className="text-sm muted nowrap hide-mobile" style={{ fontWeight: 600 }}>Términos</Link>
          <Link href="/login" className="btn btn-primary btn-sm"><i className="fa-solid fa-right-to-bracket"></i> Ingresar</Link>
        </div>
      </header>

      <main className="land-wrap">
        {/* HERO */}
        <section className="hero">
          <div>
            <div className="badge badge-yellow mb-16"><i className="fa-solid fa-bolt"></i> Repuestos en minutos, no en días</div>
            <h1>El repuesto que necesitás,<br /><span className="text-purple">al toque.</span></h1>
            <p className="lead mt-16 mb-24">Pedí un repuesto y recibí cotizaciones de casas cercanas <b className="text-yellow">en tiempo real</b>. Vos elegís. Sin perder horas al teléfono ni andar recorriendo locales.</p>
            <div className="flex gap-12 flex-wrap mb-16">
              <Link href="/login" className="btn btn-primary btn-lg"><i className="fa-solid fa-bolt"></i> Empezar ahora</Link>
              <a href="#como" className="btn btn-ghost btn-lg">Cómo funciona</a>
            </div>
            <div className="flex-center gap-16 flex-wrap muted text-sm">
              <span><i className="fa-solid fa-user-secret text-purple"></i> Anónimo hasta concretar</span>
              <span><i className="fa-solid fa-shield-halved text-green"></i> Comercios verificados</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="phone">
              <div className="phone-screen">
                <div style={{ padding: '14px 14px 10px', background: 'rgba(11,11,15,0.6)', borderBottom: '1px solid var(--border)' }}>
                  <div className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>Ventana de ofertas · se revelan al cerrar</div>
                  <div className="countdown-big text-yellow" style={{ fontSize: 38 }}>07:42</div>
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="quote-card" style={{ padding: 13 }}>
                    <div className="flex-between mb-8">
                      <div className="flex-center gap-8"><div className="store-avatar" style={{ width: 34, height: 34, fontSize: 14 }}><i className="fa-solid fa-user-secret"></i></div><div><div style={{ fontWeight: 700, fontSize: 13 }}>Proveedor #12</div><div className="text-xs muted">★★★★★ 4.9 · Centro</div></div></div>
                      <span className="badge badge-green" style={{ fontSize: 9 }}>6 meses</span>
                    </div>
                    <div className="flex-between"><div className="price" style={{ fontSize: 19 }}>$48.500</div><span className="btn btn-primary btn-sm" style={{ fontSize: 11, padding: '6px 10px' }}>Elegir</span></div>
                  </div>
                  <div className="quote-card selected" style={{ padding: 13 }}>
                    <div className="flex-between mb-8">
                      <div className="flex-center gap-8"><div className="store-avatar" style={{ width: 34, height: 34, fontSize: 14 }}><i className="fa-solid fa-user-secret"></i></div><div><div style={{ fontWeight: 700, fontSize: 13 }}>Zona Oeste Parts</div><div className="text-xs muted">★★★★★ 4.8 · Oeste</div></div></div>
                      <span className="badge badge-green" style={{ fontSize: 9 }}>12 meses</span>
                    </div>
                    <div className="flex-between"><div className="price text-yellow" style={{ fontSize: 19 }}>$39.900</div><span className="badge badge-yellow" style={{ fontSize: 10 }}>Elegida</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* POR QUÉ */}
        <section className="sect">
          <div className="feat-grid">
            <div className="card text-center"><i className="fa-solid fa-bolt text-yellow" style={{ fontSize: 24 }}></i><div className="h-md mt-12">Velocidad</div><div className="text-sm muted mt-4">Optimizado para resolver, no para buscar el precio más bajo durante horas.</div></div>
            <div className="card text-center"><i className="fa-solid fa-tower-broadcast text-purple" style={{ fontSize: 24 }}></i><div className="h-md mt-12">En vivo</div><div className="text-sm muted mt-4">Cotizaciones reales de casas de Bariloche en una ventana de 10 minutos.</div></div>
            <div className="card text-center"><i className="fa-solid fa-user-secret text-yellow" style={{ fontSize: 24 }}></i><div className="h-md mt-12">Anónimo</div><div className="text-sm muted mt-4">Las dos partes son anónimas hasta concretar la venta. Sin presiones.</div></div>
          </div>
        </section>

        {/* CÓMO FUNCIONA */}
        <section className="sect" id="como">
          <div className="sect-head">
            <div className="eyebrow mb-8">Cómo funciona</div>
            <h2 className="h-xl">De la falla al repuesto, en tres pasos</h2>
          </div>
          <div className="step-row">
            <div className="card step"><div className="num">1</div><div><div className="h-md">Pedís</div><div className="text-sm muted mt-4">Cargás el vehículo, la pieza y la urgencia. Sumás una foto si querés.</div></div></div>
            <div className="card step"><div className="num">2</div><div><div className="h-md">Recibís ofertas</div><div className="text-sm muted mt-4">Varias casas cotizan. Al cerrar la ventana, ves todas juntas, ordenadas por reputación.</div></div></div>
            <div className="card step"><div className="num">3</div><div><div className="h-md">Elegís y pagás</div><div className="text-sm muted mt-4">Pagás por Mercado Pago. Recién ahí se revela el vendedor y coordinás el envío.</div></div></div>
          </div>
        </section>

        {/* ROLES */}
        <section className="sect">
          <div className="sect-head">
            <div className="eyebrow mb-8">Para todo el circuito</div>
            <h2 className="h-xl">Una plataforma, cuatro roles</h2>
          </div>
          <div className="roles">
            <div className="card hoverable">
              <div className="store-avatar mb-12" style={{ background: 'rgba(109,40,217,0.2)' }}><i className="fa-solid fa-screwdriver-wrench"></i></div>
              <div className="h-md">Mecánicos</div>
              <div className="text-sm muted mt-4">Piden repuestos, comparan y resuelven sin moverse del taller.</div>
            </div>
            <div className="card hoverable">
              <div className="store-avatar mb-12" style={{ background: 'rgba(250,204,21,0.18)', color: 'var(--yellow)' }}><i className="fa-solid fa-store"></i></div>
              <div className="h-md">Casas de repuestos</div>
              <div className="text-sm muted mt-4">Reciben pedidos en vivo y cotizan en segundos. Más ventas, menos teléfono.</div>
            </div>
            <div className="card hoverable">
              <div className="store-avatar mb-12" style={{ background: 'rgba(34,197,94,0.16)', color: '#4ADE80' }}><i className="fa-solid fa-truck-fast"></i></div>
              <div className="h-md">Repartidores</div>
              <div className="text-sm muted mt-4">Retiran de uno o varios puntos y entregan en el taller. Todo trazado.</div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="sect">
          <div className="card glow text-center" style={{ padding: '40px 24px' }}>
            <h2 className="h-xl mb-8">Probá el producto</h2>
            <p className="subtle mb-24" style={{ maxWidth: 480, margin: '0 auto' }}>Recorré el flujo completo con cualquiera de los roles. Datos simulados, sin compromiso.</p>
            <Link href="/demo/" prefetch={false} className="btn btn-yellow btn-lg"><i className="fa-solid fa-play"></i> Ver la demo</Link>
          </div>
        </section>
      </main>

      <footer className="land-footer">
        <div className="land-wrap flex-between flex-wrap gap-12">
          <div>RepuestosAlToque · Bariloche · v0.2</div>
          <Link href="/terminos" className="text-purple" style={{ fontWeight: 600 }}>Términos y Condiciones</Link>
        </div>
      </footer>
    </>
  );
}
