# Handoff: Avisos por WhatsApp

## Overview
Feature de notificaciones por WhatsApp para **RepuestosAlToque** (marketplace de repuestos: mecánicos piden cotizaciones, comercios cotizan, un admin supervisa). Un bot avisa cuando pasan cosas (nueva solicitud, nueva cotización, pago acreditado, comercio vinculó MP). Dos vistas:

1. **Comercio Avisos WhatsApp** (móvil, sección del perfil del comercio): el usuario configura y verifica su número para recibir avisos de su rubro. Patrón REUTILIZABLE — la misma sección va en el perfil del mecánico (que recibe avisos de cotizaciones y pagos en vez de solicitudes).
2. **Admin Avisos WhatsApp** (desktop, panel admin): números de guardia, salud del canal, kill switch global, control total de mensajes enviados/respuestas/plantillas.

## About the Design Files
Los archivos de este bundle son **referencias de diseño hechas en HTML** — prototipos que muestran look y comportamiento esperado, NO código de producción para copiar tal cual. La tarea es **recrear estos diseños en el entorno existente del codebase destino** (repo real: `Sistemik-ar/repuestos-al-toque`) usando sus patrones y librerías establecidos. Si esta parte no tiene entorno definido, elegí el framework más apropiado para el proyecto e implementá ahí.

## Fidelity
**High-fidelity (hifi).** Colores, tipografía, espaciado, copy e interacciones son finales. Recrear pixel-perfect con el design system del proyecto (los tokens ya existen en el codebase — la referencia acá es `design_system_reference.css`, portada de `web/app/globals.css`).

## Files
- `Comercio Avisos WhatsApp.html` + `avisos-wa-comercio.js` — vista móvil, 4 estados + lógica del flujo
- `Admin Avisos WhatsApp.html` + `avisos-wa-admin.js` (tab Guardia) + `avisos-wa-mensajes.js` (tab Mensajes, kill switch, setup) — vista desktop
- `design_system_reference.css` — hoja compartida del DS (`.card`, `.btn`, `.badge`, `.switch`, `.modal`, `.empty-state`, variables)
- `app_reference.js` — helper `RAT.toast({title, sub, icon, type})` usado para feedback

Nota: en los HTML el CSS/JS compartido se referencia como `demo/assets/styles.css` y `demo/assets/app.js`; en este bundle son `design_system_reference.css` y `app_reference.js`. Para abrir los prototipos localmente, ajustar esas dos rutas.

## Design Tokens (los principales usados)
- Acento púrpura `--purple: #6D28D9`, `--purple-light` (links, chips activos)
- Éxito verde `--green` / texto verde `#4ADE80`; advertencia `--yellow`; error `#FCA5A5` sobre `rgba(239,68,68,…)`
- WhatsApp: `--wa: #25D366`, `--wa-dark: #128C7E`; azul "leído" WhatsApp `#53BDEB`; burbuja `#1F2C34` sobre fondo `#0B141A`
- Fuente Inter (400–900); números con `font-variant-numeric: tabular-nums`; FontAwesome 6.5.1
- Radios: cards 16–18px, inputs 12px, chips 999px. Fondos dark: `--bg-2`/`--bg-3` + `--border`

---

## Vista 1: Comercio Avisos WhatsApp (móvil)

4 estados (en el prototipo hay un segmented control de demo arriba para saltar entre ellos — NO implementarlo; en producción el estado sale del backend):

### 1. SIN CONFIGURAR (`#st-setup`)
- Card con hero: ícono WhatsApp (46px, fondo verde 15%), título "Enterate al instante cuando un mecánico pide un repuesto de tu rubro" + subtítulo.
- 3 beneficios con íconos (bolt / filter / hand): aviso al segundo, solo sus rubros, se desactiva cuando quiera.
- Campo de teléfono: prefijo FIJO "🇦🇷 +54 9" (no editable) + input numérico. Formateo en vivo `294 412 3456` (3-3-4).
- **Validación argentina**: 10 dígitos exactos, rechaza si empieza con `0` (código de área sin 0) o `15`. Hint dinámico: info (gris) → "Te faltan N dígitos" → error (rojo, borde rojo) → "Formato correcto" (verde). Botón deshabilitado hasta ser válido.
- CTA verde WhatsApp: "Verificar mi número".

