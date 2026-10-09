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
