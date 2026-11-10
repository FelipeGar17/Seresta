# Guía de trabajo y continuidad

Chatbot local de gestión de citas por WhatsApp para barberías/peluquerías.
El diseño de producto está en [DocumentoInicial.md](./DocumentoInicial.md).
Este archivo conserva las reglas de ingeniería y el punto de partida para la
próxima sesión; no es un diario de cambios.

## Estado de continuidad actualizado al 30/10/2026

- Suite: **798/798 pruebas pasan**; `npm run build` y `git diff --check` pasan.
- El árbol de trabajo contiene cambios previos de varias tareas. Revisar
  `git status --short`; no revertir, limpiar ni sobrescribir cambios ajenos.
- El usuario confirmó una prueba manual autenticada del runtime integrado:
  WhatsApp respondió, se creó y eliminó una cita, y el bot rechazó un bloque
  ocupado. No ejecutar esas integraciones reales durante validaciones
  automáticas.
- Se corrigió el ingreso de mensajes WhatsApp cuyo ID no incluía
  `_serialized`, construyendo un ID determinístico desde sus componentes.
- `npm start` ahora compila, valida `negocio.json` (o
  `BUSINESS_CONFIG_PATH`), comprueba Calendar y espera a WhatsApp y la
  recuperación de la bandeja. La primera vinculación aún requiere escanear QR.
  La integración real debe probarse con precaución: la base SQLite aislada no
  aísla WhatsApp ni Google Calendar.
- Se agregó el rechazo explícito `past-time`: una hora ya pasada debe explicarse
  como tal y nunca desplazar la reserva a otra fecha. Build y pruebas pasan;
  falta comprobar ese caso manualmente con el runtime.
- El usuario reportó una cita pedida para jueves que terminó en miércoles.
  Causa reproducida el 02/11/2026: `requestedDate` es una fecha calendario
  (medianoche UTC) y se formatea como instante con la zona del negocio, así que
  en zonas UTC-5 se muestra el día anterior. Afecta solo el texto de
  `availability-inquiry-flow.ts` (mensaje sin cupos) y `booking-replies.ts`
  (`getUnrecognizedFieldReply`); el instante guardado usa `combineDateAndTime`.
  Falta corregir y confirmar manualmente que la reserva almacenada no se desplazó.
- Primera pasada de mensajes compactos: menú numerado, respuestas más
  escaneables y opciones `1`/`2`/`3` interpretadas solo si el menú de entrada
  fue el último mensaje del bot. Los números no seleccionan opciones durante
  una reserva activa.
- En el primer turno, saludos y mensajes desconocidos reciben bienvenida; las
  solicitudes reconocidas se atienden directamente, conservando las entidades
  del mensaje. Si hay acciones incompatibles y hace falta aclarar, se saluda
  antes de pedir la aclaración.
- Google Calendar fue probado manualmente, pero OAuth sigue pendiente de
  preparación para distribuirlo: en estado `Testing`, los permisos offline
  para Calendar expiran a los siete días. El producto debería administrar su
  propio proyecto OAuth; cada negocio autoriza su cuenta y usa su propio
  `calendarId`.
- Producto acordado: ofrecer primero el servicio local (computador del negocio,
  runtime iniciado localmente y calendario propio) y planear después un
  instalador Electron con configuración/estado/actualizaciones seguras. La
  edición alojada con WhatsApp Business Platform, webhooks y operación 24/7 es
  una modalidad separada y todavía no está implementada.
- Consultas de Calendar: reservar después de mostrar disponibilidad por franja
  requiere ≈6 solicitudes (4 comprobaciones de disponibilidad, 1 lectura
  idempotente y 1 creación); si la hora exacta se entrega desde el inicio,
  ≈5. El arranque agrega una comprobación; reintentos, cancelaciones y
  paginación pueden aumentar el uso. Revisar la cuota y facturación vigentes
  antes de crecer; ver el [README](./README.md).

## Estado actual de conectores

- `src/index.ts` compone el runtime con `whatsapp-web.js`/`LocalAuth`,
  bandeja persistente SQLite y Google Calendar OAuth local.
- `src/core/messaging/` deduplica por ID, procesa FIFO por contacto y recupera
  trabajo interrumpido. La entrega de respuestas es al menos una vez: un fallo
  después del envío y antes del acuse local puede repetir una respuesta.
- La disponibilidad combina eventos ocupados de Calendar con reservas locales;
  al conocer servicio y fecha informa los periodos con horarios libres; si una
  hora está ocupada, propone hasta tres opciones cercanas. Toda hora elegida se
  vuelve a consultar antes de confirmar. La creación usa un ID de evento
  determinístico y la cancelación elimina el evento antes de actualizar SQLite.
