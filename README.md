# Sistema de gestión de citas por WhatsApp

Proyecto TypeScript para experimentar con un sistema de reservas por
WhatsApp.

## Estado de las pruebas

### WhatsApp Web

Se verificó correctamente que `whatsapp-web.js` puede:

- iniciar WhatsApp Web y autenticarse mediante QR;
- conservar la sesión local con `LocalAuth`;
- recuperar la sesión después de cerrar y reiniciar el proceso;
- leer mensajes entrantes;
- responder mensajes directos;
- ignorar mensajes propios, grupos y canales/newsletters en la prueba aislada.

Las pruebas manuales están en
[`tests/whatsapp-web/`](./tests/whatsapp-web/).

Para ejecutarlas:

```powershell
npm run whatsapp:test
npm run whatsapp:message-test
```

La sesión local se guarda en `.wwebjs_auth/`. No se debe subir al repositorio.

### Google Calendar

Las pruebas aisladas de Google Calendar fueron satisfactorias:

- autorización OAuth y carga de tokens;
- consulta de disponibilidad;
- inserción de un evento de calendario.

Scripts disponibles:

```powershell
npm run test:gcal-auth
npm run test:gcal
```

### Flujo integrado WhatsApp + Google Calendar

También se validó satisfactoriamente el flujo completo en
[`src/experiments/whatsapp-calendar-test.ts`](./src/experiments/whatsapp-calendar-test.ts):

1. iniciar WhatsApp Web y mostrar el QR;
2. autenticar y conservar la sesión local;
3. recibir un mensaje directo de otro usuario;
4. saludar y solicitar la palabra `prueba`;
5. leer la respuesta;
6. buscar un horario disponible;
7. crear la cita en Google Calendar;
8. confirmar la reserva por WhatsApp.

Para ejecutarlo:

```powershell
npm run test:wa-gcal
```

Las pruebas realizadas hasta ahora fueron manuales y no reportaron errores.
Los detalles de alcance, datos y casos de prueba están en
[`docs/product-spec.md`](./docs/product-spec.md).

## Próximos pasos

1. Formalizar el producto: casos de uso, requisitos, escenarios de prueba,
   datos configurables y datos que deben solicitarse a cada cliente.
2. Definir el proceso de alta y configuración de cada empresa que compre el
   bot.
3. Investigar y decidir la integración con la plataforma oficial de WhatsApp
   Business; las preguntas y fuentes iniciales están en
   [`docs/whatsapp-business-api-research.md`](./docs/whatsapp-business-api-research.md).
4. Separar el motor de conversación, la agenda y los adaptadores de
   mensajería antes de iniciar la implementación del producto.