### 2. PENDIENTE DE VERIFICACIÓN (`#st-verify`)
- Ícono escudo, "Revisá tu WhatsApp", pill verde "Enviado a +54 9 294 415 2823".
- 6 inputs de 1 dígito (46×56px, monospace 24px): auto-avance, backspace retrocede, paste distribuye los 6 dígitos.
- Código completo → verifica (en demo, `000000` simula error "Código incorrecto").
- Links: "Reenviar código" (con countdown de 30s deshabilitado) y "Cambiar número" (vuelve al estado 1).

### 3. VERIFICADO Y ACTIVO (`#st-active`)
- Card: ícono WA + número enmascarado `+54 9 294 •••• 823` (primeros 3 + últimos 3 dígitos visibles) + "Verificado el 12 jul 2026" + chip verde "Verificado".
- Toggle "Recibir avisos" (subtítulo: "Nuevas solicitudes de Frenos, Suspensión y Motor" — rubros del comercio). OFF → nota amarilla "Avisos pausados…" y preview al 55% opacidad.
- Card preview: burbuja estilo WhatsApp (fondo `#0B141A`, burbuja `#1F2C34`, remitente verde "RepuestosAlToque", doble check azul) con el mensaje real:
  > 🔧 **Nueva solicitud:** Amortiguadores · Ford Fiesta 2017 · Bariloche.
  > Entrá a cotizar → rat.ar/c/8F2K
  > Respondé BAJA para dejar de recibir avisos.
- Botón ghost "Enviarme un aviso de prueba" (spinner ~1.4s → toast éxito).
- Card "Cambiar número" → vuelve al estado 1 y exige re-verificación.
- Nota de consentimiento (candado): solo usamos el número para avisos; se desactiva desde acá o respondiendo BAJA.

### 4. DADO DE BAJA (`#st-baja`)
- Ícono campana tachada amarillo, título "Desactivaste los avisos respondiendo BAJA", copy con fecha y número enmascarado.
- Nota amarilla: el número sigue verificado, reactivar es instantáneo.
- CTA verde "Reactivar avisos" → vuelve al estado 3 con toggle ON + toast.

**Reutilización mecánico**: mismos 4 estados; cambian copy del hero/toggle (avisos de cotizaciones y pagos) y la preview del mensaje.

## Vista 2: Admin Avisos WhatsApp (desktop, max-width 1180px)

Header: título con ícono WA + botones "Pausar todos los avisos" (ghost rojo) y "Agregar número" (primary). Dos tabs: **Guardia y canal** / **Mensajes** (con contador rojo de fallidos).

### Kill switch global
Confirmación antes de pausar → banner rojo persistente "Todos los avisos están pausados" (nadie recibe mensajes; los eventos se siguen registrando) con botón "Reanudar avisos". Mientras está pausado, se oculta el botón de pausar.

### Estado CANAL SIN CONFIGURAR
Panel checklist (reemplaza KPIs + contenido cuando el canal no está listo), badge "1 de 3 listo":
1. ✅ Conectar número de WhatsApp Business (Listo · +54 9 294 400 1100)
2. ⏳ Verificación del negocio en Meta (En revisión · enviada 11 jul)
3. ○ Plantillas enviadas a aprobación (4 borradores · sin enviar)
(En el prototipo se alterna con botones de demo.)

