CHATBOTCITAS
Documento maestro de planificación y desarrollo
Versión: 1.0
Fecha: 13 de octubre de 2026
Estado: Planificación y definición de arquitectura
Tecnologías principales: Node.js, TypeScript, WhatsApp, Google Calendar y SQLite.

1. DESCRIPCIÓN GENERAL DEL PROYECTO
ChatbotCitas es un chatbot diseñado para automatizar la gestión de citas a través de WhatsApp en pequeños negocios, especialmente barberías, peluquerías, salones de belleza y estilistas.
El objetivo es que los clientes puedan interactuar con el negocio mediante mensajes naturales, consultar servicios y precios, agendar citas, verificar reservas existentes, cancelar citas y recibir recordatorios automáticos.
El sistema se desarrollará inicialmente sin depender de inteligencia artificial generativa de pago. En su lugar, utilizará un motor propio de procesamiento del lenguaje basado en reglas, patrones, sinónimos, extracción de datos y administración del contexto conversacional.
La arquitectura se diseñará de manera modular para que, en el futuro, sea posible migrar desde una aplicación local a una solución alojada en la nube sin tener que reconstruir todo el motor conversacional.
1.1. Objetivos principales
- Automatizar la atención de clientes mediante WhatsApp.
- Facilitar la programación de citas sin intervención constante del personal.
- Evitar reservas duplicadas y conflictos de horarios.
- Consultar la disponibilidad real del calendario del negocio.
- Permitir que los servicios, precios y duraciones se modifiquen sin alterar el código.
- Mantener un historial de las reservas necesarias para el funcionamiento del sistema.
- Enviar recordatorios de citas.
- Mantener una arquitectura que permita incorporar nuevos canales de comunicación y funciones en el futuro.
- Reducir los costos iniciales mediante tecnologías accesibles y librerías gratuitas cuando sean adecuadas.
1.2. Público objetivo inicial
El producto estará orientado inicialmente a micro, pequeñas y medianas empresas (MIPES), especialmente:
- Barberías.
- Peluquerías.
- Salones de belleza.
- Estilistas independientes.
- Otros negocios que trabajen mediante citas.
La primera versión se enfocará en un negocio individual con un número de WhatsApp, un calendario y un profesional. Sin embargo, el diseño debe permitir incorporar varios profesionales y calendarios en futuras versiones.

2. ALCANCE DEL PROYECTO POR ETAPAS
El desarrollo se dividirá en etapas para evitar construir todo el sistema simultáneamente.
2.1. Primera etapa: versión local
La primera versión funcionará desde el computador del negocio.
Incluirá:
- Motor conversacional propio.
- Procesamiento del lenguaje mediante reglas.
- Integración con WhatsApp mediante whatsapp-web.js.
- Integración con Google Calendar.
- Configuración del negocio mediante archivos JSON.
- Gestión de conversaciones.
- Gestión de reservas.
- Control de disponibilidad.
- Confirmación de citas.
- Consulta y cancelación de reservas.
- Recordatorios.
- Almacenamiento persistente mediante SQLite.
- Limpieza controlada de datos antiguos.
Los adaptadores en memoria se utilizan para pruebas unitarias.
La consola local del motor usa SQLite para persistir conversaciones y reservas; la integración con Google Calendar se mantiene para una fase posterior.
2.2. Segunda etapa: versión local estable
Una vez completadas las funciones principales, se trabajará en:
- Pruebas integrales.
- Manejo de errores.
- Recuperación ante fallos.
- Prevención de citas duplicadas.
- Protección de credenciales.
- Copias de seguridad.
- Instalación y configuración simplificadas.
- Posible empaquetado como aplicación ejecutable.
La distribución definitiva como ejecutable todavía debe definirse.
2.3. Tercera etapa: versión en la nube
En una etapa futura se contempla desarrollar una versión alojada en la nube.
Esta versión podría incorporar:
- Meta WhatsApp Business Cloud API.
- Recepción de mensajes mediante webhooks HTTPS.
- Base de datos alojada en un servidor.
- Ejecución continua sin depender del computador del negocio.
- Administración remota.
- Posibilidad de gestionar varios negocios.
- Panel administrativo.
- Sistema de suscripciones y licencias.
La versión en la nube no debe requerir duplicar el motor conversacional. La diferencia principal debe estar en los adaptadores de comunicación, la infraestructura y la persistencia.

