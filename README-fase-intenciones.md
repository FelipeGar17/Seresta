# Fase 3: procesamiento de mensajes e intenciones

## Avance actual

Esta fase ya cuenta con tipos de intención, normalización, sinónimos, reglas
de detección y una consola interactiva de prueba.

La fase 3 queda limitada a identificar qué quiere hacer el cliente. No extrae
fechas, horas, franjas horarias ni servicios. Por ejemplo, en “quiero una cita
mañana en la mañana” devuelve `book-appointment`, pero no convierte “mañana”
ni “en la mañana” en datos.

## Rutas incorporadas

| Ruta | Qué contiene |
| --- | --- |
| `src/core/types.ts` | Agrega `check-prices` y `goodbye` a `ConversationIntent`. |
| `src/core/nlp/normalize.ts` | Convierte mensajes escritos de formas distintas a un formato común. |
| `src/core/nlp/synonyms.ts` | Centraliza expresiones equivalentes en español. |
| `src/core/nlp/intent-detector.ts` | Devuelve la intención detectada sin conectarse a servicios externos. |
| `src/core/nlp/intent-console.ts` | Permite escribir mensajes libremente y ver la intención resultante. |
| `tests/core/nlp/normalize.test.ts` | Prueba la normalización. |
| `tests/core/nlp/intent-detector.test.ts` | Prueba las intenciones y prioridades. |

## Límites conocidos

- `sí, perfecto` devuelve `unknown` sin contexto. Para interpretarlo como una
  confirmación se necesitará conocer el estado de la conversación.
- Un mensaje como `quiero modificar mi cita antes de confirmarla` se clasifica
  como `reschedule-appointment`, pero la decisión final deberá considerar el
  estado de la conversación.
- Los errores ortográficos se toleran solo en los casos cubiertos por las
  reglas actuales; no se afirma que el detector corrija cualquier error.

## Próxima fase

La fase 4 implementará `entity-extractor.ts`. Allí se extraerán por separado
fechas relativas, franjas horarias, horas específicas y servicios.

Ejemplos:

| Mensaje | Datos esperados |
| --- | --- |
| `Quiero una cita mañana` | Fecha relativa: `mañana` |
| `Quiero una cita en la mañana` | Franja horaria: `mañana` |
| `Quiero una cita mañana en la mañana` | Fecha relativa y franja horaria |
| `Mañana a las 3 p. m.` | Fecha relativa y hora específica |

La fecha relativa deberá resolverse usando la zona horaria del negocio,
inicialmente `America/Bogota`, y no la zona horaria del servidor.

## Cómo funciona la normalización

La función `normalizeText`:

- convierte el texto a minúsculas;
- elimina tildes;
- reemplaza signos por espacios;
- reduce varios espacios a uno;
- elimina espacios al inicio y al final.

Por ejemplo:

```text
¡QUIÉRO una CÍTA! -> quiero una cita
```

## Probar desde PowerShell

```powershell
cd C:\Softw\SistemaDeGestionDeCitas_WhatsApp
npm test -- tests/core/nlp/normalize.test.ts
npm run build
```

La normalización es el primer paso del detector y se utiliza antes de aplicar
los sinónimos y las reglas de intención.

## Probar el detector escribiendo desde la consola

```powershell
cd C:\Softw\SistemaDeGestionDeCitas_WhatsApp
npm run intent:console
```

Después escribe mensajes, uno por línea:

```text
Mensaje> Hola, buenos días
Intención: greeting
Mensaje> ¿Cuánto cuesta el corte?
Intención: check-prices
Mensaje> Quiero cancelar mi cita
Intención: cancel-appointment
Mensaje> Gracias, hasta luego
Intención: goodbye
Mensaje> salir
Prueba finalizada.
```

Para ejecutar las pruebas automáticas:

```powershell
npm test -- tests/core/nlp
npm run build
```