### Tab "Guardia y canal"
- **KPI strip** (4, patrón cov-strip): Canal WhatsApp (dot verde pulsante "API conectada", Meta Cloud API, último ping) / Avisos enviados hoy: 142, 96% < 10s / Fallidos hoy: 3 (rojo), 2 reintentados / Comercios con WhatsApp: 31/47, 16 sin configurar + link "recordarles".
- **Números de guardia** (reciben TODOS los avisos, sin importar rubro). Por fila: avatar escudo, nombre + chip Verificado (verde) / Pendiente (amarillo), número, "Último aviso" (fecha + evento), toggle activo (deshabilitado si pendiente), editar, eliminar (confirm). Debajo, chips de eventos toggleables: Nueva solicitud / Nueva cotización / Pago acreditado / Comercio vinculó MP (mínimo 1 seleccionado). Pendientes muestran strip amarillo inline: "Código enviado a +54 9 …" + input de 6 dígitos + Reenviar; código completo → verificado y activo.
- Mock: Jorge (verificado, 4 eventos, hace 4 min), Guardia finde (verificado, solicitud+pago, ayer 19:32), Marto (soporte) (pendiente, inactivo).
- **Modal Agregar/Editar**: etiqueta ("Jorge", "Guardia finde"), número con prefijo +54 9, picker de eventos. Alta → queda pendiente hasta verificar código. Editar con cambio de número → vuelve a pendiente.
- **Estado vacío** (sin números): ícono WA, "Sin números de guardia", copy + CTA "Agregar número".

### Tab "Mensajes" — 3 sub-vistas (pills): Historial / Respuestas / Plantillas
**Alertas arriba** (persistentes): amarilla si Meta pausó una plantilla ("afecta la calidad del número", botón Ver plantilla); roja si un destinatario nos bloqueó ("Sur Repuestos nos bloqueó en WhatsApp").

**Historial** — tabla: fecha/hora · destinatario (nombre + número + chip de rol: Comercio celeste / Admin púrpura / Mecánico amarillo) · evento con link al pedido (#S-3391, #Q-2214…) · texto enviado · estado.
- Timeline de estado: Enviado ✓ → Entregado ✓✓ → Leído ✓✓ azul (`#53BDEB`), con barras conectoras que se pintan según progreso. FALLIDO: badge rojo + motivo (Número inválido / El número no tiene WhatsApp / El destinatario nos bloqueó) + botón "Reintentar" (bloqueado NO permite reintento — toast explicativo).
- Filtros: estado (con "Fallidos primero" que reordena), destinatario, evento, fecha (Hoy/Ayer) + "Limpiar filtros". Estado vacío "Nada con esos filtros".
- Fila clickeable → detalle expandible: "El mismo aviso también se envió a…" con rol, nombre, número y estado individual de cada destinatario del mismo evento (un evento notifica a varios números).

**Respuestas recibidas** — tabla: fecha/hora, remitente (nombre + número), texto respondido ("BAJA", "gracias!", preguntas) y acción del sistema: badge amarillo "BAJA procesada — no recibe más avisos" o gris "Auto-respuesta enviada".

**Plantillas** — grid 2 columnas: nombre, badge de estado en Meta (Aprobada verde / Pendiente amarillo / Pausada por Meta rojo, con borde amarillo en la card y link "Revisar en Business Manager →"), cuerpo estilo burbuja con placeholders `{{repuesto}}`, `{{monto}}`…, y contador de envíos. 6 plantillas mock: Nueva solicitud (1.240), Nueva cotización (862), Pago acreditado (415), Comercio vinculó MP (pausada, 37), Código de verificación (198), Aviso de prueba (pendiente, 0).

## Interactions & State
- Feedback de TODA acción vía toast (`RAT.toast`) — mapear al sistema de toasts del codebase.
- Estados por vista: comercio `setup|verify|active|baja` + `notificationsEnabled`; admin: lista de guardias `{name, num, status, active, events[], last}`, mensajes `{dest, num, role, ev, ref, txt, st: sent|delivered|read|fail, reason, group}`, respuestas, plantillas, `globalPaused`, `channelConfigured`.
- Datos a fetchear: KPIs del canal, guardias, log de mensajes (paginado), respuestas, plantillas + estado en Meta.
- Los datos mock (rioplatenses: Bariloche, El Bolsón, Dina Huapi; Ford Fiesta, VW Gol Trend, Renault Kangoo) están en los `.js` — usarlos como fixtures/seeds.

## Assets
Sin imágenes. Íconos: FontAwesome 6.5.1 (`fa-brands fa-whatsapp` y sólidos varios) — mapear a la librería de íconos del codebase. Fuente: Inter (Google Fonts).
