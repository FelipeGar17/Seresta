# Fase: conversaciones en memoria

## Objetivo cumplido

Esta fase permite probar el ciclo básico de una conversación sin conectar
WhatsApp, Google Calendar ni una base de datos.

Los datos viven solamente mientras el programa está encendido. Al detenerlo,
se pierden de forma intencional.

## Rutas incorporadas

| Ruta | Qué contiene |
| --- | --- |
| `src/core/types.ts` | Los tipos de conversación, datos de reserva, reserva y negocio. |
| `src/core/conversation/store.ts` | El contrato que cualquier almacenamiento debe cumplir. |
| `src/core/conversation/memory-store.ts` | El almacenamiento temporal usando un `Map` en memoria. |
| `tests/core/conversation/memory-store.test.ts` | Pruebas de guardar, buscar, actualizar y eliminar conversaciones. |

## Operaciones disponibles

- `save`: guarda una conversación nueva o reemplaza la versión anterior con
  el mismo identificador.
- `get`: busca una conversación por su identificador. Si no existe, devuelve
  `null`.
- `getByContact`: busca la conversación activa de un contacto dentro de un
  negocio. Ignora conversaciones vencidas, completadas, canceladas o marcadas
  como expiradas.
- `update`: actualiza una conversación existente, incluyendo `data`, que usa
  `ReservationData` para guardar de forma tipada el nombre, servicio y horario
  recopilados del cliente.
- `delete`: elimina una conversación por su identificador.
- `deleteExpired`: elimina las conversaciones cuyo `expiresAt` ya pasó y
  devuelve cuántas eliminó.

Guardar otra conversación con el mismo `id` reemplaza la anterior y mantiene
una sola entrada. El almacenamiento no modifica los datos por su cuenta ni
envía mensajes.

## Probar desde la consola

Ejecuta estos comandos desde la carpeta del proyecto:

```powershell
cd C:\Softw\SistemaDeGestionDeCitas_WhatsApp
npm install
npm test -- tests/core/conversation/memory-store.test.ts
npm run build
```

El primer comando instala las dependencias si todavía no están instaladas.
El segundo ejecuta únicamente las pruebas de esta fase. El tercero confirma
que el código TypeScript compila correctamente.

Para ejecutar todas las pruebas del proyecto:

```powershell
npm test
```

El resultado esperado de esta fase es que todas las pruebas terminen en
`passed` y que `npm run build` finalice sin errores.

En `ReservationStatus`, `pending` representa una reserva todavía provisional:
el cliente aún debe aceptar y el evento definitivo todavía no se ha creado o
confirmado. `confirmed` se usa después de completar esos dos pasos.

El siguiente avance de la fase 3 está documentado en
[`README-fase-intenciones.md`](./README-fase-intenciones.md).
