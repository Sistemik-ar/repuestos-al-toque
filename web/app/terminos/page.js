import Link from 'next/link';

export const metadata = { title: 'Términos y Condiciones — RepuestosAlToque' };

const clauses = [
  ['1. Qué es RepuestosAlToque',
    'RepuestosAlToque es una plataforma que conecta mecánicos/talleres con casas de repuestos y con un servicio de envíos. Actúa como intermediario: no vende repuestos ni es parte de la operación de compraventa entre el mecánico y el vendedor.'],
  ['2. Usuarios y registro',
    'Hay cuatro roles: administrador, mecánico, vendedor (casa de repuestos) y repartidor/empresa de envíos. El alta inicial la realizan los administradores. Cada usuario es responsable de la veracidad de sus datos y de la confidencialidad de su contraseña.'],
  ['3. Funcionamiento del pedido y la cotización',
    'El mecánico publica un pedido (un producto por pedido). Las casas de repuestos envían cotizaciones durante una ventana de tiempo; al cerrarse, el mecánico ve las ofertas y elige una. Las cotizaciones son ofertas a firme mientras dure su validez.'],
  ['4. Anonimato del marketplace',
    'Hasta que se concreta la compra, el mecánico ve a los vendedores con un alias y el vendedor ve solo la zona del mecánico. Está prohibido usar la plataforma para contactar a la otra parte y concretar la operación por fuera, evitando la comisión.'],
  ['5. Precios, comisión e impuestos',
    'La comisión de la plataforma es del 5% sobre el precio del repuesto y la abona el cliente (se suma al total). Cada parte emite su propio comprobante: el vendedor factura el repuesto al cliente y la plataforma factura su comisión. El mecánico indica al crear el pedido si requiere Consumidor Final o Factura A.'],
  ['6. Pagos',
    'Los pagos se procesan a través de Mercado Pago, que distribuye automáticamente el importe entre el vendedor y la plataforma. La plataforma no almacena datos de tarjetas. Los reembolsos, cuando correspondan, se gestionan según las políticas de Mercado Pago y de esta plataforma.'],
  ['7. Envío',
    'El envío lo realiza una empresa de logística tercerizada. Los tiempos son estimados y no garantizados. El costo del flete se informa y se abona según la tarifa vigente. Varios pedidos pueden consolidarse en un mismo envío.'],
  ['8. Calidad, garantía y devoluciones',
    'La calidad, autenticidad y garantía del repuesto son responsabilidad exclusiva del vendedor, con la misma política que aplica en su comercio. Los repuestos eléctricos/electrónicos se venden probados y sin garantía. Los reclamos por pieza fallada o equivocada se realizan presencialmente con el repuesto y el comprobante.'],
  ['9. Obligaciones del vendedor',
    'Ofrecer solo productos en stock, con datos fiscales válidos, vincular su cuenta de Mercado Pago, cumplir el precio y la entrega cotizados, y responder por la calidad de lo vendido.'],
  ['10. Obligaciones del mecánico',
    'Brindar información veraz del pedido, abonar lo seleccionado y retirar/recibir el repuesto. El uso indebido (pedidos falsos, intentos de evadir la comisión) puede derivar en suspensión.'],
  ['11. Reputación y sanciones',
    'Mecánicos y vendedores se califican mutuamente. Las malas calificaciones reiteradas o el incumplimiento pueden derivar en aviso, suspensión o baja de la cuenta.'],
  ['12. Publicidad',
    'Los vendedores pueden contratar espacios publicitarios (marca y promoción). Los avisos son identificados como tales.'],
  ['13. Datos personales',
    'Los datos se tratan conforme a la Ley 25.326 de Protección de Datos Personales (Argentina), únicamente para operar el servicio. El usuario puede solicitar acceso, rectificación o supresión de sus datos.'],
  ['14. Limitación de responsabilidad',
    'La plataforma no garantiza la disponibilidad de ofertas para cada pedido ni resultados comerciales, y no es responsable por la relación comercial entre las partes, salvo lo expresamente asumido aquí.'],
  ['15. Modificaciones',
    'La plataforma puede actualizar estos términos. Los cambios se comunican y el uso continuado implica su aceptación.'],
  ['16. Ley aplicable y jurisdicción',
    'Estos términos se rigen por las leyes de la República Argentina. Ante cualquier conflicto, las partes se someten a los tribunales de San Carlos de Bariloche, Provincia de Río Negro.'],
];

export default function Terminos() {
  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/" className="brand">
          <span className="logo-mark"><i className="fa-solid fa-gear"></i></span>
          <span>RepuestosAlToque</span>
        </Link>
        <Link href="/" className="icon-btn"><i className="fa-solid fa-xmark"></i></Link>
      </div>

      <div className="container">
        <div className="mb-16">
          <div className="eyebrow">Legal</div>
          <h1 className="h-lg">Términos y Condiciones</h1>
          <p className="text-sm muted">Última actualización: 2026 · Bariloche, Argentina</p>
        </div>

        <div className="float-notif mb-16">
          <i className="fa-solid fa-circle-info text-purple"></i>
          <div className="text-sm subtle"><b>Borrador.</b> Texto propuesto para revisar y validar con un asesor legal antes de publicarlo.</div>
        </div>

        {clauses.map(([title, body]) => (
          <div className="card mb-12" key={title}>
            <div className="text-sm" style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
            <div className="text-sm subtle" style={{ lineHeight: 1.5 }}>{body}</div>
          </div>
        ))}

        <p className="text-center text-xs muted mt-16 mb-24">Al usar RepuestosAlToque aceptás estos términos.</p>
      </div>
    </div>
  );
}
