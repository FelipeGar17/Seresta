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

Estado actual (cierre de Fase 4): **87/87 pruebas pasan, `npm run build` limpio.**

> Nota: los scripts `dev`, `test:gcal-auth`, `test:gcal`, `test:wa-gcal` de
> `package.json` apuntan a `src/index.ts` / `src/experiments/*`, que **no
> existen**. Las pruebas manuales reales están en `tests/whatsapp-web/`.

## 3. Numeración de fases (usada en el trabajo diario)

| Fase | Alcance | Estado |
| ---- | ------- | ------ |
| 1 | Tipos y modelos (`src/core/types.ts`) | Completada |
| 2 | Normalización de texto (`normalize.ts`) | Completada |
| 3 | Detección de intenciones (`intent-detector.ts` + `synonyms.ts`) | Completada |
| 4 | Extracción de entidades (`entity-extractor.ts` + `date-parser.ts`) | **Completada** |
| 5 | Validación de reservas | **Siguiente — sin empezar** |

Ojo: esta numeración **no** coincide con la hoja de ruta del `DocumentoInicial.md`
(ahí "Fase 5" es NLP). Usar siempre esta tabla para el trabajo diario.

## 4. Mapa de archivos y puntos de entrada

### Núcleo
- `src/core/types.ts` — tipos compartidos: `ConversationIntent`,
  `ConversationState`, `ReservationStatus`, `ReservationData`,
  `ExtractedEntities`, `Conversation`, `Reservation`, `Service`,
  `ConfiguracionNegocio`.

### NLP (`src/core/nlp/`)
- `normalize.ts` — `normalizeText`, `normalizeForExtraction`, `normalizeIntent`,
  `splitEmojis`.
- `synonyms.ts` — `intentSynonyms` e `intentNegations` por intención.
- `intent-detector.ts` — reglas `RULES` (el orden define prioridad),
  `detectIntent`, `detectIntentDetailed` (devuelve `intents[]` y
  `negatedIntents`), respuesta corta contextual de confirmación.
- `entity-extractor.ts` — `extractEntities` (servicio, fecha relativa, fecha,
  hora y franja horaria). `SERVICE_NAMES` al inicio del archivo.
- `date-parser.ts` — `parseRelativeDate` (hoy, mañana, pasado mañana, días de
  semana, `el próximo X`).
- `intent-console.ts` — herramienta manual (`npm run intent:console`).

### Reservas y conversación
- `src/core/booking/booking-date-policy.ts` — `isBookingDateAllowed`:
  **única validación de reservas existente hoy** (rango hoy → +6 días,
  fechas inválidas, zona horaria).
- `src/core/conversation/store.ts` — contrato `ConversationStore`.
- `src/core/conversation/memory-store.ts` — implementación en memoria.

### Pruebas
- `tests/core/nlp/` — `normalize`, `intent-detector`, `entity-extractor`,
  `date-parser` (pruebas unitarias de Fases 2–4).
- `tests/core/booking/booking-date-policy.test.ts` — validación de fechas.
- `tests/core/conversation/memory-store.test.ts`.
- `tests/whatsapp-web/` — **solo verificación aislada de librerías**
  (WhatsApp/Calendar). No importar desde `src/`.

## 5. Dónde empezar a corregir si algo de una fase previa falla

1. Correr `npm test`; Vitest indica archivo y caso exacto.
- Buscar el comportamiento en este orden según el caso:
  - **Intención mal detectada** → `intent-detector.ts` (orden de `RULES`) y
    `synonyms.ts` (listas de cada intención).
  - **Entidad mal extraída (servicio/fecha/hora)** → `entity-extractor.ts`
    (`SERVICE_NAMES`, `extractTime`, `extractTimeOfDay`, regex de fecha) y
    `date-parser.ts` (interpretación de fechas relativas).
  - **Texto mal normalizado** → `normalize.ts`.
  - **Tipo/estructura de datos** → `types.ts`.
- Añadir/ajustar la prueba en `tests/core/nlp/*` y reejecutar `npm test`.

