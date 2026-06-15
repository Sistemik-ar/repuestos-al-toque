// Indicador visual de entorno NO-producción (staging).
// Se muestra solo si está seteada NEXT_PUBLIC_ENV_LABEL o, por comodidad, NEXT_PUBLIC_UPLOAD_PREFIX
// (que en staging ya vale "staging"). En prod ninguna está seteada -> no renderiza nada.
export default function EnvBadge() {
  const label = process.env.NEXT_PUBLIC_ENV_LABEL || process.env.NEXT_PUBLIC_UPLOAD_PREFIX;
  if (!label) return null;
  const text = String(label).toUpperCase();
  return (
    <>
      {/* franja fina arriba: color ambiente, no interfiere con clicks */}
      <div
        aria-hidden
        style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 4, background: '#f59e0b', zIndex: 2147483646, pointerEvents: 'none' }}
      />
      {/* pill fijo abajo a la izquierda */}
      <div
        style={{
          position: 'fixed', bottom: 10, left: 10, zIndex: 2147483647, pointerEvents: 'none',
          background: '#f59e0b', color: '#1a1a1a', fontWeight: 800, fontSize: 11, letterSpacing: 1,
          padding: '4px 10px', borderRadius: 999, boxShadow: '0 2px 8px rgba(0,0,0,.4)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        {text}
      </div>
    </>
  );
}