3. TECNOLOGÍAS PRINCIPALES
3.1. Node.js
Node.js será el entorno de ejecución del backend.
Se utilizará para:
- Procesar los mensajes recibidos.
- Ejecutar las reglas del chatbot.
- Gestionar las conversaciones.
- Consultar Google Calendar.
- Crear y administrar reservas.
- Ejecutar los procesos de recordatorios.
- Gestionar la persistencia de datos.
- Coordinar los diferentes componentes.
La versión concreta de Node.js se seleccionará al configurar el proyecto, priorizando una versión LTS compatible con las librerías elegidas.
3.2. TypeScript
TypeScript será el lenguaje principal del proyecto.
Permitirá definir estructuras de datos, contratos e interfaces para reducir errores y mantener el código organizado.
Se utilizará para representar elementos como:
- Conversaciones.
- Reservas.
- Servicios.
- Configuración del negocio.
- Intenciones.
- Entidades extraídas.
- Estados conversacionales.
- Interfaces de almacenamiento.
- Contratos de integración con servicios externos.
La definición explícita de tipos facilitará el mantenimiento y la incorporación de nuevas funcionalidades.
3.3. whatsapp-web.js
whatsapp-web.js será la primera tecnología de integración con WhatsApp.
Se utilizará para:
- Recibir mensajes.
- Identificar los chats y contactos disponibles.
- Enviar respuestas automáticas.
- Mantener la comunicación entre el cliente y el motor conversacional.
La librería actuará como adaptador de comunicación. No debe contener la lógica completa del negocio ni decidir por sí sola cómo se gestiona una reserva.
Antes de distribuir la aplicación se deberán validar las condiciones de uso, la estabilidad operativa y las limitaciones de automatizar WhatsApp Web.
En la futura versión alojada se evaluará Meta WhatsApp Business Cloud API.
3.4. Google Calendar API
Google Calendar será la herramienta externa utilizada para consultar disponibilidad y gestionar los eventos de las citas.
Funciones previstas:
- Consultar eventos existentes.
- Comprobar si un horario está disponible.
- Evitar solapamientos entre citas.
- Crear eventos.
- Verificar que un evento se haya creado correctamente.
- Consultar citas existentes.
- Modificar o cancelar eventos.
- Utilizar los identificadores de los eventos para relacionarlos con las reservas internas.
La primera versión utilizará un calendario por negocio.
El sistema debe diseñarse de forma que posteriormente se puedan asociar diferentes calendarios a distintos profesionales.
3.5. JSON
Los archivos JSON se utilizarán para almacenar la configuración editable del negocio.
La configuración podrá incluir:
- Identificador del negocio.
- Nombre del negocio.
- Zona horaria.
- Número de WhatsApp.
- Identificador del calendario.
- Servicios.
- Precios.
- Duraciones.
- Estado activo o inactivo de cada servicio.
- Métodos de pago.
- Otras opciones que se incorporen posteriormente.
Esto permitirá modificar los datos comerciales sin cambiar el código fuente.
3.6. SQLite
SQLite es la base de datos local de la primera versión persistente.
La implementación actual usa `better-sqlite3` y conserva:
- Borradores conversacionales con vencimiento de 10 minutos y contexto de cierre de 1 minuto después de confirmar; los registros vencidos se depuran al iniciar.
- Reservas confirmadas y canceladas, con sus estados y fechas.
- El identificador de contacto de WhatsApp como identidad de búsqueda.
El teléfono es un campo separado: un identificador `@lid` no debe interpretarse como número celular.
La base predeterminada está en `data/appointments.sqlite`; se puede cambiar con `SQLITE_DATABASE_PATH`. La carpeta `data/` no se versiona.
Google Calendar, los eventos y los recordatorios todavía no están integrados.
3.7. Almacenamiento en memoria
Los adaptadores en memoria se conservan para pruebas unitarias aisladas.
La consola local del coordinador usa SQLite para que las conversaciones y las citas sobrevivan al cierre del proceso.
3.8. Librerías auxiliares
Las librerías auxiliares se incorporan cuando existe una necesidad concreta.
`better-sqlite3` se utiliza para la persistencia SQLite local. Otras categorías que podrían requerirse son:
- Validación de datos y configuraciones.
- Manejo de fechas y zonas horarias.
- Pruebas automatizadas.
- Registro de errores y eventos.
- Autenticación y conexión con Google Calendar.
- Empaquetado de la aplicación.
Antes de incorporar una librería se verificará su compatibilidad, mantenimiento, licencia y costo.
No se considera aprobada todavía una librería específica para NLP.

4. PRINCIPIOS DE ARQUITECTURA
La arquitectura se basará en los siguientes principios.
4.1. Modularidad
Cada componente tendrá una responsabilidad definida.
Por ejemplo, el componente encargado de interpretar mensajes no debe ser responsable de crear directamente eventos en Google Calendar.
De igual manera, el adaptador de WhatsApp no debe decidir qué datos faltan para una reserva.
4.2. Separación del motor y los servicios externos
El motor conversacional debe funcionar independientemente de WhatsApp y Google Calendar.
Esto permitirá probar la lógica del chatbot sin necesidad de conectarse a servicios externos.
4.3. Interfaces y adaptadores
Las conexiones externas se realizarán mediante interfaces o contratos definidos.
Por ejemplo:
- Un adaptador implementará la comunicación con WhatsApp.
- Otro componente implementará las operaciones de Google Calendar.
- Los almacenes de datos implementarán los contratos de persistencia.
En el futuro se podrán sustituir los adaptadores sin reconstruir el motor.
4.4. Separación de la configuración y el código
Los datos propios de cada negocio estarán fuera del código fuente.
Los precios, servicios, duraciones y otros parámetros no deben quedar escritos directamente dentro de las reglas del chatbot.
4.5. Preparación para la escalabilidad
Aunque la primera versión será sencilla, se tendrán en cuenta desde el comienzo:
- Identificadores de negocio.
- Identificadores de contacto.
- Identificadores de reservas.
- Identificadores de calendario.
- Separación entre lógica de negocio y persistencia.
- Posibilidad de múltiples profesionales.
- Posibilidad de diferentes canales de WhatsApp.
Esto no significa implementar todas esas funciones desde el inicio, sino evitar decisiones que hagan costosa su incorporación posterior.

5. ESTRUCTURA DE CARPETAS PROPUESTA
La estructura inicial del proyecto se organizará de la siguiente manera.
ChatbotCitas/
│
├── src/
│   │
│   ├── core/
│   │   ├── types.ts
│   │   │
│   │   ├── conversation/
│   │   │   ├── store.ts
│   │   │   ├── memory-store.ts
│   │   │   └── sqlite-store.ts
│   │   │
│   │   ├── nlp/
│   │   │   ├── normalize.ts
│   │   │   ├── intent-detector.ts
│   │   │   ├── entity-extractor.ts
│   │   │   └── synonyms.ts
│   │   │
│   │   └── booking/
│   │       ├── booking-service.ts
│   │       └── booking-validator.ts
│   │
│   ├── ports/
│   │   ├── messaging.ts
│   │   ├── calendar.ts
│   │   └── reservation-store.ts
│   │
│   ├── connectors/
│   │   └── whatsapp/
│   │       └── whatsapp-web.ts
│   │
│   ├── calendar/
│   │   └── google-calendar.ts
│   │
│   ├── config/
│   │   └── load-config.ts
│   │
│   ├── persistence/
│   │   └── reservation-repository.ts
│   │
│   └── tests/
│
├── config/
│   └── negocio.json
│
├── data/
│   └── chatbot.db
│
├── docs/
│
├── package.json
├── tsconfig.json
└── README.md


