// Estado de carga: se muestra MIENTRAS llega el primer fetch, para que el empty state
// ("no hay nada") no parpadee antes de que existan los datos.
export default function Loading({ label = 'Cargando…' }) {
  return (
    <div className="empty-state" role="status" aria-live="polite" aria-busy="true">
      <span className="spinner" style={{ width: 26, height: 26, borderWidth: 3, margin: '0 auto 12px' }}></span>
      <div className="text-sm muted">{label}</div>
    </div>
  );
}
