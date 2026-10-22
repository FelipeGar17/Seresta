# AGENTS.md — Guía de continuación del proyecto

Documento de traspaso para retomar el trabajo sin contexto previo.
El diseño maestro está en [`DocumentoInicial.md`](./DocumentoInicial.md); este
archivo resume **qué está hecho, dónde está y por dónde seguir/corregir**.

## 1. Resumen del proyecto

Chatbot de gestión de citas por WhatsApp para barberías/peluquerías.
Motor NLP propio **basado en reglas** (sin IA generativa), separado de los
adaptadores externos (WhatsApp, Google Calendar).

- Stack: Node.js + TypeScript (ESM), `whatsapp-web.js`, `googleapis`, Vitest.
- Zona horaria del negocio: `America/Bogota`.
- Principios: modularidad, el motor no depende de WhatsApp/Calendar, config
  fuera del código, no añadir librerías sin necesidad concreta
  (ver secciones 4 y 20 de `DocumentoInicial.md`).

## 2. Comandos

```powershell
npm test          # suite completa (vitest run)
npm run test:watch
npm run build     # tsc (compilación de TypeScript)
npm run intent:console   # consola manual de intenciones
```

Estado actual: **186/186 pruebas pasan, `npm run build` limpio.**

> Nota: los scripts `dev`, `test:gcal-auth`, `test:gcal`, `test:wa-gcal` de
> `package.json` apuntan a `src/index.ts` / `src/experiments/*`, que **no
> existen**. Las pruebas manuales reales están en `tests/whatsapp-web/`.

## 3. Numeración de fases (usada en el trabajo diario)

| Fase | Alcance | Estado |
| ---- | ------- | ------ |
| 1 | Tipos y modelos (`src/core/types.ts`) | Completada |
| 2 | Normalización de texto (`normalize.ts`) | Completada |
| 3 | Detección de intenciones (`intent-detector.ts` + `synonyms.ts`) | Completada |
| 4 | Extracción de entidades (`entity-extractor.ts` + `date-parser.ts`) | Completada |
| 5 | Validación de reservas | **Completada** (fechas, servicio, horario, cierres, `endsAt`) |

Ojo: esta numeración **no** coincide con la hoja de ruta del `DocumentoInicial.md`
(ahí "Fase 5" es NLP). Usar siempre esta tabla para el trabajo diario.

## 4. Mapa de archivos y puntos de entrada

### Núcleo
- `src/core/types.ts` — tipos compartidos: `ConversationIntent`,
  `ConversationState`, `ReservationStatus`, `ReservationData`,
  `ExtractedEntities`, `Weekday`, `Recurrence`, `Conversation`, `Reservation`,
  `Service`, `ConfiguracionNegocio`, `ServiceCatalogEntry`, `ServiceMatch`,
  `BusinessHoursInterval`, `WeeklyBusinessHours`, `BusinessClosure`,
  `BookingPolicy`, `ValidationResult`/`ValidationReason`.

### Base de tiempo (`src/core/time/`)
- `src/core/time/business-time.ts` — **base temporal del negocio** (sin texto,
  sin dependencias externas). Es la única fuente de verdad sobre fechas y
  horas del negocio:
  - `DEFAULT_TIME_ZONE` (`America/Bogota`), `MILLISECONDS_PER_DAY`.
  - `getLocalCalendarDate(date, timeZone?)` → `{ year, month, day }` del día
    local; `getUtcCalendarDate`, `toUtcDateOnly`, `getDateOnly`,
    `getBusinessDateOnly(date, timeZone?)` (instante → medianoche UTC de su
    día local), `addDays`, `getWeekdayOfDateOnly`, `getWeekdayIndex`.
  - `parseTimeToMinutes('HH:mm')`, `getTimeZoneOffsetMs(date, timeZone?)`.
  - `combineDateAndTime(dateOnly, 'HH:mm', timeZone?)` → **instante** (única
    forma de pasar de fecha+hora a `startsAt`); resuelve el desfase en dos
    pasadas para zonas con cambio de horario.
  - Zona horaria inválida → `Error` con mensaje claro ("Zona horaria inválida").

