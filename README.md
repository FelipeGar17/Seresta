# Seresta — asistente de citas por WhatsApp

Seresta es una aplicación TypeScript que gestiona conversaciones de citas,
consulta disponibilidad y sincroniza reservas con Google Calendar.

## Productos y estado

- **Seresta Local (implementado):** runtime en el computador del negocio,
  WhatsApp Web mediante `whatsapp-web.js` y `LocalAuth`, configuración local y
  persistencia SQLite. Debe conservar su comportamiento.
- **Seresta Intermediario (en planificación):** un número central de WhatsApp Business para atender clientes de distintos locales, con resolución de negocio y calendarios por trabajador. El plan de fases y decisiones está en
  [PLAN_TRABAJO_SERESTA_INTERMEDIARIO.md](./PLAN_TRABAJO_SERESTA_INTERMEDIARIO.md).
  Meta proporcionó recursos de prueba; el adaptador de Business API/webhook y
  el portal alojado aún no están implementados en este repositorio.
- **Seresta con el número de cada negocio:** posibilidad futura, fuera del
  alcance actual.

No usar `package.json`, una variable global ni el `businessId` para escoger
silenciosamente entre productos. Local e Intermediario necesitan composiciones
separadas; no deben compartir por accidente credenciales, sesiones, datos o
configuración de negocio.

## Mapa del proyecto

### Punto de entrada y conectores

- [`src/index.ts`](./src/index.ts): composición del runtime Local; carga
  configuración, inicia Google Calendar/SQLite/WhatsApp Web, recupera mensajes pendientes y hace mantenimiento.
- [`src/config/`](./src/config/): carga y valida la configuración local del
  negocio.
- [`src/connectors/whatsapp/whatsapp-connector.ts`](./src/connectors/whatsapp/whatsapp-connector.ts):
  contrato neutral del conector de mensajería.
- [`src/connectors/whatsapp/whatsapp-web-connector.ts`](./src/connectors/whatsapp/whatsapp-web-connector.ts):
  adaptador Local de `whatsapp-web.js`, `LocalAuth`, QR y ciclo de vida.
- [`src/connectors/google-calendar/`](./src/connectors/google-calendar/):
  OAuth local y adaptador de Google Calendar.

### Núcleo conversacional y reservas

- [`src/core/conversation/coordinator.ts`](./src/core/conversation/coordinator.ts):
  carga la conversación, analiza el mensaje, decide qué flujo atender y
  persiste el turno.
- [`src/core/conversation/booking-flow.ts`](./src/core/conversation/booking-flow.ts):
  borrador, captura de datos y confirmación de reserva.
- [`src/core/conversation/availability-inquiry-flow.ts`](./src/core/conversation/availability-inquiry-flow.ts):
  consulta de disponibilidad independiente, sin crear una reserva.
- [`src/core/conversation/cancellation-flow.ts`](./src/core/conversation/cancellation-flow.ts):
  selección y cancelación de citas confirmadas.
- [`src/core/conversation/catalog-reply.ts`](./src/core/conversation/catalog-reply.ts),
  [`entry-replies.ts`](./src/core/conversation/entry-replies.ts),
  [`courtesy-flow.ts`](./src/core/conversation/courtesy-flow.ts) y
  [`post-confirmation-flow.ts`](./src/core/conversation/post-confirmation-flow.ts):
  catálogo, bienvenida/entrada, cortesía y respuesta posterior a confirmar.
- [`src/core/conversation/turn-utils.ts`](./src/core/conversation/turn-utils.ts):
  contexto conversacional y respuestas cortas.
- [`src/core/booking/`](./src/core/booking/): ingreso de la solicitud,
  resolución de servicio, validación de horarios, reglas de disponibilidad y
  agenda.
- [`src/core/reservations/`](./src/core/reservations/): contratos y
  repositorios de reservas; [`src/core/storage/`](./src/core/storage/):
  persistencia SQLite local.
- [`src/core/time/business-time.ts`](./src/core/time/business-time.ts): fuente
  de verdad para fecha calendario, hora, zona horaria y combinación de fecha
  con hora.

### Ruta rápida para tareas de NLP/conversación