Esta estructura es una propuesta de referencia, no una distribución definitiva. Los nombres y las ubicaciones podrán ajustarse durante la implementación, siempre que se mantenga la separación de responsabilidades.
5.1. Descripción de los componentes
src/core/types.ts
Contendrá los tipos compartidos por los diferentes módulos: conversaciones, reservas, servicios, intenciones, estados y configuración.
src/core/conversation/
Gestionará el contexto de las conversaciones y las interfaces para almacenar, recuperar y eliminar conversaciones.
src/core/nlp/
Contendrá el procesamiento de lenguaje: normalización, reconocimiento de intenciones, extracción de entidades y sinónimos.
src/core/booking/
Coordinará el flujo de reservas, la validación de datos y las reglas del proceso de agendamiento.
src/ports/
Definirá los contratos que deben cumplir los adaptadores y los componentes de almacenamiento.
src/connectors/whatsapp/
Gestionará la recepción y el envío de mensajes a través de WhatsApp.
src/calendar/
Contendrá la integración con Google Calendar.
src/config/
Cargará y validará los archivos de configuración del negocio.
src/persistence/
Agrupará las implementaciones y utilidades de persistencia que no deban formar parte del motor conversacional.
src/tests/
Contendrá pruebas automatizadas. Se debe elegir una única convención para ubicar las pruebas y mantenerla durante el proyecto.
config/
Contendrá archivos JSON de configuración separados del código fuente.
data/
Contendrá la base de datos local y otros datos operativos. Los datos reales y las credenciales no deben publicarse en el repositorio.
docs/
Contendrá documentación técnica, instrucciones de instalación y decisiones de arquitectura.

6. MODELOS DE DATOS
Los modelos de datos representan las entidades principales del sistema.
Los siguientes campos constituyen una definición conceptual inicial y podrán ajustarse durante la implementación.
6.1. Conversación
Representa el contexto temporal de una interacción con un cliente.
Campos previstos:
- id: identificador interno de la conversación.
- businessId: identificador del negocio.
- contactoId: identificador utilizado para recuperar la conversación del contacto.
- whatsappId: identificador recibido desde WhatsApp.
- intencion: intención principal detectada.
- etapa: etapa actual de la conversación.
- datos: información recopilada para la reserva.
- datosPendientes: campos que todavía faltan.
- ultimoMensajeBotEn: momento del último mensaje enviado por el bot.
- ultimaRespuestaClienteEn: momento de la última respuesta del cliente.
- vencimientoEn: momento a partir del cual expira el contexto.
La conversación es temporal. Su función es recordar qué está intentando hacer el cliente y qué información ya ha proporcionado.
6.2. Datos de reserva durante una conversación
Mientras se recopila información, se utilizará una estructura con los siguientes campos:
- servicioId
- fecha
- hora
- nombre
- telefono
Los campos serán opcionales durante la recopilación porque el cliente no necesariamente proporcionará toda la información en un solo mensaje.
El sistema deberá identificar qué datos están disponibles y cuáles faltan.
6.3. Reserva
Representa una cita registrada.
Campos previstos:
- id: identificador interno de la reserva.
- businessId: negocio al que pertenece.
- contactoId: contacto relacionado.
- servicioId: servicio reservado.
- nombreCliente: nombre del cliente.
- telefonoCliente: teléfono del cliente.
- inicio: fecha y hora de inicio.
- fin: fecha y hora de finalización.
- estado: estado de la reserva.
- calendarId: identificador del calendario.
- eventoGoogleCalendarId: identificador del evento en Google Calendar.
- creadaEn: fecha de creación del registro.
El sistema deberá calcular el campo fin usando la duración configurada para el servicio.
Las reservas confirmadas no se eliminarán simplemente porque expire la conversación que las originó.
6.4. Servicio
Representa un servicio ofrecido por el negocio.
Campos previstos:
- id
- nombre
- duracionMinutos
- precio
- activo
Ejemplo conceptual:
Un servicio de corte de cabello puede tener una duración de 30 minutos y un precio definido por el negocio.
Si se modifica su duración o precio en la configuración, el motor debe utilizar los nuevos valores sin necesidad de modificar su código.
6.5. Configuración del negocio
Representa los parámetros que definen cómo funciona el chatbot para un negocio específico.
Campos previstos:
- businessId
- nombre
- zonaHoraria
- whatsappNumero
- calendarId
- servicios
- metodosPago
La zona horaria inicial prevista para Colombia será America/Bogota.

7. CONFIGURACIÓN DEL NEGOCIO MEDIANTE JSON
La configuración se almacenará en un archivo externo al código fuente.
Ejemplo ilustrativo:
{
  "businessId": "negocio-001",
  "nombre": "Barbería Ejemplo",
  "zonaHoraria": "America/Bogota",
  "whatsappNumero": "numero-configurado",
  "calendarId": "id-del-calendario",
  "servicios": [
    {
      "id": "corte",
      "nombre": "Corte de cabello",
      "aliases": ["corte"],
      "duracionMinutos": 30,
      "precio": 25000,
      "activo": true
    },
    {
      "id": "barba",
      "nombre": "Arreglo de barba",
      "duracionMinutos": 20,
      "precio": 15000,
      "activo": true
    }
  ],
  "horariosAtencion": {
    "monday": [
      { "abreA": "08:00", "cierraA": "18:00" }
    ]
  },
  "cierres": [
    { "fecha": "2026-12-25", "motivo": "Festivo" }
  ],
  "politicaReservas": {
    "anticipacionMinimaMinutos": 60,
    "maximoDiasAnticipacion": 10,
    "intervaloAgendaMinutos": 30
  },
  "metodosPago": [
    "efectivo",
    "transferencia"
  ]
}


