# Guía de trabajo y continuidad

Chatbot local de gestión de citas por WhatsApp para barberías/peluquerías.
El diseño de producto está en [DocumentoInicial.md](./DocumentoInicial.md).
Este archivo conserva las reglas de ingeniería y el punto de partida para la
próxima sesión; no es un diario de cambios.

## Estado al cierre del 28/10/2026

- Suite: **711/711 pruebas pasan**. `npm run build` pasa.
- `git diff --check` pasa; Git solo mostró avisos de finales de línea CRLF.
- El árbol de trabajo ya estaba sucio antes de la última tarea. Revisar
  `git status` y no revertir, limpiar ni sobrescribir cambios ajenos.
- La última corrección hizo compatibles frases como «sí, la confirmo» y
  «la confirmo» con el flujo de doble confirmación. «No la confirmo» sigue
  siendo una negación.
- **No se ha integrado Google Calendar ni se ha probado el runtime WhatsApp
  autenticado en esta sesión.** No presentar esos flujos como verificados.

## Empezar la próxima sesión

1. Leer esta sección y revisar `git status --short`.
2. Ejecutar `npm test` y `npm run build` para conocer la base real antes de
   editar. Si fallan, distinguir fallos previos de los causados por el cambio.
3. Continuar con el trabajo conversacional de la sección siguiente. No empezar
   Calendar hasta resolver o acordar explícitamente los requisitos previos de
   identidad, orden de mensajes y disponibilidad.

### Prioridades de trabajo

#### A. Conversación más natural y recuperable

1. **Contexto de respuestas cortas.** Sigue pendiente que «sí»/«no» dependan
   del estado y la respuesta que el bot espera, no de buscar `confirm*` o
   `acept*` en el último mensaje saliente completo. `getLastBotQuestion` en
   `src/core/conversation/turn-utils.ts` devuelve ese mensaje completo; el
   detector contextual está en `src/core/nlp/intent-detector.ts`. Regresión
   conocida: un menú que menciona una «cita confirmada» puede hacer que un
   «sí» aislado parezca confirmación. Mantener el doble paso de confirmación.
2. **Nombre junto con otras cláusulas.** No está resuelto que frases como
   «me llamo Sara y tengo una pregunta» puedan contaminar el nombre y que
   «me llamo Ana y mi cita es para el jueves» pueda dejarlo sin extraer.
   Revisar `src/core/nlp/entity-extractor.ts` y
   `tests/core/nlp/entity-extractor.test.ts`; agregar casos combinados al
   coordinador y preservar los demás datos del mensaje.
3. **Dudas y errores humanos.** Diseñar e implementar respuestas que expliquen
   qué dato no se entendió, por qué y cómo responder, en vez de repetir la
   misma pregunta. Conservar datos válidos, no completar datos por suposición
   y pedir una aclaración concreta cuando haya varias interpretaciones.
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

#### B. Requisitos previos para Google Calendar

1. **Orden y duplicados de mensajes:** `src/index.ts` procesa eventos
   asíncronos sin una cola por contacto ni deduplicación persistente por id de
   mensaje. Diseñar y probar el orden FIFO y la repetición segura antes de
   añadir efectos externos.
2. **Disponibilidad real:** `src/core/conversation/reservation-schedule.ts`
   llama a `validateAppointmentAvailability` sin `existingAppointments`.
   Implementar un puerto de disponibilidad y un adaptador de Calendar; pasar
   las citas existentes al validador y revalidar antes de crear el evento. No
   decir que un hueco está libre si no se consultó la fuente real.
3. **Confirmación y cancelación idempotentes:** definir estados y recuperación
   ante errores/timeouts entre SQLite y Calendar; persistir el id del evento;
   no anunciar confirmación hasta saber que la creación externa tuvo éxito.
   Las cancelaciones también deben sincronizarse y poder reintentarse sin
   duplicar acciones.
4. **Pruebas de integración:** cubrir colisiones, mensaje duplicado, respuesta
   lenta o fallo de Calendar, reintento, reinicio a mitad del flujo y
   cancelación. Probar WhatsApp autenticado de forma aislada y no ejecutar a la
   vez `npm run dev` y `tests/whatsapp-web/message-test.ts`, porque ambos
   podrían responder al mismo mensaje.

## Arquitectura y rutas útiles

- `src/core/types.ts`: contratos compartidos.
- `src/core/nlp/`: normalización, análisis, intenciones, extracción de datos,
  fechas y resolución de servicios. `message-analysis.ts` aplica la corrección
  ortográfica una vez y comparte el análisis con detector y extractor.
- `src/core/time/business-time.ts`: única fuente de verdad para calendario,
  zona horaria y combinación de fecha + hora.
- `src/core/booking/`: validación de servicio, horario, fechas, bloques y
  disponibilidad. Las reglas de horario viven aquí, no en el coordinador.
- `src/core/conversation/`: `coordinator.ts` enruta; `booking-flow.ts` gestiona
  el borrador y confirmaciones; `reservation-schedule.ts` integra la
  validación; `cancellation-flow.ts` cancela citas locales; los módulos
  `*-replies.ts` presentan respuestas.
- `src/core/reservations/` y `src/core/storage/`: repositorios y persistencia
  SQLite. El dominio debe depender de contratos, no de WhatsApp o Calendar.
- `src/index.ts`: composición del runtime WhatsApp.
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
$env:BUSINESS_CONFIG_PATH = ".\negocio.json"; npm run intent:console
$env:BUSINESS_CONFIG_PATH = ".\negocio.json"; npm run coordinator:console
$env:BUSINESS_CONFIG_PATH = ".\negocio.json"; npm run dev
```

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
  confirmación explícita y, cuando se integre Calendar, de completar su
  creación con seguridad.
- `ConversationStore.get` y `getByContact` devuelven `null` si no existe
  resultado; `deleteExpired` devuelve la cantidad eliminada.
- La agenda local usa varios tramos diarios, cierres excepcionales,
  anticipación mínima e intervalo configurable (30 minutos por defecto).
  Rechazar inicios desalineados; no redondear silenciosamente. `endsAt` es el
  final real y `occupiedEndsAt` el final de los bloques reservados.
- No confirmar disponibilidad sin `existingAppointments` o una fuente real.
  Hoy no hay integración con Calendar: puede haber solapamientos entre
  reservas.
- No subir `.env`, `negocio.json` local, `.google_auth/`, `.wwebjs_auth/`,
  `.wwebjs_cache/`, tokens, credenciales ni datos de clientes.
- Revisar `git status` antes de editar. No revertir cambios preexistentes,
  modificar horarios reales del negocio ni crear commits sin pedirlo.
- Al cambiar reglas NLP, agregar pruebas positivas, negativas, ambiguas y de
  prioridad. Mantener actualizados los README de fase si cambia un comando,
  ruta o comportamiento observable.
