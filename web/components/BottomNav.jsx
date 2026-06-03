'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomNav() {
  const path = usePathname();
  const is = (p) => (path === p ? 'active' : '');
  return (
    <nav className="bottom-nav">
      <Link href="/mecanico" className={is('/mecanico')}>
        <i className="fa-solid fa-house"></i>Inicio
      </Link>
      <Link href="/mecanico/cotizaciones" className={is('/mecanico/cotizaciones')}>
        <i className="fa-solid fa-tags"></i>Cotizaciones
      </Link>
      <Link href="/mecanico/pedido" className="fab">
        <i className="fa-solid fa-plus"></i>
      </Link>
      <Link href="/mecanico" className="">
        <i className="fa-solid fa-map-location-dot"></i>Envíos
      </Link>
      <Link href="/" className="">
        <i className="fa-solid fa-user"></i>Perfil
      </Link>
    </nav>
  );
}
