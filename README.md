# Sistema de gestión de citas por WhatsApp

Aplicación local TypeScript para gestionar reservas por WhatsApp Web y
sincronizarlas con Google Calendar.

## Conectores y persistencia

- `src/connectors/whatsapp/` implementa `whatsapp-web.js` con `LocalAuth`.
- `src/connectors/google-calendar/` implementa OAuth local, consulta de agenda,
  creación idempotente y cancelación de eventos.
- `src/core/messaging/` guarda mensajes entrantes en una bandeja SQLite,
  conserva el orden FIFO por contacto y deduplica por ID de mensaje.
- `src/core/reservations/` mantiene las reservas locales y evita colisiones
  entre solicitudes concurrentes.

El runtime usa `src/index.ts`. La consola del coordinador conserva adaptadores
en memoria para pruebas locales; no representa una consulta real a Google
Calendar.

## Configuración manual del prototipo

1. Instala las dependencias con `npm install`.
2. Para esta configuración manual, crea un cliente OAuth de escritorio para
   Google Calendar y guarda el JSON como `.google_auth/client_secret.json`.
3. Configura el `calendarId` en `negocio.json`.
4. Autoriza la cuenta que tiene acceso a ese calendario y arranca:

```powershell
npm run calendar:auth
npm start
```

`npm start` compila y ejecuta el runtime. Valida `negocio.json` (o la ruta de
`BUSINESS_CONFIG_PATH`), verifica acceso real al calendario configurado y espera
a que WhatsApp esté listo y recupere la bandeja antes de anunciar que el sistema
inició. Si falta alguna configuración o conexión, el proceso termina con error.
En la primera conexión de WhatsApp muestra un QR; escanéalo y espera el mensaje
de sistema iniciado. `LocalAuth` conserva la sesión en `.wwebjs_auth/`. Las
credenciales OAuth se conservan en `.google_auth/tokens.json`.

Para aislar solo la base de datos local durante una prueba, configura
`SQLITE_DATABASE_PATH` antes de `npm start`. Esto **no** crea un WhatsApp ni un
Google Calendar de prueba: los conectores siguen usando las cuentas reales
configuradas.

`npm run dev` queda disponible para desarrollo con reinicio automático al
modificar archivos.

`npm start` compila en cada arranque, por lo que este flujo de instalación
manual requiere las dependencias de desarrollo instaladas. Para un instalador
de clientes se empaquetará el runtime y sus dependencias; no se pedirá al
cliente instalar Node/npm ni ejecutar `npm install`.

No subas `.google_auth/`, `.wwebjs_auth/`, `.wwebjs_cache/`, `.env`, `data/` ni
credenciales al repositorio; estas rutas están excluidas por `.gitignore`.

La bandeja SQLite conserva el ID y el estado de cada mensaje para deduplicar y
recuperar trabajo interrumpido. Al marcar una respuesta como enviada, elimina
el texto y los datos de contacto de esa fila. Si el proceso cae después de que
WhatsApp acepta una respuesta pero antes de guardar el acuse local, el reintento
puede entregar esa respuesta nuevamente (entrega al menos una vez).

## Modalidades del servicio y estado del producto

### Servicio local

- El runtime actual usa WhatsApp Web en un computador del negocio. Ese equipo
  debe permanecer encendido y el runtime iniciado para responder mensajes.
- Las citas confirmadas se guardan en la base SQLite local y en el calendario
  de Google elegido por ese negocio. El cliente autoriza su propia cuenta de
  Google y configura su `calendarId`; los negocios no comparten calendario.
- Cuando ya conoce el servicio y la fecha, el bot consulta Calendar y las
  reservas locales para indicar si hay horarios por la mañana, la tarde o la
  noche. Si la hora elegida está ocupada, propone hasta tres opciones cercanas
  y vuelve a comprobar la disponibilidad cuando el cliente elige una.
- También se puede consultar disponibilidad sin iniciar una reserva. Si falta
  el servicio o la fecha, el bot los solicita y conserva los datos al probar
  otro día. La consulta no crea una cita; para reservar, el cliente debe
  pedirlo explícitamente.
- Al consultar disponibilidad durante una reserva, el bot conserva el borrador
  y explica que necesita el servicio para calcular los horarios. «Salir» cancela
  el borrador sin crear una cita. Los horarios disponibles se presentan en
  líneas separadas por franja.
- Las respuestas se presentan en una sola burbuja por turno, con texto breve,
  emojis moderados y opciones numeradas. `1`, `2` y `3` solo se interpretan
  cuando el último mensaje mostró el menú de entrada; durante una reserva no
  sustituyen el dato que el bot está solicitando.