Los valores son ejemplos y no representan la configuración definitiva de ningún negocio.
7.1. Reglas de configuración
- Los servicios deben tener identificadores únicos.
- Los precios y las duraciones deben validarse.
- Los servicios inactivos no deben ofrecerse para nuevas reservas.
- El calendario y la zona horaria deben estar definidos correctamente.
- El programa debe comprobar la configuración al iniciarse.
- Si falta un dato obligatorio o existe un error de configuración, el sistema debe mostrar un error claro en lugar de continuar con datos incorrectos.
- `src/config/load-config.ts` transforma explícitamente estas claves externas en el modelo interno TypeScript (`name`, `timezone`, `services`, `businessHours`, `closures` y `bookingPolicy`).
- Los horarios de atención son obligatorios para aceptar reservas.
- Cada día puede definir varios intervalos. Para cerrar al almuerzo, por ejemplo, se configuran `09:00–12:00` y `14:00–19:00`; el motor rechaza citas que caigan en la pausa o que no alcancen a terminar antes del cierre del tramo.
- Los días no laborables y reglas de anticipación se configuran mediante `cierres` y `politicaReservas`.
- `politicaReservas.intervaloAgendaMinutos` define la rejilla de inicio de la agenda. Es un entero positivo entre 1 y 1440; si se omite, se usa 30 minutos. Se acepta el alias superior `intervaloAgendaMinutos`, pero no puede contradecir al valor de la política.

8. PROCESAMIENTO DEL LENGUAJE NATURAL SIN IA GENERATIVA DE PAGO
El chatbot no se desarrollará inicialmente como un asistente generalista.
Su dominio será limitado: gestionar citas y responder preguntas relacionadas con los servicios del negocio.
Esto permite utilizar reglas y patrones sin necesidad de contratar un modelo de IA generativa.
8.1. Normalización del texto
Antes de interpretar un mensaje, el sistema normalizará su contenido.
Podrá incluir:
- Conversión a minúsculas cuando corresponda.
- Eliminación de espacios innecesarios.
- Normalización de signos y formatos.
- Reconocimiento de variantes frecuentes.
- Tratamiento controlado de errores ortográficos comunes.
La normalización debe evitar alterar indebidamente nombres propios, teléfonos u otros datos importantes.
8.2. Reconocimiento de sinónimos
Se definirán sinónimos y expresiones equivalentes.
Por ejemplo, un cliente puede expresar su intención de reservar utilizando distintas frases:
- Quiero agendar una cita.
- Quiero reservar.
- ¿Tienes espacio mañana?
- Necesito un turno.
- ¿Me puedes atender por la tarde?
El sistema deberá reconocer expresiones que correspondan a una misma intención.
Las reglas se podrán ampliar con ejemplos reales y pruebas.
8.3. Detección de intenciones
El sistema clasificará los mensajes según la intención detectada.
Las intenciones iniciales serán:
- saludo
- agendar_cita
- consultar_cita
- cancelar_cita
- consultar_servicios
- consultar_precios
- despedida
- desconocida
La clasificación podrá basarse en palabras clave, patrones, sinónimos y reglas de prioridad.
Cuando no exista suficiente certeza, el sistema deberá solicitar una aclaración en lugar de asumir una intención incorrecta.
En el primer mensaje de una conversación, si se detecta un saludo o no se reconoce ninguna intención, el bot responderá con una bienvenida cordial y las opciones disponibles. Si el primer mensaje expresa claramente que quiere agendar, consultar servicios/precios o cancelar, se atenderá esa intención directamente, sin interponer un saludo.
8.4. Extracción de entidades
Además de detectar la intención, el motor deberá identificar los datos mencionados en el mensaje.
Las entidades iniciales serán:
- Servicio.
- Fecha.
- Hora.
- Nombre.
- Teléfono.
El sistema debe intentar extraer varios datos en un solo mensaje.
Por ejemplo, si un cliente dice que desea un corte mañana a las tres de la tarde y proporciona su nombre, el bot no debe volver a preguntarle los datos que ya reconoció correctamente.
8.5. Mejora progresiva del NLP
El procesamiento se mejorará gradualmente mediante:
1. Identificación de mensajes que no se reconocen correctamente.
2. Análisis de las expresiones utilizadas por los clientes.
3. Incorporación de sinónimos y reglas.
4. Creación de pruebas para los casos nuevos.
5. Ajuste de las reglas que generen errores.
Los mensajes utilizados para mejorar el sistema deberán anonimizarse cuando contengan información personal.

9. INTENCIONES, ENTIDADES Y ESTADOS CONVERSACIONALES
Es importante diferenciar estos tres conceptos.
9.1. Intenciones
Indican qué quiere hacer el cliente.
Ejemplos:
- Agendar una cita.
- Consultar un precio.
- Cancelar una reserva.
9.2. Entidades
Son los datos concretos mencionados por el cliente.
Ejemplos:
- Servicio: corte de cabello.
- Fecha: mañana.
- Hora: 3:00 p. m.
- Nombre: nombre proporcionado por el cliente.
9.3. Estados conversacionales
Indican en qué punto del proceso se encuentra el cliente.
Estados iniciales propuestos:
recopilando_datos
El bot está obteniendo los datos necesarios para completar la reserva.
consultando_disponibilidad
El bot está verificando el horario solicitado.
esperando_confirmacion
El bot ya tiene los datos necesarios y espera que el cliente confirme la reserva.
finalizada
La operación conversacional ha terminado.
Estos estados representan la etapa general del flujo. Más adelante se definirán las transiciones exactas entre ellos y las condiciones para cada transición.
Una intención no es lo mismo que un estado. Por ejemplo, el cliente puede consultar un precio mientras la conversación sigue en el estado recopilando_datos.