Para ampliar vocabulario o corregir una interpretación, seguir el flujo en
este orden en vez de leer todo el proyecto:

1. **Pipeline único:** [`src/core/nlp/message-analysis.ts`](./src/core/nlp/message-analysis.ts)
   corrige la escritura una vez y comparte el resultado entre detección de
   intención y extracción de entidades.
2. **Intenciones y vocabulario:** [`synonyms.ts`](./src/core/nlp/synonyms.ts)
   contiene expresiones generales por intención;
   [`intent-detector.ts`](./src/core/nlp/intent-detector.ts) las combina con
   marcos lingüísticos, contexto de respuesta corta y evidencia de detección;
   [`intent-frames.ts`](./src/core/nlp/intent-frames.ts) reconoce estructuras
   genéricas/catalogadas; [`intent-policy.ts`](./src/core/nlp/intent-policy.ts)
   decide si aceptar, aclarar u ofrecer opciones.
3. **Normalización y errores de escritura:**
   [`normalize.ts`](./src/core/nlp/normalize.ts) distingue normalización de
   intención y de extracción;
   [`spelling-corrector.ts`](./src/core/nlp/spelling-corrector.ts) contiene
   correcciones seguras antes del análisis.
4. **Datos reconocidos:** [`entity-extractor.ts`](./src/core/nlp/entity-extractor.ts)
   extrae nombre, fecha, hora y servicio mencionado;
   [`date-parser.ts`](./src/core/nlp/date-parser.ts) interpreta fechas en
   español y usa la zona horaria indicada;
   [`service-matcher.ts`](./src/core/nlp/service-matcher.ts) compara nombres y
   alias sin elegir arbitrariamente en ambigüedades.
5. **Catálogo y reserva:** [`service-catalog.ts`](./src/core/nlp/service-catalog.ts)
   obtiene el catálogo operativo de los servicios activos configurados;
   [`src/core/booking/reservation-intake.ts`](./src/core/booking/reservation-intake.ts)
   conecta el análisis con los datos de reserva, y
   [`src/core/booking/service-resolution.ts`](./src/core/booking/service-resolution.ts)
   resuelve coincidencias contra el negocio canónico.
6. **Enrutamiento y diálogo:** verificar
   [`src/core/conversation/coordinator.ts`](./src/core/conversation/coordinator.ts)
   y solo el flujo afectado (`booking-flow`, `availability-inquiry-flow`,
   `cancellation-flow`, `catalog-reply`, etc.). Las pruebas del coordinador
   comprueban interacciones entre intenciones y estado.

Pruebas NLP en [`tests/core/nlp/`](./tests/core/nlp/), incluyendo
`intent-detector.test.ts`, `entity-extractor.test.ts`,
`date-parser.test.ts`, `service-matcher.test.ts`,
`spelling-corrector.test.ts` y `audit-regressions.test.ts`. Pruebas del diálogo
en [`tests/core/conversation/`](./tests/core/conversation/).

## Restricciones para cambios

- **Proteger Seresta Local:** no reemplazar su composición, `whatsapp-web.js`,
  `LocalAuth`, QR, `negocio.json`, persistencia SQLite ni conexión local de
  Calendar para implementar Intermediario. Todo cambio a lógica compartida
  debe conservar el comportamiento Local y agregar regresiones.
- Mantener reglas de negocio y contratos en `src/core/`. No importar allí
  `whatsapp-web.js`, SDK de Meta, `googleapis`, `better-sqlite3`, Cloudflare,
  D1 ni detalles de infraestructura. Adaptadores y composición traducen los
  sistemas externos.
- Reutilizar reglas cuando sean realmente comunes. Mantener el alta del local,
  OAuth web por negocio, resolución de tenant y políticas del número central
  fuera de los flujos Local. Evitar ramas dispersas del tipo “si es producto
  X” dentro del núcleo.
- No renombrar todos los flujos con `Wppweb` ni marcar límites solo con
  comentarios: usar contratos, carpetas, composiciones y dependencias claras.
  Nombrar por proveedor solo módulos que dependan de ese proveedor.
- El catálogo de negocio es la fuente de verdad para los servicios. No
  hardcodear barberías, peluquerías o servicios en sinónimos genéricos ni
  seleccionar un servicio ambiguo por suposición.