- Una consulta independiente de disponibilidad pide el servicio o la fecha
  que falten, conserva el contexto al probar otro día y no crea una cita. Solo
  pasa al flujo de reserva si el cliente lo solicita explícitamente. Cada
  fecha consultada requiere normalmente una lectura de Calendar.
- Durante una reserva, la consulta de disponibilidad conserva los datos y
  explica por qué se necesita el servicio; «Salir» cancela el borrador sin
  crear una cita. Mostrar horarios en líneas separadas por franja.
- `src/connectors/whatsapp/whatsapp-connector.ts` define el límite compartido
  para añadir otro proveedor. WhatsApp Business oficial todavía no está
  implementado.
- Las pruebas automáticas cubren FIFO, deduplicación, recuperación, colisiones
  SQLite y reintentos de Calendar/cancelación. La prueba manual autenticada
  descrita arriba ya se ejecutó; no repetirla durante validaciones automáticas.
- El runtime requiere `BUSINESS_CONFIG_PATH`, un `calendarId` válido,
  `.google_auth/client_secret.json`, autorización con `npm run calendar:auth`
  y sesión local `.wwebjs_auth/`.

## Empezar la próxima sesión

1. Leer esta sección y revisar `git status --short`.
2. Ejecutar `npm test` y `npm run build`; distinguir fallos previos de los
   causados por cambios nuevos.
3. Reproducir con el runtime el caso de la fecha en miércoles y probar que una
   hora pasada de hoy se rechaza sin cambiar de fecha.
4. Antes de ofrecerlo a clientes, resolver la publicación/verificación OAuth y
   documentar el proceso de autorización de cada calendario.
5. Priorizar el piloto local; planear Electron y, en una etapa separada, la
   edición alojada de WhatsApp Business. El README conserva el estado de
   producto y sus límites.

### Plan de correcciones acordado (02/11/2026)

Implementar en este orden, con las pruebas del módulo y después la suite
completa. No ejecutar WhatsApp ni Calendar reales durante la validación
automática.

1. **A1 · Mostrar la fecha correcta.** Formatear `requestedDate` como fecha
   calendario (medianoche UTC), no como instante. Agregar un helper en
   `src/core/time/business-time.ts` que formatee en UTC y usarlo en
   `availability-inquiry-flow.ts` y `booking-replies.ts`. Regresión: pedir
   «jueves» en `America/Bogota` y exigir «jueves» en el texto.
2. **A2 · Cola que no se bloquea.** Añadir el estado terminal `failed` a
   `IncomingMessageStatus`, límite de intentos (5) y cuarentena con
   `markFailed`; excluir `failed` de `getNextUndelivered` y
   `listUndeliveredContactIds`. Disparar `drainPending()` con un intervalo del
   runtime (15-30 s), no con un timer dentro del procesador. El primer fallo
   debe seguir dejando `pending` con `failedAttempts: 1`.
3. **A3 · Recuperación tras reconexión.** Re-ejecutar `recover()` y
   `deleteExpired()` en cada `ready` (son idempotentes), no solo en el primero.
   En `disconnected` tras estar listo, intentar reconexión acotada con backoff o
   fallar de forma explícita. Probar solo manualmente.
4. **A4 · Pendientes fantasma.** Añadir `deleteStalePendingBefore(cutoff)` al
   contrato y a SQLite/memoria; purgar solo `pending` con más de 60 minutos.
   Nunca tocar `confirmed` ni `cancelled`. Ejecutar en el mantenimiento
   periódico, después de `recover()`.
5. **A5 · Idempotencia con contenido.** En `createPendingIfAvailable`, si el ID
   ya existe, comparar `startsAt`, `endsAt`, `serviceId` y `status`: devolver
   `true` solo si son equivalentes; si no, `false`. Mantener el test de
   colisiones.
6. **A7 · Listas numeradas (segunda pasada).** Numerar servicios y horarios y
   parsear `1/2/3` dentro del flujo correspondiente, guardando las opciones
   ofrecidas en la conversación. Es el cambio de mayor riesgo: hacerlo después
   de A1-A5 y con pruebas dedicadas de menú de entrada y reserva activa.

No modificar **A6**: «cancelar» durante un borrador reinicia el flujo a
propósito; el usuario lo confirmó el 02/11/2026.

Dejar para después el refactor de modularidad (extraer el lector de Calendar de
`booking-flow.ts` y las reglas de enrutado del coordinador); no cambia
comportamiento y no es prioritario.

Invariantes que no se deben romper:

- La conversación vence a los 10 minutos sin respuesta
  (`CONVERSATION_TTL_MINUTES`); cada mensaje renueva el plazo.
- Tras confirmar, una cita sigue siendo cancelable aunque la conversación haya
  vencido: la cancelación busca en `listConfirmedByContact`, no en la
  conversación. No purgar `confirmed`.