10. FLUJO CONVERSACIONAL DE AGENDAMIENTO
El flujo de reservas será flexible y permitirá que el cliente proporcione información de diferentes maneras.
10.1. Inicio
El cliente envía un mensaje por WhatsApp.
El adaptador de WhatsApp entrega el mensaje al motor conversacional junto con los identificadores disponibles del chat o contacto.
El motor busca una conversación vigente o crea una nueva.
10.2. Interpretación del mensaje
El motor procesa el mensaje para identificar:
- La intención.
- Los datos proporcionados.
- La etapa actual.
- Los campos que todavía faltan.
Si el cliente ya proporcionó varios datos, estos se guardan en el contexto.
10.3. Recopilación de información
El sistema solicitará únicamente los datos que falten.
Los datos principales son:
- Servicio.
- Fecha.
- Hora.
- Nombre.
- Teléfono.
No será necesario seguir una secuencia rígida si el cliente proporciona varios datos simultáneamente.
10.4. Consultas durante una reserva
El cliente podrá realizar preguntas intermedias.
Por ejemplo, durante el agendamiento puede preguntar cuánto cuesta un servicio o qué otros servicios están disponibles.
El bot deberá:
1. Reconocer la pregunta.
2. Consultar la configuración del negocio.
3. Responder.
4. Mantener los datos ya recopilados.
5. Regresar al campo pendiente de la reserva.
Esto evita que el cliente tenga que comenzar de nuevo cada vez que hace una consulta adicional.
10.5. Verificación de disponibilidad
Cuando se disponga de un servicio, una fecha y una hora concretos, el sistema consultará Google Calendar.
Calculará la duración total de la cita según la configuración del servicio.
Si el servicio dura 30 minutos y la hora solicitada es las 3:00 p. m., el sistema verificará el intervalo completo de 3:00 p. m. a 3:30 p. m.
No basta con comprobar que la hora de inicio esté libre.
El inicio solicitado debe pertenecer a la rejilla del negocio: se alinea con la apertura de la franja de atención según `intervaloAgendaMinutos`. Si no está alineado, se explica al cliente y no se redondea en silencio.
Si el servicio dura 45 minutos con un intervalo de 30, la cita termina realmente a las 3:45 p. m. pero bloquea hasta las 4:00 p. m.; la siguiente cita puede empezar a las 4:00 p. m.
10.6. Solicitud de confirmación
Cuando el horario esté disponible, el bot presentará un resumen con los datos de la reserva y solicitará una primera confirmación explícita.
Después de esa respuesta, volverá a mostrar el resumen, advertirá que una cita confirmada no se puede modificar y solicitará una segunda confirmación explícita.
Solo la segunda confirmación crea la reserva definitiva. Si el cliente cambia un dato en cualquiera de las dos etapas, el sistema actualizará la solicitud, volverá a validar la agenda y reiniciará la confirmación desde el primer resumen.
Una vez creada la cita, el bot enviará el resumen y recordará que solo se puede cancelar. El contexto conversacional esperará un agradecimiento o una respuesta equivalente por un minuto; al recibirla o vencer ese plazo, se cierra el contexto sin afectar la cita confirmada.
10.7. Creación de la reserva
Después de la segunda confirmación:
1. Se vuelve a comprobar la disponibilidad.
2. Se crea el evento en Google Calendar.
3. Se verifica que el evento se haya creado correctamente.
4. Se guarda la reserva en el almacenamiento local.
5. Se relaciona la reserva con el identificador del evento.
6. Se informa al cliente del resultado.
La secuencia exacta de recuperación ante errores deberá diseñarse antes de considerar terminado el servicio de reservas.

11. DISPONIBILIDAD Y CONTROL DE SOLAPAMIENTOS
La disponibilidad se determinará consultando Google Calendar.
11.1. Duración de los servicios
Cada servicio tendrá una duración configurada.
El sistema calculará automáticamente la hora de finalización real.
Esto permitirá que servicios diferentes ocupen intervalos distintos.
El espacio bloqueado se calcula en bloques completos de `intervaloAgendaMinutos`: `ceil(duracion / intervalo)`. La duración real no se redondea en el resumen ni en la reserva; solo se redondea el final ocupado que impide el siguiente inicio.
Un servicio debe comenzar y terminar realmente dentro de una misma franja de atención; no puede invadir un descanso ni superar el cierre.
Las reservas existentes también bloquean sus bloques completos. Sin una fuente real de disponibilidad no se ofrecen alternativas: la consulta a Google Calendar sigue siendo una fase pendiente.
11.2. Prevención de reservas duplicadas
Antes de crear una reserva, el sistema debe comprobar que no exista un evento que ocupe el intervalo solicitado.
También deberá considerar citas que comiencen antes o después de la hora solicitada, pero que se solapen con ella.
11.3. Segunda comprobación
La disponibilidad debe comprobarse nuevamente inmediatamente antes de crear el evento.
Esto es importante porque otra persona podría ocupar el horario después de la primera consulta.
11.4. Horarios no disponibles
Si el horario está ocupado, el sistema deberá comunicarlo y ofrecer alternativas disponibles cuando sea posible.
Las alternativas deben provenir de la disponibilidad real del calendario, no de horarios inventados.
11.5. Horarios de atención
Además de revisar Google Calendar, el sistema deberá considerar:
- Horario de apertura.
- Horario de cierre.
- Días de atención.
- Días no laborables.
- Duración del servicio.
- Intervalo de agenda (`intervaloAgendaMinutos`).
- Anticipación mínima permitida.
- Reglas especiales del negocio.
La estructura exacta de estos parámetros todavía debe definirse.

12. CONSISTENCIA ENTRE GOOGLE CALENDAR Y EL ALMACENAMIENTO LOCAL
Google Calendar y la base local cumplen funciones relacionadas, pero no constituyen una única transacción.
Por tanto, el sistema debe contemplar fallos parciales.
12.1. Secuencia prevista
La operación normal será:
1. Validar los datos.
2. Comprobar disponibilidad.
3. Solicitar confirmación al cliente.
4. Volver a comprobar disponibilidad.
5. Crear el evento en Google Calendar.
6. Verificar el evento creado.
7. Guardar la reserva local.
8. Informar el resultado.
12.2. Recuperación ante errores
La verificación del evento no garantiza por sí sola que todo el proceso se haya completado.
Por ejemplo, Google Calendar podría crear el evento correctamente, pero SQLite podría fallar al guardar la reserva.
En ese caso, el sistema no debe volver a crear el evento sin comprobar primero si ya existe.
Se deberá diseñar un mecanismo de recuperación que contemple:
- Identificación de operaciones.
- Reintentos controlados.
- Prevención de duplicados.
- Localización de eventos creados.
- Reconciliación entre Calendar y la base local.
- Registro de errores para facilitar el diagnóstico.
El mecanismo concreto de idempotencia y recuperación queda pendiente de diseño.
12.3. Cancelaciones y modificaciones
La misma precaución se aplicará a las cancelaciones y reprogramaciones.
El sistema deberá evitar que una operación quede aplicada en Google Calendar, pero no reflejada correctamente en el almacenamiento local, sin posibilidad de recuperación.

