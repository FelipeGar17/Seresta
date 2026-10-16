# Instrucciones para Copilot

## Comandos del proyecto

Ejecuta los comandos desde la raíz del repositorio:

```powershell
npm install
npm run build
npm test
```

- `npm run build`: compila TypeScript con `tsconfig.json` en modo estricto y
  genera la salida en `dist/`.
- `npm test`: ejecuta toda la suite con Vitest.
- `npm test -- tests/core/nlp/intent-detector.test.ts`: ejecuta un archivo de
  pruebas específico.
- `npm test -- tests/core/nlp`: ejecuta las pruebas del núcleo NLP.
- `npm run test:watch`: ejecuta Vitest en modo interactivo.
- `npm run intent:console`: abre la consola manual para escribir mensajes y
  ver intención, puntaje, coincidencias y entidades.
- `npm run whatsapp:test` y `npm run whatsapp:message-test`: ejecutan pruebas
  manuales de WhatsApp Web y requieren la sesión local correspondiente.
- `npm run test:gcal-auth` y `npm run test:gcal`: ejecutan las pruebas
  manuales de Google Calendar y requieren credenciales OAuth locales.
- `npm run test:wa-gcal`: ejecuta el flujo integrado WhatsApp + Google
  Calendar. Revisa `Guia de Pruebas.md` antes de usarlo.

No hay un script de lint configurado. Usa `npm run build`, Vitest y los
diagnósticos de TypeScript como validación del código.

## Arquitectura

El proyecto separa el motor central de los servicios externos:

- `src/core/types.ts` contiene los contratos compartidos: conversaciones,
  reservas, servicios, estados, intenciones y entidades extraídas.
- `src/core/conversation/store.ts` define `ConversationStore`; las
  implementaciones no deben conocer WhatsApp, Google Calendar ni la interfaz
  de usuario.
- `src/core/conversation/memory-store.ts` implementa el almacenamiento temporal
  con `Map`. Es reemplazable por SQLite cuando se implemente persistencia.
- `src/core/nlp/normalize.ts` separa la normalización para intención de la
  normalización para extracción. La primera puede ser agresiva; la segunda
  debe conservar datos como `ñ`, fechas con `/` y horas con `:`.
- `src/core/nlp/synonyms.ts` mantiene las frases de intención y sus
  negaciones; no mezcles reglas de negocio ni llamadas a servicios externos
  allí.
- `src/core/nlp/intent-detector.ts` determina qué quiere hacer el cliente.
  `detectIntentDetailed` también devuelve texto normalizado, puntaje y frases
  coincidentes para diagnóstico.
- `src/core/nlp/date-parser.ts` interpreta fechas relativas usando la zona
  horaria del negocio, por defecto `America/Bogota`.
- `src/core/nlp/entity-extractor.ts` extrae servicio, fecha, hora y franja
  horaria. No debe cambiar la intención ni inventar datos faltantes.
- `src/core/nlp/intent-console.ts` es una herramienta manual local; no es el
  flujo productivo de WhatsApp.
- `tests/core/` contiene pruebas unitarias del núcleo. `tests/whatsapp-web/`
  contiene pruebas manuales de integraciones externas.

El flujo esperado para un mensaje es:

1. normalizar el mensaje según el propósito;
2. detectar la intención;
3. reutilizar el texto normalizado cuando se extraigan entidades;
4. guardar el estado mediante el contrato de conversación;
5. delegar WhatsApp o Google Calendar a adaptadores externos.

La intención y las entidades son responsabilidades diferentes: `mañana` es
una fecha relativa y `en la mañana` es una franja horaria.

## Convenciones específicas

- El proyecto usa ESM (`"type": "module"`). En imports locales TypeScript usa
  extensiones `.js`, aunque el archivo fuente sea `.ts`.
- Mantén `strict: true` y evita `any` o conversiones que oculten errores.
- Los nombres de tipos, clases, funciones y archivos permanecen en inglés
  para seguir la convención actual; los comentarios y la documentación del
  proyecto están en español.
- Los comentarios deben explicar secciones o decisiones no obvias, no
  describir cada línea.
- Las reglas NLP deben usar frases normalizadas y fronteras de palabra; no
  uses `includes` para clasificar palabras cortas dentro de palabras mayores.
- Las negaciones explícitas deben impedir que una regla positiva se active.
  Las respuestas aisladas como `sí`, `no` u `ok` necesitan contexto de la
  última pregunta del bot.
- `detectIntent` devuelve solo la intención; usa `detectIntentDetailed` para
  logs y diagnóstico.
- `ExtractedEntities` usa campos opcionales: si el cliente no proporciona un
  dato, debe quedar `undefined`.
- No conviertas una franja horaria en una hora concreta ni una fecha relativa
  en una fecha fija sin recibir `now` y la zona horaria del negocio.
- `ConversationStore.get` y `getByContact` devuelven `null` cuando no hay
  resultado. `deleteExpired` devuelve la cantidad eliminada.
- `ReservationStatus.pending` representa una reserva provisional; solo
  `confirmed` debe usarse después de la aceptación del cliente y la creación
  del evento definitivo.
- No agregues SQLite, WhatsApp, Google Calendar ni IA generativa al núcleo NLP
  o al almacenamiento en memoria.
- Al cambiar una regla NLP, agrega casos positivos, negativos, ambiguos y de
  prioridad en `tests/core/nlp/`.
- Mantén actualizados los README de fase cuando cambies rutas, comandos,
  límites o comportamiento observable. Los README actuales son
  `README-fase-conversaciones.md`, `README-fase-intenciones.md` y
  `README-fase-entidades.md`.
- No subas `.env`, `.google_auth/`, `.wwebjs_auth/`, `.wwebjs_cache/`, tokens,
  credenciales ni datos locales.

## Prueba manual del motor

Para revisar el flujo sin WhatsApp:

```powershell
npm run intent:console
```

Escribe un mensaje por línea. Para probar respuestas dependientes del
contexto, primero escribe `/bot ¿Confirmas esta cita?` y luego `sí`. Termina
con `salir`.