### NLP (`src/core/nlp/`)
- `normalize.ts` — `normalizeText`, `normalizeForExtraction`, `normalizeIntent`,
  `splitEmojis`, `tokenize`.
- `synonyms.ts` — `intentSynonyms` e `intentNegations` por intención. Solo
  vocabulario **general** del negocio: sin nombres de servicios ni de un
  sector concreto.
- `intent-detector.ts` — reglas `RULES` (el orden define prioridad),
  `detectIntent`, `detectIntentDetailed` (devuelve `intents[]`,
  `negatedIntents` y `frames`), respuesta corta contextual de confirmación.
  Acepta `options.services` (catálogo del negocio).
- `intent-frames.ts` — **marcos de intención** ("verbo + ranura de servicio"):
  `detectCatalogFrames` (la ranura debe ser un servicio configurado) y
  `detectGenericFrames` (solo estructura, sin saber qué servicios existen).
  No resuelve el servicio: eso es de `service-matcher`.
- `entity-extractor.ts` — `extractEntities` (servicio, fecha relativa, fecha,
  hora, franja horaria y recurrencia). Recibe el **catálogo** por
  `options.services`; sin catálogo no resuelve servicio.
- `service-matcher.ts` — `matchService(text, services)` resuelve el texto
  contra el catálogo del negocio (nombres + alias, normalizados) y devuelve
  `ServiceMatch`: `matched` / `ambiguous` / `not-found`. `normalizeServiceName`
  es la **única** normalización de nombres de servicio.
- `date-parser.ts` — `parseRelativeDate` (hoy, mañana, pasado mañana, días de
  semana, `el próximo X`), `matchDatePhrase` (reconocimiento **único** de la
  frase de fecha, compartido con el extractor), `resolveDatePhrase`.
- `intent-console.ts` — herramienta manual (`npm run intent:console`). Carga un
  catálogo opcional con `--catalog <archivo>` o `CATALOG_PATH`.

### Reservas y conversación
- `src/core/booking/booking-date-policy.ts` — `checkBookingDate` /
  `checkBookingInstant` devuelven el **motivo** del rechazo
  (`ValidationResult`); `isBookingDateAllowed` (fecha calendario) e
  `isBookingInstantAllowed` (instante) son los atajos booleanos. Ventana:
  hoy → +6 días (`MAX_BOOKING_DAYS_AHEAD`), ampliable con `maxDaysAhead`.
- `src/core/booking/service-validator.ts` — `validateService`: busca el
  servicio por id, nombre o alias normalizado y valida que exista, esté
  activo y tenga `durationMinutes`/`price` válidos. No resuelve texto: eso es
  del matcher.
- `src/core/booking/business-hours-validator.ts` — `validateBusinessHours`:
  valida el instante contra el horario del negocio, los días de atención, los
  cierres excepcionales, la anticipación mínima y la ventana de reserva;
  devuelve `{ startsAt, endsAt }` (calcula el final del servicio) o el motivo
  del rechazo (`closed-day`, `outside-hours`, `exceptional-closure`,
  `insufficient-notice`, `invalid-service-duration`).
- `src/core/conversation/store.ts` — contrato `ConversationStore`.
- `src/core/conversation/memory-store.ts` — implementación en memoria.

### Pruebas
- `tests/core/time/business-time.test.ts` — base temporal (zona, calendario,
  combinación fecha+hora).
- `tests/core/nlp/` — `normalize`, `intent-detector` (incluye los casos con
  catálogo), `entity-extractor`, `date-parser`, `service-matcher` (pruebas
  unitarias de Fases 2–4).
- `tests/core/booking/booking-date-policy.test.ts` — validación de fechas.
- `tests/core/booking/booking-window.test.ts` — coherencia entre el parser de
  fechas y la política de reservas (toda fecha que el bot sabe interpretar
  debe caer dentro de la ventana).
- `tests/core/booking/service-validator.test.ts` — validación de servicio.
- `tests/core/booking/business-hours-validator.test.ts` — horario, cierres,
  anticipación mínima y cálculo de `endsAt`.
- `tests/core/conversation/memory-store.test.ts`.
- `tests/whatsapp-web/` — **solo verificación aislada de librerías**
  (WhatsApp/Calendar). No importar desde `src/`.