13. IDENTIFICACIÓN DEL CONTACTO Y GESTIÓN DE DATOS
El sistema distinguirá los identificadores de WhatsApp de los datos personales del cliente.
Se conservarán conceptualmente tres datos separados:
Identificador interno del contacto
Se utilizará para localizar el contexto conversacional y relacionar operaciones.
Identificador de WhatsApp
Será el identificador recibido a través de la integración. Su formato y estabilidad deberán verificarse durante las pruebas.
Teléfono del cliente
Será el teléfono guardado para las necesidades de contacto y las reservas.
No se asumirá que el identificador de chat o mensaje es siempre un número de teléfono convencional.
La prueba aislada observó `message.from` con un valor `@lid`. El runtime usa ese valor como `contactId` y mantiene separado el `contact.id._serialized`; solo guarda `contact.number` si la biblioteca lo informa. La estabilidad de estos valores debe confirmarse ejecutando la prueba manual con la sesión local.
Los datos personales y las credenciales deberán mantenerse protegidos. No se publicarán números reales de clientes, tokens ni credenciales en el repositorio.

14. EXPIRACIÓN DE CONVERSACIONES
Las conversaciones temporales tendrán una duración limitada.
14.1. Tiempo de expiración
Se ha acordado una ventana exacta de 10 minutos para cada borrador y conversación activa.
El vencimiento se calcula desde el último mensaje recibido y se renueva con cada mensaje. El contexto posterior a la creación de una cita es una excepción: espera una respuesta de cierre por un minuto.
14.2. Renovación del tiempo
Cada mensaje entrante de una conversación activa actualiza `expiresAt` a `now + 10 minutos`, excepto el contexto posterior a confirmar, que conserva su vencimiento de un minuto.
14.3. Conversaciones expiradas
Si el cliente no responde dentro del plazo, el contexto temporal vence y la consola/runtime local elimina los registros vencidos al iniciar.
Si el cliente vuelve a escribir después de la expiración, el bot inicia una conversación nueva sin reutilizar los datos anteriores.
14.4. Separación de las reservas
La expiración de una conversación no elimina una cita confirmada.
Las conversaciones representan el proceso de interacción; las reservas representan operaciones registradas.
Por tanto, deben tener ciclos de vida independientes.

15. LIMPIEZA AUTOMÁTICA DE DATOS
Se ha planteado una política de limpieza para evitar que el almacenamiento local crezca indefinidamente.
15.1. Conversaciones
Las conversaciones temporales expiradas se eliminan al iniciar la consola o el runtime local.
15.2. Reservas antiguas
Las reservas con estado `cancelled` se conservan 15 días desde `cancelledAt` y después se depuran al iniciar el runtime local.
Las reservas confirmadas no se eliminan mediante esta política.
15.3. Google Calendar
La eliminación de registros locales no eliminará automáticamente los eventos de Google Calendar.
Si se necesita limpiar eventos antiguos del calendario, se utilizará un procedimiento independiente, como un script o comando manual.
Esta separación evita borrar información externa de forma accidental.

16. RECORDATORIOS DE CITAS
El sistema incluirá un mecanismo para revisar las citas próximas y enviar recordatorios.
16.1. Funcionamiento
El proceso deberá:
- Consultar las reservas relevantes.
- Identificar las citas que requieren un recordatorio.
- Enviar el mensaje al contacto correspondiente.
- Registrar el envío para evitar duplicados.
- Actualizar el estado del recordatorio.
El tiempo exacto de anticipación del recordatorio todavía debe definirse.
16.2. Recuperación al iniciar
Como la primera versión funcionará localmente, el computador o el programa podrían estar apagados en el momento previsto para enviar un recordatorio.
Por esta razón, el sistema deberá revisar las citas relevantes al iniciar y ejecutar comprobaciones periódicas mientras esté funcionando.
La recuperación deberá considerar qué recordatorios todavía tienen sentido y cuáles ya vencieron.
16.3. Prevención de duplicados
Cada reserva debe tener un identificador único.
También se deberá registrar el estado de los recordatorios para que reiniciar el programa no provoque el envío repetido de un mismo mensaje.
16.4. Dependencia de la ejecución local
La versión local no podrá garantizar que los mensajes se envíen mientras el computador o el programa estén apagados.
La operación continua será una de las ventajas de la futura versión en la nube.

17. INTERFACES Y ALMACENAMIENTO DE CONVERSACIONES
Para mantener la arquitectura modular, el almacenamiento se definirá mediante una interfaz.
17.1. ConversationStore
ConversationStore será el contrato para almacenar y recuperar conversaciones.
Operaciones previstas:
get(id)
Recupera una conversación por su identificador.
getByContact(businessId, contactoId)
Busca la conversación correspondiente a un contacto dentro de un negocio.
save(conversacion)
Guarda una conversación nueva o actualiza una existente.
delete(id)
Elimina una conversación específica.
deleteExpired(now)
Elimina las conversaciones cuyo vencimiento ya pasó y devuelve la cantidad eliminada.
El contrato se ubicará tentativamente en:
src/core/conversation/store.ts
La ruta definitiva deberá respetar la ubicación real del archivo types.ts.
17.2. MemoryConversationStore
Implementa el contrato para pruebas unitarias aisladas; los datos se pierden al cerrar el proceso.
17.3. SQLiteConversationStore
Implementa `ConversationStore` para el motor local y cumple el mismo contrato que `MemoryConversationStore`.
La reserva persistente se implementa en `src/core/reservations/sqlite-reservation-repository.ts`.
17.4. ReservationStore
`ReservationRepository` ya está implementado con adaptadores en memoria y SQLite.
Permite crear idempotentemente, recuperar por id, listar citas confirmadas futuras por contacto, actualizar y depurar cancelaciones antiguas.