- Al cambiar NLP, cubrir interpretaciones **positivas, negativas, ambiguas,
  errores de escritura y mensajes con varias intenciones**. Las negaciones
  explícitas deben impedir que se active la regla positiva correspondiente.
- Las respuestas “sí/no” aisladas dependen del estado y la pregunta esperada;
  no inferir confirmación solo por palabras del historial. Preservar el paso
  doble de confirmación de una reserva.
- `detection.score` cuenta evidencia de reglas; **no es una probabilidad**.
  No presentar porcentajes de confianza sin calibración con ejemplos medidos.
- No completar datos que no se reconocieron ni redondear horarios
  silenciosamente. Tratar fecha calendario y fecha/hora como conceptos
  distintos: usar `business-time.ts` y `combineDateAndTime` para formar un
  instante; no cambiar de zona horaria manualmente.
- Mantener TypeScript estricto, ESM e imports locales con extensión `.js`.
  Evitar `any`, capturas amplias y fallos silenciosos; los errores relevantes
  deben quedar claros.
- No agregar IA generativa ni enviar conversaciones/datos de clientes a
  servicios externos. La tercera modalidad (números de negocio propios) no
  forma parte del trabajo aprobado actualmente.

## Desarrollo y validación

Requiere Node.js/npm compatibles con las dependencias del proyecto:

```powershell
npm install
npm run build
npm test
```

Para NLP o conversación, ejecutar primero el subconjunto afectado y luego la
suite completa:

```powershell
npx vitest run tests/core/nlp
npx vitest run tests/core/conversation
npm test
npm run build
git diff --check
```

No afirmar que pruebas, compilación o integraciones pasaron si no se ejecutaron.
Los cambios solo documentales no requieren build ni suite completa; comprobar
el formato del diff.

### Consolas de desarrollo

```powershell
$env:BUSINESS_CONFIG_PATH = ".\negocio.json"; npm run intent:console
$env:BUSINESS_CONFIG_PATH = ".\negocio.json"; npm run coordinator:console
```

La consola del coordinador usa adaptadores en memoria: **no** consulta el
Google Calendar real y no representa una verificación de disponibilidad de
producción.

## Runtime local y operaciones reales

1. Configura el negocio en `negocio.json` (o indica otro archivo mediante
   `BUSINESS_CONFIG_PATH`).
2. Guarda el cliente OAuth de Google en `.google_auth/client_secret.json` y
   ejecuta `npm run calendar:auth`.
3. Inicia el runtime con `npm start`; en la primera vinculación escanea el QR
   de WhatsApp. El runtime valida la configuración, comprueba Calendar y
   recupera la bandeja antes de anunciar que está listo.

`npm start` y los comandos `npm run whatsapp:*` usan servicios/cuentas reales.
No ejecutarlos como parte de una validación automática ni en paralelo con
`tests/whatsapp-web/message-test.ts`: pueden procesar mensajes, crear o
cancelar citas. No se debe asumir que `SQLITE_DATABASE_PATH` aísla WhatsApp ni
Google Calendar.

No subir `.env`, `negocio.json` local, `.google_auth/`, `.wwebjs_auth/`,
`.wwebjs_cache/`, bases de datos, tokens, credenciales, IDs/tokens privados de
Meta ni datos de clientes. Los recursos de prueba de Meta, si se usan, deben
inyectarse como configuración local/secreto de entorno y nunca imprimirse.
Automatizar esas pruebas con mocks/fixtures; cualquier prueba autenticada debe
ser manual, autorizada y aislada.

## Documentación de producto

El alcance, casos de uso, decisiones pendientes y fases entregables de Seresta
Intermediario están en
[PLAN_TRABAJO_SERESTA_INTERMEDIARIO.md](./PLAN_TRABAJO_SERESTA_INTERMEDIARIO.md).
La prueba técnica aislada de Cloudflare de la Fase 1 está documentada en
[spikes/cloudflare-viability/README.md](./spikes/cloudflare-viability/README.md).
Este README describe cómo orientarse en el código existente; el plan describe
el producto alojado que todavía se debe construir.
