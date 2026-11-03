# Guía de pruebas

Ejecuta todos los comandos desde la carpeta del proyecto:

```powershell
cd C:\Softw\SistemaDeGestionDeCitas_WhatsApp
```

## 1. Manejo del repositorio

| Necesidad                             | Comando                          |
| ---                                   | ---                              |
| Revisar cambios y rama actual         | `git status`                     |
| Descargar cambios del equipo          | `git pull`                       |
| Ver diferencias antes de guardar      | `git diff`                       |
| Preparar todos los cambios            | `git add .`                      | 
| Guardar un commit local               | `git commit -m "mensaje claro"`  |
| Enviar commits a GitHub               | `git push`                       |  
| Enviar una rama nueva por primera vez | `git push -u origin nombre-rama` |
| Crear y cambiar a una rama            | `git switch -c nombre-rama`      |
| Cambiar a `main`                      | `git switch main`                |
| Ver los últimos commits               | `git log --oneline -10`          |

### Ciclo habitual

```powershell
git pull
# Trabajar y probar
git status
git add .
git commit -m "describe el cambio"
git push
```

`commit` guarda una versión en el repositorio local; `push` la publica en
GitHub. Antes de cambiar de rama o hacer `pull`, revisa `git status`.

No subas `.env`, credenciales, tokens ni `.wwebjs_auth/`. Si aparece un
conflicto, resuélvelo en VS Code antes de ejecutar el commit. No uses
`git push --force` en ramas compartidas.

## 2. Ejecución de WhatsApp Web

La prueba usa `whatsapp-web.js` con `LocalAuth`. La sesión se conserva en
`.wwebjs_auth/`, por lo que normalmente solo hay que escanear el QR la
primera vez.

| Necesidad | Comando |
| --- | --- |
| Instalar la biblioteca | `npm install whatsapp-web.js` |
| Compilar el proyecto | `npm run build` |
| Iniciar la prueba | `npm run whatsapp:test` |
| Probar lectura y respuesta | `npm run whatsapp:message-test` |
| Detener la prueba | `Ctrl+C` |
| Reiniciar y comprobar persistencia | `npm run whatsapp:test` |

### Primera ejecución

```powershell
npm run build
npm run whatsapp:test
```

Cuando aparezca el QR, escanéalo en **WhatsApp → Dispositivos vinculados →
Vincular un dispositivo**. La conexión correcta muestra:

```text
Sesión autenticada. Los datos se están guardando localmente.
Conexión lista para ...
```

### Prueba de reinicio

1. Detén el proceso con `Ctrl+C`.
2. Ejecuta de nuevo `npm run whatsapp:test`.
3. Comprueba que se autentica sin solicitar otro QR.

Si vuelve a pedir QR, revisa que exista `.wwebjs_auth/` y que no se haya
eliminado la carpeta de sesión.

### Prueba aislada de mensajes

```powershell
npm run whatsapp:message-test
```

Con la conexión lista, envía un mensaje directo a la cuenta vinculada. La
consola debe mostrar el mensaje detectado y WhatsApp debe responder:

```text
¡Hola! Recibí tu mensaje. Esta es una prueba aislada.
```

La prueba ignora los mensajes enviados por el propio bot, los grupos y los
newsletters para evitar respuestas no deseadas. Detén el proceso con `Ctrl+C`.

## 3. Pruebas unitarias de Google Calendar

Estas pruebas usan un API simulado y no requieren OAuth ni cambian calendarios:

```powershell
npm run test:gcal
```

## 4. Configuración de Google Calendar para el runtime

1. En Google Cloud habilita Google Calendar API y crea un cliente OAuth de
   escritorio.
2. Guarda las credenciales privadas en `.google_auth/client_secret.json`.
3. Configura el ID del calendario en `calendarId` dentro del JSON del negocio.
4. Autoriza la cuenta local:

```powershell
npm run calendar:auth
```

Abre la URL impresa, elige la cuenta que tiene acceso al calendario y acepta
el permiso. Los tokens quedan en `.google_auth/tokens.json`.

## 5. Arranque del runtime integrado

Desde PowerShell, la configuración `negocio.json` y la base predeterminada
`data/appointments.sqlite` se usan automáticamente:

```powershell
npm start
```

El comando compila, valida el archivo del negocio, realiza una consulta real a
Google Calendar y espera a que WhatsApp esté listo y la bandeja se haya
recuperado. Si la primera conexión de WhatsApp no tiene sesión, escanea el QR
y espera el mensaje `Sistema iniciado. Esperando mensajes de WhatsApp.` antes
de probar. Si una verificación falla, el proceso informa el error y no anuncia
el inicio.

Para una prueba que use una base SQLite separada:

```powershell
$env:BUSINESS_CONFIG_PATH = ".\negocio.json"
$env:SQLITE_DATABASE_PATH = ".\data\prueba-whatsapp.sqlite"
npm start
```

Esta separación solo aísla los datos SQLite. La conexión de WhatsApp y el
calendario configurado siguen siendo reales. Envía mensajes únicamente desde
otro teléfono y detén el proceso con `Ctrl+C` cuando termines.

## 6. Casos manuales recomendados

| Caso | Resultado esperado |
| --- | --- |
| Crear una cita en un hueco libre | Solo se confirma después de crear el evento en Calendar. |
| Crear un evento manual en el hueco pedido | El bot detecta la colisión y solicita otra hora. |
| Repetir el mismo mensaje de WhatsApp | El ID duplicado no crea un segundo turno ni evento. |
| Enviar dos mensajes consecutivos rápidamente desde el mismo contacto | Se procesan en orden y conservan el estado conversacional. |
| Enviar mensajes desde dos contactos distintos | Las colas se procesan independientemente. |
| Cancelar una cita confirmada | Se elimina el evento de Calendar antes de marcar la reserva local como cancelada. |
| Detener y reiniciar con mensajes pendientes | Se recupera la bandeja SQLite; una respuesta cuyo envío quedó sin acuse puede repetirse. |

No ejecutar simultáneamente el runtime integrado y las pruebas manuales de
mensajes de WhatsApp: ambos podrían responder al mismo chat.