18. INTEGRACIÓN CON WHATSAPP
La comunicación local se implementa mediante `whatsapp-web.js` en `src/index.ts`.
El adaptador será responsable de:
- Recibir mensajes.
- Obtener los identificadores disponibles del contacto o chat.
- Entregar los mensajes al motor conversacional.
- Enviar las respuestas generadas por el motor.
- Comunicar los errores de envío al sistema para su tratamiento.
No deberá contener las reglas completas del flujo de citas.
El runtime implementa esta separación; falta validar el flujo completo mediante una sesión local autenticada.
18.1. Separación del canal
El motor conversacional deberá recibir mensajes mediante una interfaz común, independientemente del proveedor de WhatsApp.
Esto permitirá incorporar en el futuro otro adaptador basado en Meta WhatsApp Business Cloud API.
18.2. Migración futura
La versión alojada podrá cambiar el canal de comunicación sin duplicar:
- El NLP.
- Los modelos de datos.
- La lógica de disponibilidad.
- El flujo de reserva.
- Las reglas de confirmación.
- La lógica general de negocio.
La integración futura requerirá adaptar la recepción y el envío de mensajes, así como las necesidades de operación y despliegue.

19. INTEGRACIÓN CON GOOGLE CALENDAR
El componente de Google Calendar concentrará las operaciones relacionadas con el calendario externo.
Funciones previstas:
- Autenticarse con Google.
- Consultar eventos.
- Comprobar disponibilidad.
- Crear eventos.
- Verificar la creación de eventos.
- Recuperar eventos mediante sus identificadores.
- Modificar eventos.
- Cancelar eventos.
Las credenciales no deben escribirse directamente en el código ni publicarse en el repositorio.
Se deberá definir un método adecuado de autenticación y almacenamiento de credenciales antes de conectar el sistema a un calendario real.
Durante el desarrollo se recomienda utilizar un calendario de prueba para evitar modificar las citas reales del negocio.

20. METODOLOGÍA DE DESARROLLO
El proyecto se desarrollará de manera incremental.
Cada componente se definirá, implementará y probará antes de avanzar a integraciones más complejas.
20.1. Principios de trabajo
- Definir primero los modelos de datos.
- Establecer los contratos entre módulos.
- Mantener separadas las responsabilidades.
- Implementar primero las funciones internas.
- Evitar integrar todos los servicios externos al mismo tiempo.
- Probar cada componente de forma aislada.
- Añadir pruebas para los errores detectados.
- Documentar las decisiones importantes.
- Evitar introducir librerías sin una necesidad clara.
- No dar por terminada una función únicamente porque funciona en el caso ideal.
20.2. Pruebas del NLP
Se probarán:
- Saludos.
- Solicitudes de reserva.
- Consultas de precios.
- Consultas de servicios.
- Mensajes con varios datos.
- Mensajes ambiguos.
- Errores ortográficos frecuentes.
- Mensajes que no se puedan interpretar.
- Preguntas realizadas durante una reserva.
20.3. Pruebas de conversación
Se probarán:
- Inicio de una conversación.
- Recuperación del contexto.
- Actualización de los datos.
- Conservación de información después de una pregunta intermedia.
- Identificación de datos pendientes.
- Expiración de los 15 minutos.
- Inicio de un nuevo contexto después de la expiración.
- Separación entre el contexto temporal y una reserva confirmada.
20.4. Pruebas de reservas
Se probarán:
- Horarios disponibles.
- Horarios ocupados.
- Servicios de distintas duraciones.
- Solapamientos.
- Cambios en los datos antes de confirmar.
- Confirmaciones explícitas.
- Rechazos de confirmación.
- Fallos al crear eventos.
- Fallos al guardar en la base de datos.
- Recuperación ante eventos creados que todavía no estén registrados localmente.
- Cancelaciones y modificaciones.

21. HOJA DE RUTA DE DESARROLLO
La secuencia prevista es la siguiente.
Fase 1. Planificación y arquitectura
Definir el alcance, las tecnologías, los componentes y los principios de diseño.
Estado: en consolidación mediante este documento.
Fase 2. Definición de modelos de datos
Definir los tipos TypeScript para:
- Conversaciones.
- Reservas.
- Servicios.
- Configuración.
- Intenciones.
- Estados.
Estado: definición conceptual inicial realizada; falta validarla al implementarla.
Fase 3. Definición de interfaces
Crear los contratos para:
- Almacenamiento de conversaciones.
- Almacenamiento de reservas.
- Comunicación por mensajes.
- Operaciones de calendario.
Estado: ConversationStore está planteado. Los demás contratos están pendientes de definición completa.
Fase 4. Almacenamiento en memoria
Implementar la primera versión de MemoryConversationStore.
Probar la recuperación, actualización y eliminación de conversaciones.
Estado: siguiente paso de implementación, todavía sin código.
Fase 5. Procesamiento del lenguaje
Desarrollar:
- Normalización.
- Sinónimos.
- Detección de intenciones.
- Extracción de entidades.
- Reglas de interpretación.
- Pruebas automatizadas.
Estado: pendiente.
Fase 6. Motor conversacional
Desarrollar el componente que administra el contexto, identifica los datos pendientes y coordina el flujo.
Estado: completada para el flujo local de creación y cancelación de citas.
Fase 7. Persistencia con SQLite
Incorporar almacenamiento persistente y definir las reglas de limpieza de datos.
Estado: completada para conversaciones y reservas locales. La consola elimina borradores vencidos y cancelaciones con más de 15 días al iniciar.
Fase 8. Servicio de reservas
Implementar la coordinación de:
- Validación de datos.
- Consulta de disponibilidad.
- Confirmación del cliente.
- Creación de eventos.
- Verificación.
- Persistencia.
- Recuperación ante fallos.
Estado: parcial. El motor local valida y confirma citas y permite cancelarlas; disponibilidad real y sincronización con Google Calendar siguen pendientes.
Fase 9. Integración con Google Calendar
Conectar el servicio de reservas con un calendario de prueba.
Estado: pendiente.
Fase 10. Integración con WhatsApp
Incorporar el adaptador whatsapp-web.js para recibir mensajes y enviar respuestas.
Estado: implementada en `src/index.ts`; pendiente de prueba manual autenticada con el identificador `@lid` real.
Fase 11. Recordatorios y mantenimiento
Desarrollar la revisión periódica de citas, el control de recordatorios y la limpieza de datos.
Estado: pendiente.
Fase 12. Pruebas integrales y distribución
Validar el funcionamiento completo, documentar la instalación y evaluar el empaquetado local.
Estado: pendiente.
Fase 13. Evolución hacia la nube
Incorporar Meta WhatsApp Business Cloud API, infraestructura remota y operación continua.
Estado: futuro.