- `createPendingIfAvailable` sigue rechazando solapamientos (mismo hueco →
  `false`).

### Prioridades de trabajo

#### A. Conversación más natural y recuperable

1. **Contexto de respuestas cortas.** Sigue pendiente que «sí»/«no» dependan
   del estado y la respuesta que el bot espera, no de buscar `confirm*` o
   `acept*` en el último mensaje saliente completo. `getLastBotQuestion` en
   `src/core/conversation/turn-utils.ts` devuelve ese mensaje completo; el
   detector contextual está en `src/core/nlp/intent-detector.ts`. Regresión
   conocida: un menú que menciona una «cita confirmada» puede hacer que un
   «sí» aislado parezca confirmación. Mantener el doble paso de confirmación.
2. **Nombre junto con otras cláusulas.** Revisar si aún hay casos residuales en
   que frases como «me llamo Sara y tengo una pregunta» contaminen el nombre o
   «me llamo Ana y mi cita es para el jueves» impidan extraerlo; verificar el
   comportamiento actual antes de modificarlo.
   Revisar `src/core/nlp/entity-extractor.ts` y
   `tests/core/nlp/entity-extractor.test.ts`; agregar casos combinados al
   coordinador y preservar los demás datos del mensaje.
3. **Dudas y errores humanos.** Diseñar e implementar respuestas que expliquen
   qué dato no se entendió, por qué y cómo responder, en vez de repetir la
   misma pregunta. La primera pasada visual y compacta ya está hecha; falta
   revisar las explicaciones de errores, conservar datos válidos, no completar
   datos por suposición y pedir una aclaración concreta cuando haya varias
   interpretaciones.
   Revisar `src/core/conversation/booking-replies.ts`,
   `src/core/conversation/entry-replies.ts` y el flujo en
   `src/core/conversation/booking-flow.ts`.
4. **Confianza.** `detection.score` es un conteo de coincidencias, no una
   probabilidad calibrada. No mostrar porcentajes como si fueran probabilidades
   reales. Primero crear/usar ejemplos etiquetados (positivos, negaciones,
   errores tipográficos, ambiguos y mensajes con varias intenciones), definir
   umbrales medibles y elegir entre aceptar, aclarar o mostrar opciones.
   Mantener esta política en una capa clara; no duplicarla entre detector,
   extractor y coordinador.
5. **Teléfono e identidad.** `message.from` es la identidad de conversación y
   puede ser un `@lid`; no es un teléfono de contacto. `src/index.ts` guarda
   `customerPhone` solo cuando `getContact().number` lo proporciona. Definir
   cómo solicitar y validar el teléfono cuando no esté disponible, y cómo
   conservar por separado el identificador de WhatsApp, el contacto estable y
   el número que usará el barbero.

#### B. Validación manual de WhatsApp + Google Calendar

1. Probar dos mensajes rápidos del mismo contacto, dos contactos concurrentes,
   mensajes duplicados y reinicio con trabajos pendientes.
2. Comprobar manualmente el rechazo de horas pasadas y seguir la anomalía de la
   cita del jueves que terminó en miércoles.
3. Resolver OAuth para producción antes de distribuirlo a clientes; el estado
   actual de pruebas no es adecuado para uso sostenido de terceros.
4. No ejecutar a la vez el runtime y `tests/whatsapp-web/message-test.ts`,
   porque ambos podrían responder al mismo chat.

## Arquitectura y rutas útiles

- `src/core/types.ts`: contratos compartidos.
- `src/core/nlp/`: normalización, análisis, intenciones, extracción de datos,
  fechas y resolución de servicios. `message-analysis.ts` aplica la corrección
  ortográfica una vez y comparte el análisis con detector y extractor.
- `date-parser.ts` reconoce fechas relativas y fechas calendario en formatos
  `día/mes[/año]` o `día de mes [de año]`; una fecha sin año usa su próxima
  ocurrencia según la zona horaria del negocio.
- `src/core/time/business-time.ts`: única fuente de verdad para calendario,
  zona horaria y combinación de fecha + hora.
- `src/core/booking/`: validación de servicio, horario, fechas, bloques y
  disponibilidad. Las reglas de horario viven aquí, no en el coordinador.
- `src/core/conversation/`: `coordinator.ts` enruta; `booking-flow.ts` gestiona
  el borrador y confirmaciones; `availability-inquiry-flow.ts` gestiona las
  consultas independientes sin crear reservas; `reservation-schedule.ts`
  integra la validación; `cancellation-flow.ts` sincroniza la cancelación con
  el puerto de agenda; los módulos `*-replies.ts` presentan respuestas.
- `src/core/reservations/` y `src/core/storage/`: repositorios y persistencia
  SQLite. El dominio debe depender de contratos, no de WhatsApp o Calendar.