### Convención de fechas (importante)
`parseRelativeDate` devuelve una **fecha calendario a medianoche UTC**
(`Date.UTC(year, month, day)`). No reinterpretar con `toISOString()` local.
La comparación con "hoy" en la zona del negocio la hace `booking-date-policy.ts`.

### Trampas conocidas
- `synonyms.ts` sufrió en su momento una expansión masiva externa que rompió
  reglas aprobadas. Reglas a preservar:
  - `no gracias` **no** es rechazo sin contexto → debe resolver `thanks`.
  - Los afirmativos genéricos (`ok`, `listo`, `perfecto`, `sale`, `claro`,
    `dale`, `de acuerdo`, `está bien`…) **no** deben ser sinónimos
    incondicionales de `confirm-appointment`; eso se maneja de forma
    contextual (el bot acaba de preguntar confirmación).
  - Tras cualquier edición de sinónimos: ejecutar `npm test`.
- `vitest.config.ts` excluye `dist/` de la suite.
- No importar nada de `tests/` dentro de `src/`.

## 5. Fase 5 — Validación de reservas (siguiente paso)

Objetivo: decidir **qué se valida antes de confirmar** una reserva, sin
duplicar lo que ya existe. Revisar primero qué hay (sección anterior) y qué
falta.

### Ya existe
- `isBookingDateAllowed(requestedDate, { now, timeZone })` —
  `src/core/booking/booking-date-policy.ts`:
  - rechaza fechas inválidas y anteriores a hoy;
  - permite hoy hasta `today + 6 días` (`MAX_BOOKING_DAYS_AHEAD`);
  - usa el día local del negocio (`America/Bogota` por defecto);
  - probada en `tests/core/booking/booking-date-policy.test.ts`.

### Falta por definir/implementar (candidatos)
- Validación de **servicio**: que exista, esté `active: true` en la
  configuración y tenga `durationMinutes`/`price` válidos.
- Validación de **hora y franja**: formato ya normalizado por el extractor;
  falta contrastar con horario de apertura/cierre y días de atención.
- Cálculo de **`endsAt`** a partir de `startsAt + durationMinutes`.
- Reglas de **anticipación mínima** y **días no laborables** (estructura aún
  sin definir; ver secciones 11.5 y 22 de `DocumentoInicial.md`).
- **Completitud** de `ReservationData` (qué campos faltan) — hoy los campos son
  opcionales y no hay una función que calcule el pendiente.
- Decidir **dónde** vive la validación (propuesta: `src/core/booking/`) para que
  el motor no dependa de Calendar; la disponibilidad real se consultará en una
  fase posterior mediante un puerto/adaptador.

> Regla: no duplicar la lógica de rangos/zonas horarias de
> `booking-date-policy.ts`; reutilizarla o extenderla.

## 6. Diferido (registrar, no implementar aún)

- **Manejo de confianza del motor**: cuando el mensaje sea ambiguo o los datos
  no sean suficientemente seguros, el bot debe **preguntar en lugar de asumir**.
  (Relacionado con `DocumentoInicial.md` § 8.3, 8.5 y 9.)

### Limitaciones actuales del NLP (documentadas en Fase 4)
- `a las 3` sin `am/pm` no produce hora (se resolverá por contexto).
- Día de semana sin artículo (`para lunes`) no se extrae; se exige `el <día>`.
- Días recurrentes (`los martes`) no se extraen.
- `SERVICE_NAMES` es una lista fija (`corte`, `corte de pelo`, `manicure`,
  `pedicure`, `barberia`, `peinado`); falta cargarla desde la configuración.
- Un solo `serviceName` por mensaje (no hay lista de múltiples servicios).
- **No se extraen** nombre ni teléfono todavía (entidades del § 8.4 pendientes).

## 7. Higiene del repositorio

- Hay cambios sin commitear de las fases 3–4 (`git status`): no se debe asumir
  que ya están versionados.
- No subir `.wwebjs_auth/`, `.env`, tokens ni credenciales
  (ver `.gitignore` y `Guia de Pruebas.md`).
- Antes de terminar una tarea: ejecutar `npm test` y `npm run build`.
