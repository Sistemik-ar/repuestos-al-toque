# RepuestosAlToque — Prototipo navegable

Prototipo de alta fidelidad (mockup clickeable) de **RepuestosAlToque**, marketplace de repuestos urgentes para Bariloche que conecta **mecánicos**, **casas de repuestos** y **repartidores**.

> ⚠️ Esto es un prototipo de **frontend solamente**: sin backend, base de datos, auth ni pagos reales. Todos los datos son simulados. El objetivo es mostrar el producto, los flujos y la propuesta de valor.

## Stack
- HTML + CSS + JavaScript vanilla (sin framework, sin build).
- TailwindCDN no es necesario: estilos propios en `assets/styles.css`.
- FontAwesome vía CDN para los íconos.

## Estructura
```
index.html               → Landing + selector de rol
mechanic-dashboard.html  → Panel del mecánico (reputación, pedidos, envíos)
request-flow.html        → Wizard de pedido en 5 pasos
quotes.html              → Cotizaciones en vivo (countdown + anonimato + promos)
payment.html             → Pago estilo MercadoPago + revelado del vendedor + WhatsApp
store-dashboard.html     → Panel de la casa de repuestos (leads en vivo + cotizar)
store-request-detail.html→ Detalle de un lead entrante
delivery-dashboard.html  → Panel del repartidor (mapa + timeline de estados)
admin-dashboard.html     → Métricas, reputación, reset de contraseñas
assets/styles.css        → Design system (dark, púrpura/amarillo)
assets/app.js            → Datos mock, toasts, timers, reputación, simulación en vivo
```

## Probar localmente
Es estático, así que alcanza con abrir `index.html`. Para evitar restricciones del navegador conviene servirlo:

```bash
# con Python
python3 -m http.server 5173
# luego abrir http://localhost:5173
```

## Deploy en Vercel
El proyecto es 100% estático y ya incluye `vercel.json`.

**Opción A — desde la web (recomendado):**
1. Entrá a https://vercel.com → **Add New → Project**.
2. Importá el repo `Sistemik-ar/repuestos-al-toque`.
3. Framework Preset: **Other** (no requiere build). Build Command y Output: dejar vacío.
4. **Deploy**. Vercel te da una URL pública (ej: `https://repuestos-al-toque.vercel.app`).

**Opción B — desde la CLI:**
```bash
npm i -g vercel
vercel        # primer deploy (preview)
vercel --prod # deploy a producción
```

## Probar desde el celular
Una vez deployado, abrí la URL de Vercel desde el navegador del teléfono. La app es **mobile-first**: bottom-nav, botones grandes, y la simulación en vivo (cotizaciones que llegan, timers, toasts) funciona igual que en desktop.

> Tip para la demo: entrá como **Mecánico → Solicitar Repuesto**, completá el flujo y mirá llegar las cotizaciones; elegí una y pagá para ver el desbloqueo del vendedor. En otra pestaña entrá como **Comercio** para ver los leads en tiempo real.