- `src/connectors/`: adaptadores de WhatsApp Web y Google Calendar.
- `src/index.ts`: composición del runtime productivo.
- `src/console/coordinator-console.ts`: prueba manual local del flujo completo.
- `tests/core/`: pruebas automáticas. `tests/whatsapp-web/`: pruebas manuales
  aisladas de librerías externas; no importar desde `src/`.

Flujo base: entrada → `analyzeReservationMessage` →
`analyzeMessage` → coordinador/flujo → validación de agenda → persistencia.
La intención decide qué desea hacer el cliente; el extractor solo aporta datos
que realmente reconoce. Un dato ambiguo no debe convertirse en una selección.

## Comandos

Ejecutar desde la raíz:

```powershell
npm test
npm run build
npm start
$env:BUSINESS_CONFIG_PATH = ".\negocio.json"; npm run intent:console
$env:BUSINESS_CONFIG_PATH = ".\negocio.json"; npm run coordinator:console
$env:BUSINESS_CONFIG_PATH = ".\negocio.json"; npm run dev
```

`npm start` compila e inicia el runtime integrado, valida `negocio.json` por
defecto (o `BUSINESS_CONFIG_PATH`), comprueba Calendar y espera a WhatsApp
listo. `npm run dev` conserva el reinicio automático para desarrollo.

Para una corrección, correr primero las pruebas del módulo afectado y después
la suite completa, build y `git diff --check`. No afirmar que una integración
manual funciona si no se ejecutó realmente.

## Restricciones y metodología

- Mantener TypeScript estricto, ESM e imports locales con extensión `.js`.
  Evitar `any`, conversiones que oculten errores, capturas amplias y fallos
  silenciosos.
- Mantener módulos pequeños, cohesivos y con responsabilidades claras.
  Cuando un módulo crezca, dividir por comportamiento/contrato; no crear capas
  o archivos diminutos solo por el número de líneas.
- Presentar las respuestas conversacionales en una sola burbuja por turno, con
  texto compacto y emojis moderados. Interpretar `1`/`2`/`3` solo si el último
  mensaje del bot contiene el menú de entrada y la conversación está inactiva.
- **Preferir una biblioteca mantenida, un paquete ya instalado o el SDK/API
  oficial antes que reimplementar infraestructura genérica** (OAuth, clientes
  HTTP, fechas, persistencia, etc.). Antes de añadir una dependencia, revisar
  lo existente y valorar mantenimiento, compatibilidad, seguridad, licencia,
  privacidad y funcionamiento local. Mantener las reglas propias del negocio
  en el núcleo; no delegarlas a una dependencia externa sin decisión explícita.
- No añadir IA generativa, WhatsApp, Google Calendar ni SQLite dentro del
  núcleo NLP o de los contratos de conversación. Las integraciones deben ser
  adaptadores externos. No enviar datos de clientes a servicios externos sin
  aprobación explícita.
- No hardcodear la zona horaria: usar `business-time.ts`. Para una cita,
  `Date` puede representar fecha calendario o instante; construir el instante
  de fecha + hora solo con `combineDateAndTime`.
- No hardcodear nombres de servicios en `synonyms.ts`: el catálogo de negocio
  es la fuente de verdad. No elegir arbitrariamente entre servicios ambiguos.
- Las negaciones explícitas deben impedir que una regla positiva se active.
  «No gracias» sin contexto es agradecimiento; los afirmativos aislados solo
  se resuelven según la respuesta que se espera en el estado actual.
- `ReservationStatus.pending` es provisional; `confirmed` solo después de la
  confirmación explícita y de completar con éxito la creación del evento en el
  runtime integrado.
- `ConversationStore.get` y `getByContact` devuelven `null` si no existe
  resultado; `deleteExpired` devuelve la cantidad eliminada.
- La agenda local usa varios tramos diarios, cierres excepcionales,
  anticipación mínima e intervalo configurable (30 minutos por defecto).
  Rechazar inicios desalineados; no redondear silenciosamente. `endsAt` es el
  final real y `occupiedEndsAt` el final de los bloques reservados.
- No confirmar disponibilidad sin `existingAppointments` o una fuente real.
  El runtime consulta Calendar y las reservas locales; la consola usa el
  adaptador en memoria y no representa una verificación real de disponibilidad.
- No subir `.env`, `negocio.json` local, `.google_auth/`, `.wwebjs_auth/`,
  `.wwebjs_cache/`, tokens, credenciales ni datos de clientes.
- Revisar `git status` antes de editar. No revertir cambios preexistentes,
  modificar horarios reales del negocio ni crear commits sin pedirlo.
- Al cambiar reglas NLP, agregar pruebas positivas, negativas, ambiguas y de
  prioridad. Mantener actualizados los README de fase si cambia un comando,
  ruta o comportamiento observable.
