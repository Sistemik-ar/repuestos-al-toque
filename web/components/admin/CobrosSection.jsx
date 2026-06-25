// Admin · Cobros: estado de conexión a Mercado Pago de cada comercio (split de pagos).
// Read-only: cada comercio conecta su propia cuenta desde su panel; el admin solo ve quién ya está.
export default function CobrosSection({ stores }) {
  const list = (stores || []).slice().sort((a, b) => (b.mpLinked === a.mpLinked ? a.name.localeCompare(b.name) : b.mpLinked - a.mpLinked));
  const connected = list.filter((s) => s.mpLinked).length;
  const pending = list.length - connected;

  return (
    <>
      <p className="cm-intro">Quién conecta su Mercado Pago para cobrar con <b>split</b> (la venta entra directo a su cuenta y la plataforma retiene la comisión) y quién todavía no. Cada comercio conecta su propia cuenta desde su panel — no se puede hacer por ellos.</p>

      <div className="cov-strip" style={{ gridTemplateColumns: 'repeat(2, 1fr)', maxWidth: 520 }}>
        <div className="cov-card ok"><div className="cv-label"><i className="fa-solid fa-plug-circle-check"></i> Conectados</div><div className="cv-value">{connected}</div><div className="cv-sub">cobran con split</div></div>
        <div className={`cov-card ${pending ? 'alert' : 'ok'}`}><div className="cv-label"><i className="fa-solid fa-hourglass-half"></i> Sin conectar</div><div className="cv-value">{pending}</div><div className="cv-sub">cobran de forma centralizada</div></div>
      </div>

      {list.length === 0 ? (
        <div className="empty-state" style={{ padding: 28 }}><div className="empty-icon"><i className="fa-solid fa-store-slash"></i></div>No hay comercios.</div>
      ) : (
        <div className="card" style={{ paddingTop: 4 }}>
          {list.map((s) => (
            <div className="flex-between" style={{ padding: '12px 0', borderTop: '1px solid var(--border)', gap: 12 }} key={s.id}>
              <div className="flex-center gap-12" style={{ minWidth: 0 }}>
                <div className="store-avatar" style={{ flexShrink: 0 }}><i className="fa-solid fa-store"></i></div>
                <div className="text-sm" style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
              </div>
              {s.mpLinked
                ? <span className="mp-chip" style={{ flexShrink: 0 }}><span className="dot"></span> Conectado</span>
                : <span className="badge badge-gray" style={{ flexShrink: 0 }}><i className="fa-solid fa-circle-xmark"></i> Sin conectar</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
