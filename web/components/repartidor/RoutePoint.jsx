import { mapsDirUrl } from '@/lib/maps';

// Un punto de la ruta del viaje (retiro en comercio o entrega al taller), con su línea conectora,
// ítems y botón "Cómo llegar". Compartido entre la vista Activas y el detalle del historial.
export default function RoutePoint({ pk, idx = 0, total = 1, drop, done, last, noMaps }) {
  const cls = done ? 'done' : drop ? 'drop' : 'pick';
  const icon = drop ? 'fa-screwdriver-wrench' : done ? 'fa-check' : 'fa-store';
  const title = drop ? 'Entrega al taller' : `Retiro${total > 1 ? ' ' + (idx + 1) : ''}`;
  return (
    <div className="route-pt">
      <div className="route-ic">
        <span className={`dot ${cls}`}><i className={`fa-solid ${icon}`}></i></span>
        {!last && <span className="route-line"></span>}
      </div>
      <div className="route-body">
        <div className="route-ttl">{title}</div>
        <div className="route-name">
          {pk?.name || '—'}
          {done && <span className="pick-done"><i className="fa-solid fa-check"></i> Retirado</span>}
          {!noMaps && pk && <a className="maps-btn" href={mapsDirUrl(pk)} target="_blank" rel="noopener" style={{ marginLeft: 'auto' }}><i className="fa-solid fa-location-arrow"></i> Cómo llegar</a>}
        </div>
        {pk?.address && <div className="route-addr">{pk.address}{pk.barrio ? ' · ' + pk.barrio : ''}</div>}
        {pk?.items?.length > 0 && (
          <div className="route-items">
            {pk.items.map((it) => (
              <div className="it" key={it.orderId}><i className="fa-solid fa-circle"></i> {it.label} {it.code && <span className="code">#{it.code}</span>}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
