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

## Siguiente prueba

El siguiente paso es probar la conexión con Google Calendar, empezando por la
autorización y una consulta básica de disponibilidad.