- En el primer turno, un saludo o un mensaje que no se entiende recibe una
  bienvenida. Si el primer mensaje ya contiene una solicitud reconocible, el
  bot la atiende directamente y conserva todos los datos que haya entendido.
- El usuario probó manualmente el flujo integrado: respuestas, creación y
  cancelación de citas, y rechazo de un bloque ocupado.
- `npm start` verifica el archivo de negocio, consulta Calendar y espera a que
  WhatsApp esté listo antes de anunciar el inicio. Esta es una forma de arranque
  para un equipo ya configurado, no un instalador de clientes.
- Pendiente: crear una aplicación Electron con asistente de configuración,
  autorización de Google, vinculación por QR, estado del runtime y un botón de
  inicio. El instalador deberá mantener base de datos, tokens y sesión de
  WhatsApp fuera de la carpeta de la aplicación, con copias de seguridad y
  migraciones seguras para que las actualizaciones no borren los datos.

### Google Calendar para clientes

- El proyecto OAuth de producción será administrado por el producto; cada
  negocio solo autorizará su cuenta y seleccionará su propio calendario. No se
  recomienda pedir a cada cliente que cree un proyecto en Google Cloud.
- Antes de ofrecerlo públicamente, revisar el estado de publicación OAuth y
  completar la verificación que Google requiera para el alcance de eventos de
  Calendar. En modo `Testing`, los usuarios deben estar autorizados como
  testers y los permisos offline para alcances distintos de perfil básico
  caducan a los siete días.
- Una reserva que primero consulta disponibilidad por franja requiere
  aproximadamente seis solicitudes a Calendar (cuatro consultas de
  disponibilidad, una comprobación idempotente y una creación), suponiendo una
  sola página de resultados y ningún reintento. Si el cliente proporciona la
  hora exacta desde el inicio, normalmente son cinco. El arranque añade una
  consulta de comprobación. Una consulta independiente de disponibilidad
  requiere normalmente una lectura por cada fecha revisada; al reservar
  después, la hora elegida se vuelve a consultar. Revisar las cuotas y
  condiciones de facturación vigentes antes de crecer:
  [cuotas de Google Calendar API](https://developers.google.com/workspace/calendar/api/guides/quota).

### WhatsApp Business alojado

- La integración oficial de WhatsApp Business Platform todavía no está
  implementada. La opción futura es alojar el motor en un servidor, recibir
  mensajes mediante webhooks y responder con Cloud API; el cliente no tendría
  que mantener un computador local encendido.
- Reutilizar el motor conversacional y añadir otro adaptador de mensajería. El
  servicio requerirá incorporar el número/cuenta de cada negocio, configurar
  webhooks y gestionar sus permisos y costos en Meta.
- Fuera de la ventana de atención de WhatsApp Business se requieren plantillas
  aprobadas; además, se deben respetar las reglas de consentimiento y mensajería
  de Meta. Consultar la
  [documentación oficial de Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform).

## Pendientes antes de ofrecer el producto

1. Reproducir el caso reportado en que una cita solicitada para un jueves quedó
   en el miércoles anterior. El parser ahora tiene una regresión para confirmar
   que “el jueves” sigue significando jueves aunque UTC ya haya cruzado
   medianoche; el desplazamiento observado todavía no está explicado.
2. Probar manualmente que una hora del mismo día que ya pasó se rechaza con una
   explicación clara y nunca se cambia automáticamente a otra fecha. La
   validación y el mensaje explícito ya están cubiertos por pruebas unitarias.
3. Preparar y verificar el consentimiento OAuth para usuarios externos antes
   de distribuir el runtime a varios negocios.
4. Diseñar el instalador local de Electron, incluyendo persistencia y
   actualización segura.
5. Diseñar la edición alojada con WhatsApp Business Platform, webhooks y
   aislamiento de datos por negocio.

## Validación

```powershell
npm run build
npm test
npm run test:gcal
```

`npm run test:gcal` ejecuta pruebas aisladas con un API simulado; no requiere
credenciales ni modifica un calendario real. La autorización OAuth requiere
Google Cloud y permisos locales. Las pruebas autenticadas de WhatsApp y
Calendar deben ejecutarse de forma manual y aislada.

Las pruebas manuales de WhatsApp Web existentes están en
[`tests/whatsapp-web/`](./tests/whatsapp-web/):

```powershell
npm run whatsapp:test
npm run whatsapp:message-test
```

La integración oficial de WhatsApp Business no está implementada; puede
añadirse como otro adaptador sin cambiar el coordinador ni la bandeja de
mensajes. Consulta el diseño en [`DocumentoInicial.md`](./DocumentoInicial.md)
y los requisitos en [`docs/product-spec.md`](./docs/product-spec.md).