## 5. Dónde empezar a corregir si algo de una fase previa falla

1. Correr `npm test`; Vitest indica archivo y caso exacto.
- Buscar el comportamiento en este orden según el caso:
  - **Intención mal detectada** → `intent-detector.ts` (orden de `RULES`) y
    `synonyms.ts` (listas de cada intención). Si el mensaje menciona un
    servicio ("quiero un corte"), revisar `intent-frames.ts` (marcos con y
    sin catálogo).
  - **Entidad mal extraída (servicio/fecha/hora)** → `entity-extractor.ts`
    (`extractTime`, `extractTimeOfDay`), `service-matcher.ts`
    (`matchService`, `normalizeServiceName`) y `date-parser.ts`
    (`matchDatePhrase`, `resolveDatePhrase`).
  - **Texto mal normalizado** → `normalize.ts`.
  - **Fecha/hora/zona del negocio** → `src/core/time/business-time.ts` (una
    sola implementación; no duplicar `Intl.DateTimeFormat` en otros módulos).
  - **Tipo/estructura de datos** → `types.ts`.
- Añadir/ajustar la prueba en `tests/core/nlp/*` y reejecutar `npm test`.

### Convención de fechas (importante)
`parseRelativeDate` devuelve una **fecha calendario a medianoche UTC**
(`Date.UTC(year, month, day)`). No reinterpretar con `toISOString()` local.
La comparación con "hoy" en la zona del negocio la hace `booking-date-policy.ts`.

Para pasar de (fecha + hora) a un instante usar **siempre**
`combineDateAndTime(dateOnly, 'HH:mm', timeZone)` de
`src/core/time/business-time.ts`: el día es una fecha calendario y la hora es
hora de pared del negocio (15:00 en Bogotá = 20:00 UTC). No construir el
instante a mano.

### Fecha calendario vs instante (no confundirlos)
`Date` no distingue los dos casos y equivocarse cambia el día:
- `checkBookingDate(dateOnly, …)` / `isBookingDateAllowed(dateOnly, …)` →
  reciben una **fecha calendario** (medianoche UTC del día local).
- `checkBookingInstant(instant, …)` / `isBookingInstantAllowed(instant, …)` →
  reciben un **instante** y lo convierten al día local del negocio.

Una cita pasada como instante puede caer en el día UTC equivocado (una cita
del 19/10 21:00 en Bogotá es 20/10 en UTC) y ser rechazada. Si el dato es un
instante, usar siempre la variante `Instant`.

### Semántica de las frases de fecha (aprobada)
- Frase **única**: `hoy`, `mañana`, `pasado mañana`, un día de la semana con
  o sin artículo (`lunes`, `el lunes`, `el próximo lunes`).
- Frase **recurrente**: `los martes`, `cada martes`, `todos los martes` →
  se reportan en `ExtractedEntities.recurrence` y **nunca** como fecha única.
- El día de la semana nombrado que coincide con hoy se resuelve a **hoy**.
  Solo `el próximo <día>` salta a la semana siguiente (+7 días), fecha que
  queda fuera de la ventana de reserva (+6) y que el validador deberá
  explicarle al cliente.
- El extractor y el parser comparten `matchDatePhrase`: no duplicar regex de
  fechas en dos archivos.

### Trampas conocidas
- `synonyms.ts` sufrió en su momento una expansión masiva externa que rompió
  reglas aprobadas. Reglas a preservar:
  - `no gracias` **no** es rechazo sin contexto → debe resolver `thanks`.
  - Los afirmativos genéricos (`ok`, `listo`, `perfecto`, `sale`, `claro`,
    `dale`, `de acuerdo`, `está bien`…) **no** deben ser sinónimos
    incondicionales de `confirm-appointment`; eso se maneja de forma
    contextual (el bot acaba de preguntar confirmación).
  - Tras cualquier edición de sinónimos: ejecutar `npm test`.
  - `synonyms.ts` ya **no** contiene nombres de servicios ("tienen corte",
    "cuánto cuesta el manicure"): si hace falta reconocerlos, el patrón va en
    `intent-frames.ts` con el catálogo, no como lista fija de sinónimos.