22. DECISIONES PENDIENTES
Aunque el diseño general está establecido, existen aspectos que deben concretarse durante las siguientes etapas.
1. Seleccionar las versiones exactas de Node.js y TypeScript.
2. Definir las librerías auxiliares para validación, fechas, pruebas, registros y SQLite.
3. Definir el método de autenticación con Google Calendar.
4. Definir cómo se protegerán y renovarán las credenciales.
5. Establecer los horarios de atención y los días no laborables.
6. Definir las reglas de anticipación mínima para reservar.
7. Definir el comportamiento cuando el cliente solicita una hora fuera del horario de atención.
8. Establecer las reglas de cancelación y reprogramación.
9. Definir el tiempo de anticipación de los recordatorios.
10. Diseñar el mecanismo de recuperación e idempotencia entre Google Calendar y SQLite.
11. Definir qué información debe conservarse para evitar borrar datos necesarios.
12. Validar el comportamiento real de los identificadores de contacto en whatsapp-web.js.
13. Definir el procedimiento de copias de seguridad y recuperación.
14. Confirmar el método de empaquetado y actualización de la aplicación local.
15. Seleccionar la infraestructura de nube cuando se desarrolle esa versión.
Estas decisiones se tomarán cuando corresponda, evitando anticipar complejidad que no sea necesaria para la primera versión.

23. CRITERIOS DE ÉXITO DE LA PRIMERA VERSIÓN
La primera versión se considerará funcional cuando cumpla los siguientes criterios:
- Reciba mensajes de WhatsApp y responda correctamente.
- Reconozca las intenciones iniciales relacionadas con las citas.
- Identifique los datos proporcionados por el cliente.
- Acepte varios datos en un mismo mensaje.
- Mantenga el contexto durante una conversación.
- Responda consultas sobre servicios y precios sin perder el avance de una reserva.
- Solicite únicamente los datos necesarios que falten.
- Consulte Google Calendar antes de proponer una reserva.
- Considere la duración completa de los servicios.
- Evite solapamientos.
- Solicite confirmación explícita antes de crear una cita.
- Vuelva a comprobar la disponibilidad antes de crear el evento.
- Verifique la creación del evento y guarde la reserva local.
- Contemple la recuperación ante errores para evitar duplicados.
- Expire los contextos temporales según la regla de 15 minutos.
- Mantenga las reservas confirmadas independientes de las conversaciones.
- Envíe recordatorios sin duplicarlos.
- Persista los datos necesarios mediante SQLite.
- Permita modificar la configuración del negocio sin cambiar el código.
- Mantenga la lógica central separada del adaptador de WhatsApp.

24. PRINCIPIOS QUE DEBEN MANTENERSE DURANTE TODO EL DESARROLLO
Para conservar la coherencia del proyecto, se establecen los siguientes principios:
1. El motor conversacional no dependerá directamente de WhatsApp.
WhatsApp será un canal de comunicación, no el lugar donde residan las reglas del negocio.
2. La lógica de reservas no dependerá directamente del tipo de almacenamiento.
El sistema podrá utilizar memoria durante el desarrollo, SQLite en la versión local y una base de datos remota en la futura versión en la nube.
3. Los servicios y sus precios serán configurables.
No se escribirán precios ni duraciones fijas dentro del motor conversacional.
4. Las conversaciones y las reservas serán entidades independientes.
Una conversación puede expirar sin que una cita confirmada deje de existir.
5. Las reservas deberán validarse antes de confirmarse.
La disponibilidad se comprobará utilizando el calendario real y la duración configurada del servicio.
6. Los errores externos deben formar parte del diseño.
La integración con Google Calendar y el almacenamiento local deberá contemplar operaciones incompletas, reintentos y recuperación.
7. El NLP se desarrollará de manera incremental.
Se comenzará con reglas sencillas y se mejorará mediante pruebas y ejemplos reales, sin incorporar complejidad innecesaria.
8. Las funciones futuras no deben complicar innecesariamente la primera versión.
Se preparará una arquitectura extensible, pero se implementará primero lo necesario para que el sistema local de citas funcione correctamente.

25. RESUMEN DEL ESTADO ACTUAL
A fecha del 13 de octubre de 2026, el proyecto se encuentra en la fase de planificación técnica y definición de arquitectura.
Se han definido conceptualmente:
- El propósito y el alcance inicial del producto.
- Las tecnologías principales.
- La separación entre el motor y los adaptadores.
- La estructura de carpetas de referencia.
- Los modelos principales de datos.
- Las intenciones y los estados iniciales.
- El enfoque de NLP sin IA generativa de pago.
- El flujo de agendamiento.
- La integración prevista con Google Calendar.
- El uso inicial de almacenamiento en memoria y la posterior migración a SQLite.
- Las reglas de expiración de conversaciones.
- La política propuesta de limpieza de datos.
- El funcionamiento general de los recordatorios.
- La hoja de ruta por fases.
El contrato ConversationStore ya se ha planteado conceptualmente, pero todavía no se ha comenzado la implementación del código.