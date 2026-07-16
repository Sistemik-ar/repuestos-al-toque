# Avisos por WhatsApp — setup en Meta (Cloud API)

El bot avisa por WhatsApp cuando pasan cosas: **nueva solicitud** (a comercios del rubro),
**nueva cotización** (al mecánico), **pago acreditado** (al comercio vendedor) y **comercio
vinculó MP** (a la guardia). Los números de guardia del admin reciben todo, sin filtro de rubro.

Sin credenciales configuradas, la feature queda **apagada y segura**: la sección del perfil no se
muestra, el admin ve el checklist de "canal sin configurar" y no se intenta ningún envío.

## Variables de entorno

| Variable | Qué es | Obligatoria |
| --- | --- | --- |
| `WHATSAPP_TOKEN` | Token permanente (System User) de la app de Meta | Sí |
| `WHATSAPP_PHONE_ID` | *Phone Number ID* del número del bot | Sí |
| `WHATSAPP_VERIFY_TOKEN` | String propio (inventalo) para el handshake del webhook | Sí |
| `WHATSAPP_APP_SECRET` | *App secret* de la app: valida la firma de los webhooks | Recomendada |
| `WHATSAPP_WABA_ID` | Id de la *WhatsApp Business Account*: estado real de plantillas en el admin | Opcional |
| `WA_TEST_MODE` | `1` = no llama a Meta; marca todo como enviado (staging/local) | Solo staging |

En **staging** setear solo `WA_TEST_MODE=1` (la UI y los E2E funcionan sin tocar Meta).
En **producción** NO setear `WA_TEST_MODE`.

## Pasos en Meta (una sola vez)

1. **Crear la app** en <https://developers.facebook.com> → *My Apps* → *Create App* → tipo
   **Business**. Agregarle el producto **WhatsApp**.
2. **Número del bot**: en *WhatsApp → API Setup* Meta regala un número de prueba (sirve para
   probar YA con hasta 5 destinatarios pre-registrados). Para el número real: *Add phone number*,
   cargar un número que NO esté usado en WhatsApp común (comprar un chip nuevo sirve). Anotar el
   **Phone Number ID** → `WHATSAPP_PHONE_ID`, y el **WhatsApp Business Account ID** → `WHATSAPP_WABA_ID`.
3. **Token permanente**: en <https://business.facebook.com> → *Configuración del negocio* →
   *Usuarios → Usuarios del sistema* → crear un **System User** (rol admin), *Add Assets* → la app,
   y *Generate New Token* con permisos `whatsapp_business_messaging` + `whatsapp_business_management`
   → `WHATSAPP_TOKEN`. (El token de *API Setup* vence en 24 hs: solo para probar.)
4. **Verificación del negocio** (*Business verification*): en *Configuración del negocio* →
   *Centro de seguridad* → *Iniciar verificación*. Piden CUIT/razón social y un comprobante
   (constancia de AFIP, factura de servicio a nombre del negocio). **Demora típica: 1 a 5 días
   hábiles** (a veces horas). Sin esto el número queda limitado a 250 destinatarios únicos/día
   — igual alcanza para arrancar; verificado sube a 1.000 y escala solo con buen uso.
5. **Webhook**: en la app → *WhatsApp → Configuration* → *Webhook*:
   - Callback URL: `https://repuestosaltoque.com.ar/api/wa/webhook`
   - Verify token: el mismo string que pusiste en `WHATSAPP_VERIFY_TOKEN`
   - Suscribirse a los campos **messages** (trae mensajes entrantes Y los estados de entrega).
6. **Plantillas**: en el Business Manager → *WhatsApp Manager → Plantillas de mensajes*, crear
   estas 6 (idioma **es_AR**, categoría **Utility**, salvo la de código que va como
   **Authentication**). Los nombres deben coincidir EXACTO (los usa `lib/whatsapp.js`):

   | Nombre | Cuerpo (los `{{n}}` en este orden) |
   | --- | --- |
   | `rat_nueva_solicitud` | `🔧 Nueva solicitud: {{1}} · {{2}} · {{3}}. Entrá a cotizar → {{4}} Respondé BAJA para dejar de recibir avisos.` |
   | `rat_nueva_cotizacion` | `💬 Nueva cotización: {{1}} cotizó {{2}} tu pedido de {{3}}. Miralo → {{4}}` |
   | `rat_pago_acreditado` | `💰 Pago acreditado: {{1}} · {{2}} · {{3}}. Coordiná la entrega → {{4}}` |
   | `rat_mp_vinculado` | `🔗 {{1}} vinculó Mercado Pago. Ya puede recibir pagos.` |
   | `rat_codigo_verificacion` | `Tu código de RepuestosAlToque es {{1}}. Vence en 10 minutos.` (Authentication) |
   | `rat_aviso_prueba` | `✅ Esto es un aviso de prueba de RepuestosAlToque. Si lo recibiste, ¡quedó todo configurado!` |

   La aprobación de plantillas Utility suele tardar **minutos u horas**. El estado se ve en el
   admin (*Avisos WhatsApp → Mensajes → Plantillas*) si está seteado `WHATSAPP_WABA_ID`.
7. **Deploy**: cargar las env vars en Vercel (producción), correr `prisma db push` contra la DB
   de prod (tablas nuevas: `wa_contacts`, `wa_guards`, `wa_messages`, `wa_replies`) y re-ejecutar
   `db/rls.sql` en Supabase (las tablas nuevas nacen sin RLS).

## Qué se puede hacer mientras esperás la verificación

- Todo el circuito se prueba **hoy** con el número de prueba de Meta (paso 2): registrás hasta
  5 números destino y probás verificación, avisos y webhook de punta a punta.
- La verificación del negocio corre en paralelo: arrancala ya (paso 4), es el único paso con
  demora real de días.
- En staging, `WA_TEST_MODE=1` deja usar toda la UI sin credenciales.

## Reglas que cuidan la calidad del número (para no comer un bloqueo de Meta)

- **Opt-in real**: nadie recibe avisos sin verificar su número con el código.
- **Opt-out fácil**: responder `BAJA` da de baja al instante (lo procesa el webhook); cada aviso
  de solicitud lo dice en el texto.
- **Relevancia**: los comercios solo reciben solicitudes de sus rubros.
- Si Meta pausa una plantilla o alguien nos bloquea, el admin lo ve como alerta en
  *Avisos WhatsApp → Mensajes*.