- `vitest.config.ts` excluye `dist/` de la suite.
- No importar nada de `tests/` dentro de `src/`.
- El motor no debe volver a hardcodear `America/Bogota` ni lógica de zona
  horaria: todo pasa por `src/core/time/business-time.ts`.

## 6. Fase 5 — Validación de reservas (en curso)

Objetivo: decidir **qué se valida antes de confirmar** una reserva, sin
duplicar lo que ya existe. Revisar primero qué hay (sección anterior) y qué
falta.

### Hecho en esta fase
- **Base de tiempo del negocio** (`src/core/time/business-time.ts`): una sola
  implementación de zona horaria, día calendario y construcción de instantes.
  Reemplaza las tres copias que había en `date-parser.ts`,
  `booking-date-policy.ts` y `entity-extractor.ts`.
- **Frases de fecha unificadas** (`matchDatePhrase`): el extractor y el parser
  comparten el mismo reconocimiento; se eliminó la duplicación de regex y de
  `stripMorningFranja`.
- **Corrección del salto de +7 días**: el parser ya no produce fechas que la
  política de reservas rechaza por construcción (ver §5, semántica aprobada).
- **Recurrencias detectadas**: `los martes` / `cada martes` se reportan en
  `ExtractedEntities.recurrence` y nunca como fecha única.
- **Contratos de validación unificados** (`ValidationResult` en `types.ts`):
  todos los validadores devuelven `{ valid, value }` o
  `{ valid: false, reason }` con el **motivo** del rechazo.
- **Política temporal con motivo y entrada para instantes**:
  `checkBookingDate` / `checkBookingInstant` devuelven `past-date`,
  `out-of-window`, `invalid-date` o `invalid-configuration`.
- **Catálogo de servicios por negocio** (`service-matcher.ts`): el motor no
  conoce nombres de servicios; el catálogo (nombres + alias) llega por
  `options.services` y la coincidencia es insensible a mayúsculas y tildes.
  Resultado `matched` / `ambiguous` / `not-found`; nunca se elige solo cuando
  hay varias coincidencias.
- **Validación del horario** (`business-hours-validator.ts`): horario semanal,
  cierres excepcionales, anticipación mínima, días no laborables y cálculo
  de `endsAt`; todo con motivo de rechazo.

### Ya existe
- `checkBookingDate(requestedDateOnly, { now, timeZone, maxDaysAhead })` y
  `checkBookingInstant(instant, …)` —
  `src/core/booking/booking-date-policy.ts`:
  - rechazan fechas inválidas y anteriores a hoy;
  - permiten hoy hasta `today + 6 días` (`MAX_BOOKING_DAYS_AHEAD`);
  - usan el día local del negocio (`America/Bogota` por defecto);
  - `maxDaysAhead` permite ampliar la ventana por configuración;
  - probadas en `tests/core/booking/booking-date-policy.test.ts` y
    `tests/core/booking/booking-window.test.ts`.
- `validateService(business, serviceQuery)` —
  `src/core/booking/service-validator.ts`: busca por id, nombre o alias
  normalizado y exige `active`, `durationMinutes > 0` y `price >= 0`; devuelve
  `{ valid, value }` o `{ valid: false, reason }`.
- `validateBusinessHours(business, { startsAt, durationMinutes, now })` —
  `src/core/booking/business-hours-validator.ts`: valida el horario del
  negocio (`ConfiguracionNegocio.businessHours`), días de atención, cierres
  excepcionales (`closures`), anticipación mínima y ventana de reserva
  (`bookingPolicy`); devuelve `{ startsAt, endsAt }` o el motivo del rechazo.
  Si el negocio no tiene `businessHours`, todo se rechaza con
  `invalid-configuration`: el horario es obligatorio.

### Falta por definir/implementar (candidatos)
- **Completitud** de `ReservationData` (qué campos faltan) — hoy los campos son
  opcionales y no hay una función que calcule el pendiente.
- **Cargador de configuración**: todavía no existe el archivo que arma
  `ConfiguracionNegocio` (servicios, horario, cierres, políticas) ni el que
  deriva el `ServiceCatalogEntry[]` que consume el NLP; hoy ambos viajan por
  parámetro y pueden desincronizarse.
