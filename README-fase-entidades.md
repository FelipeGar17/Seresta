# Fase 4: extracción de entidades

## Objetivo

Separar la intención de los datos concretos del mensaje. La intención indica
qué quiere hacer el cliente; las entidades indican datos como fecha, hora,
franja horaria o servicio.

La fase 4 no reemplazará al detector de intenciones. Ambos componentes
trabajarán de forma independiente:

- `intent-detector.ts`: identifica la acción solicitada.
- `entity-extractor.ts`: extrae los datos escritos por el cliente.

## Archivo que se implementará

| Ruta | Responsabilidad |
| --- | --- |
| `src/core/nlp/entity-extractor.ts` | Extraer fechas relativas, franjas horarias, horas específicas y servicios. |

## Ejemplos esperados

| Mensaje | Intención | Entidades |
| --- | --- | --- |
| `Quiero una cita mañana` | `book-appointment` | Fecha relativa: `mañana` |
| `Quiero una cita en la mañana` | `book-appointment` | Franja horaria: `mañana` |
| `Quiero una cita mañana en la mañana` | `book-appointment` | Fecha relativa y franja horaria |
| `¿Hay espacio mañana en la tarde?` | `check-availability` | Fecha relativa y franja horaria |
| `Mañana a las 3 p. m.` | Depende del mensaje completo | Fecha relativa y hora específica |

## Reglas importantes

- `mañana` representa una fecha relativa, no una hora.
- `hoy` representa una fecha relativa.
- `en la mañana` y `en la tarde` representan franjas horarias.
- `a las 3 p. m.` representa una hora específica.
- `mañana a las 3 p. m.` contiene una fecha y una hora.
- Extraer una entidad no debe cambiar la intención detectada.
- No se deben inventar datos que el cliente no escribió.
- Las fechas relativas se resolverán usando la zona horaria del negocio,
  inicialmente `America/Bogota`.
- La fecha actual debe obtenerse en el momento del mensaje; no se usarán
  fechas fijas ni la zona horaria del servidor.

## Pruebas previstas

Se crearán pruebas automatizadas para:

- fechas relativas;
- franjas horarias;
- horas específicas;
- combinaciones de fecha y hora;
- servicios escritos en el mensaje;
- mensajes sin entidades;
- separación entre intención y entidades.

La fase 4 no conectará todavía WhatsApp, Google Calendar ni una base de datos.