- **Disponibilidad real**: sigue siendo una fase posterior (puerto/adaptador
  hacia Google Calendar); el validador solo comprueba el intervalo local.
- Decidir **dónde** vive la validación (propuesta: `src/core/booking/`) para que
  el motor no dependa de Calendar; la disponibilidad real se consultará en una
  fase posterior mediante un puerto/adaptador.

> Regla: no duplicar la lógica de rangos/zonas horarias de
> `booking-date-policy.ts` ni de `business-time.ts`; reutilizarla o extenderla.

## 7. Diferido (registrar, no implementar aún)

- **Manejo de confianza del motor**: cuando el mensaje sea ambiguo o los datos
  no sean suficientemente seguros, el bot debe **preguntar en lugar de asumir**.
  (Relacionado con `DocumentoInicial.md` § 8.3, 8.5 y 9.)

### Limitaciones actuales del NLP
- `a las 3` sin `am/pm` no produce hora (se resolverá por contexto).
- El catálogo de servicios llega por parámetro (`options.services`): todavía
  **no hay cargador de configuración**, así que el motor no lo obtiene solo.
  Hay **dos** catálogos que deben coincidir: `ServiceCatalogEntry[]` (lo que
  consume el NLP) y `ConfiguracionNegocio.services` (`Service[]`, lo que
  valida la reserva). El `id` del catálogo debe ser el mismo del servicio.
- `ConfiguracionNegocio.businessHours` es **obligatorio**: sin horario toda
  reserva se rechaza con `invalid-configuration`.
- Un solo servicio por mensaje (no hay lista de múltiples servicios).
- Una sola frase de fecha por mensaje.
- **No se extraen** nombre ni teléfono todavía (entidades del § 8.4 pendientes).
- La recurrencia se detecta pero **no se agenda**: todavía no existe el flujo
  que la convierte en reservas periódicas.
- El catálogo numerado ("1. Corte 2. Coloración") y las respuestas del
  cliente ("el segundo") **no están implementados**: los implementará la lógica
  conversacional, usando `ServiceMatch.candidates` cuando el resultado es
  `ambiguous`.

### Detección de intenciones: niveles de evidencia
La capa de intenciones ya **no conoce nombres de servicios**: el vocabulario
sectorial se eliminó de `synonyms.ts` y quedó reemplazado por marcos
(`intent-frames.ts`) que se rellenan con el catálogo del negocio.

| Nivel | Origen | Cuándo se usa |
| ----- | ------ | ------------- |
| 1 | `synonyms.ts` (expresiones generales) | Siempre; es la evidencia principal |
| 2 | `intent-frames.ts` con catálogo (`detectCatalogFrames`) | La ranura es un servicio configurado |
| 3 | `intent-frames.ts` genéricos (`detectGenericFrames`) | Solo como respaldo; nunca desplaza a los niveles 1 y 2 |

Reglas vigentes:
- Una mención de servicio **no** es una reserva: "quiero un corte" activa el
  marco de reserva, "¿cuánto cuesta el corte?" activa el de precios y
  "¿tienen corte?" el de servicios.
- Una consulta de precios **no** se convierte en reserva aunque mencione un
  servicio: los niveles 1 y 2 ganan a los niveles 3.
- Sin catálogo, los marcos genéricos son heurísticos ("quiero un/una X"): no
  saben qué servicios existen, por eso solo se reportan como intención
  secundaria y nunca desplazan a los niveles 1 y 2.
- La **resolución** del servicio (qué servicio es, si es ambiguo) sigue en
  `service-matcher.ts`; el detector solo decide la intención.

## 8. Higiene del repositorio

- Revisar `git status` antes de empezar: pueden existir cambios de otras
  sesiones sin commitear. No se debe asumir que lo que hay en disco está
  versionado.
- No subir `.wwebjs_auth/`, `.google_auth/`, `.env`, tokens ni credenciales
  (ver `.gitignore` y `Guia de Pruebas.md`).
- Antes de terminar una tarea: ejecutar `npm test` y `npm run build`.
