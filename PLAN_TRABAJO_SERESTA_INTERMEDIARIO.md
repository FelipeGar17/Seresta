# Plan de trabajo: Seresta Intermediario

**Estado:** alcance de producto acordado en lo principal; hoja de ruta ágil
lista para iniciar decisiones bloqueantes y prueba técnica. Cloudflare se
probará primero, pero no se ha elegido alojamiento de producción.  
**Última actualización:** 8 de noviembre de 2026  
**Alcance:** producto 2 de Seresta. Este documento registra decisiones de
producto, dependencias, entregables y criterios de aceptación. El trabajo se
implementará y aceptará fase por fase; la arquitectura de producción sigue
pendiente de los resultados de la prueba técnica.

## 1. Objetivo

Ofrecer un asistente de citas por WhatsApp llamado **Seresta**. En el producto
Intermediario, los clientes escriben al número central de WhatsApp Business de
Seresta. El sistema identifica el local, conversa con el cliente, registra la
cita en el Google Calendar autorizado por el propietario y permite que el
propietario comparta los calendarios con sus trabajadores o secretaria.

La primera versión de este producto se configura desde el sitio web de Seresta.
El registro inicial por WhatsApp se considera una mejora futura, no parte del
MVP.

## 2. Productos y límites

| Producto | Descripción | Alcance de este plan |
|---|---|---|
| **Seresta Local** | Runtime instalado en el equipo del negocio, con `whatsapp-web.js`, sesión local y configuración local. | Se conserva su comportamiento. No debe pedir ID de local ni depender del servicio alojado. |
| **Seresta Intermediario** | Un número central de WhatsApp Business de Seresta; los enlaces identifican el local y Seresta opera su agenda. | Es el único producto que se planeará e implementará en esta etapa. |
| **Seresta con número del negocio** | Cada empresa conecta su propio número y utiliza el motor de Seresta. | Fuera del MVP por las limitaciones actuales con Meta. Se deja como posible extensión, no se implementa. |

`package.json` describe dependencias y comandos; no debe decidir a qué producto
pertenece un mensaje. La versión Local y el servicio Intermediario tendrán
composiciones de ejecución/configuraciones separadas. Compartirán el núcleo
conversacional cuando sea posible, sin compartir estado o configuración de un
negocio por accidente.

## 3. Decisiones acordadas

### Registro y local

- El propietario se registra inicialmente en el sitio web.
- El propietario configura el local, sus trabajadores, catálogo, horarios y
  políticas; además autoriza su cuenta de Google.
- Se lanza primero en Colombia.
- Seresta crea un calendario de Google por trabajador dentro de la cuenta
  autorizada por el propietario. No se conectará una cuenta Google por
  trabajador.
- El propietario decide desde Google si comparte cada calendario con un
  trabajador como lector o editor, o si lo administra una secretaria.
- El propietario podrá editar desde el sitio los datos básicos, trabajadores,
  servicios, horarios y conexión de Calendar.
- El catálogo de servicios es común al local; el propietario indica cuáles
  ofrece cada trabajador. Cada trabajador tiene sus propios horarios y
  calendario.
- Los eventos ocupados existentes en el calendario del trabajador bloquean
  disponibilidad.

### Enlaces y selección del local

- Cada local recibe un enlace de WhatsApp al número central de Seresta con un
  mensaje prellenado que identifica el local.
- Un cliente que no use el enlace puede buscar por el nombre del local. Si hay
  más de una coincidencia, se le pide la ciudad y confirma el resultado antes
  de asociar el flujo con ese local.
- Después de una reserva confirmada, Seresta recuerda solo el último local
  asociado a ese número. Si el cliente vuelve, se le pregunta si quiere usar el
  mismo local; si no, puede buscar otro.
- Si el cliente aún no ha confirmado una reserva, no se conserva una asociación
  permanente cliente-local. Si abandona el flujo, el botón de reanudación
  identifica el local de ese flujo.
- Si el cliente confirma una reserva en otro local, ese local reemplaza al
  último recordado.

### Citas y conversación

- El cliente selecciona el trabajador y confirma la cita; al confirmarse, se
  crea el evento en el Calendar de ese trabajador. No hay aprobación manual
  adicional del barbero.
- El MVP incluye agendar, consultar disponibilidad, consultar servicios y
  precios, y cancelar citas confirmadas. **Reprogramar** queda fuera del MVP.
- No se permite más de **3 citas creadas por número de cliente por día**, en
  total entre todos los locales. El conteo se incrementa al crearse el evento
  en Google Calendar. Cancelar una cita no devuelve ese cupo.
- El contador diario usa la zona horaria del negocio. Como el lanzamiento es
  en Colombia, la política inicial deberá validar y estandarizar el uso de
  `America/Bogota`.
- No se establece un límite diario de cancelaciones.
- Una cita no confirmada no debe persistir como cita en Calendar. Si pasan 10
  minutos desde el último mensaje del bot sin que el cliente confirme, Seresta
  libera el borrador, cierra el flujo y envía una despedida.
- La despedida incluye un control para volver a iniciar con el mismo local.
  La selección debe llevar el identificador de enrutamiento del local de ese
  flujo, sin requerir que el cliente copie el ID.
- Se usarán controles interactivos donde sean accesibles y adecuados, con
  alternativas de texto. El nombre, una hora específica y el teléfono si no se
  obtiene del mensaje pueden requerir respuesta escrita.
- El cliente puede cancelar citas confirmadas; el número máximo de citas
  futuras simultáneas y las reglas de anticipación para cancelar aún deben
  precisarse.

### Datos y notificaciones

- Google Calendar es la fuente de verdad de la agenda. Seresta guardará la
  referencia durable mínima de la reserva (por ejemplo, IDs del evento/reserva,
  estado e idempotencia), no una copia completa del historial, salvo que luego
  se acuerde lo contrario.
- La bandeja durable de mensajes, la deduplicación y el estado temporal de
  conversación siguen siendo necesarios para reintentos y recuperación.
- El número de WhatsApp del cliente se usa como contacto de la cita cuando la
  API lo entrega. Si no se obtiene, el bot lo solicitará.
- Para el límite global y la memoria del último local se guardará el mínimo
  identificador seudonimizado asociado al número. La seudonimización no elimina
  la necesidad de proteger esos datos.
- El cliente podrá pedir que Seresta olvide sus datos. En el comportamiento
  acordado, Seresta elimina sus propios datos/asociaciones; no elimina
  automáticamente eventos del Calendar controlado por el propietario.
- En el MVP, la cita visible en el Calendar es el aviso al propietario y al
  trabajador con quien este haya compartido la agenda. No se enviará todavía un
  mensaje independiente al barbero.
- El cobro al negocio se imagina **por trabajador**, pero el precio y sus
  niveles quedan pendientes. Los costos y límites de Google deberán verificarse
  antes de incorporarlos al cálculo de suscripción.

## 4. Flujo objetivo

1. El propietario registra el local en el sitio y configura trabajadores,
   servicios, horarios y zona horaria.
2. Autoriza Google mediante OAuth. Seresta crea un calendario por trabajador
   en esa cuenta y guarda la conexión asociada al local.
3. El sitio presenta al propietario el enlace de WhatsApp central con el
   identificador de enrutamiento del local.
4. El cliente inicia el chat con ese enlace, o busca el local por nombre y
   ciudad. Seresta resuelve un único local antes de consultar o crear citas.
5. El cliente selecciona servicio, trabajador, fecha y horario. Seresta
   consulta la agenda real y vuelve a comprobar disponibilidad antes de crear
   la cita.
6. El cliente confirma. Seresta crea el evento en el calendario del trabajador,
   registra la referencia mínima y actualiza el límite diario global.
7. El propietario gestiona permisos de Calendar para los trabajadores o la
   secretaria desde Google.

## 5. Situación técnica observada

La auditoría de `src/` encontró una base reutilizable, pero no una aplicación
multi-negocio lista para alojarse:

- `src/core/` contiene reglas conversacionales y contratos de agenda/mensajería
  sin depender directamente de WhatsApp Web o Google APIs.
- `src/connectors/whatsapp/whatsapp-connector.ts` define un contrato común, y
  `whatsapp-web-connector.ts` implementa el conector local.
- `src/index.ts` carga un único archivo de configuración, crea una conexión
  OAuth local, un calendario y un conector WhatsApp Web. No existe aún el
  ingreso de WhatsApp Business API, el webhook ni el portal de propietarios.
- El procesador recibe una configuración de negocio fija. Aunque el modelo y
  algunos repositorios ya incluyen `businessId`, el mensaje entrante no
  resuelve dinámicamente el local que debe atender.
- SQLite conserva conversaciones, bandeja de entrada y reservas. La nueva
  arquitectura debe separar los datos de negocio de la fuente de verdad de la
  agenda, sin perder recuperación, idempotencia ni deduplicación.
- El conector actual de Calendar usa tokens locales y un alcance de eventos.
  Crear calendarios por trabajador puede requerir otro alcance OAuth; hay que
  determinar el alcance mínimo y verificarlo antes de diseñar el consentimiento.
- El proyecto OAuth actual está en modo `Testing`, según la continuidad del
  proyecto. Google documenta hasta 100 usuarios de prueba y caducidad de siete
  días para autorizaciones de scopes de Calendar en ese modo. Esto no equivale
  a un límite gratuito de 100 propietarios en producción.

La suite observada durante la auditoría anterior pasó **824 pruebas en 46
archivos**, y `npm run build` pasó. El árbol de trabajo ya estaba modificado.
Este documento no cambia ni revierte esos cambios.

## 6. Arquitectura objetivo a evaluar

```text
Sitio Seresta
  ├─ Registro / acceso del propietario
  ├─ Configuración del local y trabajadores
  └─ Autorización Google OAuth

WhatsApp Business central
  └─ Webhook → bandeja durable → resolver local → procesador → núcleo
                                                ├─ Calendar del trabajador
                                                └─ WhatsApp Business API
```

- Mantener una composición para el runtime local y otra para el servicio
  Intermediario. No hacer que el runtime local dependa de la base online ni del
  ID público del local.
- Agregar adaptadores/puertos para la API de WhatsApp, webhooks, Calendar por
  negocio y almacenamiento alojado. El núcleo recibe contexto de negocio
  resuelto; no consulta directamente una base SaaS ni conoce Meta.
- Resolver `businessId` antes de enviar el mensaje a la conversación. Mantener
  el aislamiento en colas, conversaciones, calendarios y registros.
- Tratar Google Calendar como agenda canónica; usar la base de Seresta para
  registro del local, trabajadores, OAuth, configuración, asociaciones mínimas
  de clientes, cupos diarios e infraestructura durable de mensajes.
- El enlace de reanudación puede llevar el local en el ID/payload del botón
  interactivo que vuelve en el webhook. Se deberá validar el formato, evitar
  que datos privados viajen en el payload y no depender de memoria en proceso.
- El cierre automático de 10 minutos requiere estado durable y un mecanismo de
  tareas programadas confiable; no debe implementarse con un `setTimeout` en
  memoria que se pierda al reiniciar.

### Alojamiento y base de datos

Cloudflare se eligió para la primera prueba técnica, no para producción. La web
de iQDevTech ya está desplegada en Cloudflare, pero el repositorio auditado no
contiene su frontend. Se propone mantener la web pública en el alojamiento
actual y comprobar qué componentes sirven mejor el portal y el runtime:

| Opción | Componentes | Ventajas | Costos/riesgos a validar |
|---|---|---|---|
| **Cloudflare (preferida para la prueba técnica)** | Mantener el sitio actual en Cloudflare; evaluar Pages o Worker Static Assets para el portal; Workers para API, OAuth y webhook; D1 para SQL; Workflows o Cron para vencimientos y tareas durables. | Ya usan Cloudflare; encaja con webhooks HTTP; no requiere proceso Node siempre activo; D1 usa SQL compatible con SQLite; Workflows persiste pasos y esperas. | El proyecto usa `better-sqlite3`, que no se debe asumir compatible con Workers: hay que crear y probar un adaptador D1. Revisar compatibilidad de `googleapis`, límites y costos; las cuotas gratuitas son límites operativos, no una garantía de servicio sin costo. |
| **Servicio Node.js administrado** | Mantener el portal en Cloudflare; alojar API/webhook en un contenedor o servicio Node con PostgreSQL administrado y cola/tareas programadas. | Runtime Node conocido y más compatible con el código existente; persistencia relacional administrada. | Aún requiere reemplazar SQLite local para el servicio multi-instancia; agrega proveedor, base, copias, secretos, alertas y costo mínimo. |
| **Un único Node.js con SQLite persistente** | Contenedor Node y disco persistente para el piloto. | Menor migración inmediata de almacenamiento. | Una sola instancia, límites de concurrencia/escala, copias y recuperación. No se recomienda como arquitectura final del SaaS sin validar sus límites. |

**Decisión provisional acordada:** probar primero Cloudflare. Pages o Worker
Static Assets para el portal, Workers para API/webhook, D1 para SQL y Workflows
o Cron para vencimientos son componentes candidatos, no una arquitectura de
producción ya cerrada. Si la compatibilidad de dependencias, la duración de
tareas o la persistencia exigen demasiadas concesiones, evaluar Node.js
administrado para el backend; no migrar el producto local.

Como referencia consultada el 7 de noviembre de 2026, la documentación oficial
publica un plan Workers Paid desde 5 USD/mes por cuenta, límites de Workers y
cuotas separadas para D1/Queues. El plan gratuito de D1 incluye límites diarios
y de almacenamiento; al alcanzar ciertos límites las consultas pueden fallar.
Revalidar los valores y calcular el costo con tráfico y tareas reales antes de
ofrecer el producto. Referencias: [precios de Workers](https://developers.cloudflare.com/workers/platform/pricing/),
[precios de D1](https://developers.cloudflare.com/d1/platform/pricing/),
[límites de D1](https://developers.cloudflare.com/d1/platform/limits/),
[Workflows](https://developers.cloudflare.com/workflows/) y
[Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

Los límites gratuitos compartidos por el propietario coinciden en lo principal
con la documentación consultada el 29 de octubre de 2026:

| Servicio | Límites gratuitos relevantes | Implicación para Seresta |
|---|---|---|
| Workers | 100.000 solicitudes/día, 10 ms de CPU por solicitud, 128 MB por isolate, 50 subsolicitudes por solicitud, 100 Workers y 5 Cron Triggers por cuenta. | Esperar un `fetch()` de Google no consume CPU, pero el código sí. El webhook puede encajar; medir procesamiento, subsolicitudes y ejecuciones reales. Cinco Cron Triggers son por cuenta, no uno por cliente. |
| D1 | 5 millones de filas leídas/día, 100.000 escritas/día y 500 MB por base de datos en Free; límites y unidades pueden cambiar. | Medir lecturas/escrituras y crear índices; al agotar límites de Free las consultas dejan de ejecutarse hasta el reinicio o cambio de plan. |
| Pages | Archivos estáticos sin cuota por solicitudes/banda, 500 builds/mes, una build simultánea, 20 minutos por build, 20.000 archivos y 25 MiB por archivo. | Los recursos estáticos son adecuados para marketing/portal; cualquier Pages Function cuenta contra las cuotas de Workers. |

Verificar límites exactos en la cuenta y el tipo de despliegue. El URL actual
termina en `workers.dev`, pero el repositorio de marketing contiene un sitio
estático (`index.html`, `_headers`, `assets/`, `productos/`, `legal/`); aún falta
confirmar si se publica como Worker Static Assets, Pages u otro flujo. Fuentes:
[límites de Workers](https://developers.cloudflare.com/workers/platform/limits/),
[límites de Pages](https://developers.cloudflare.com/pages/platform/limits/),
[precios de Pages Functions](https://developers.cloudflare.com/pages/functions/pricing/),
[precios de Workers](https://developers.cloudflare.com/workers/platform/pricing/) y
[precios de D1](https://developers.cloudflare.com/d1/platform/pricing/).

La caducidad de diez minutos debe sobrevivir reinicios. Comparar:

- **Workflow durable:** esperar hasta la caducidad y enviar el cierre con
  reintentos; al llegar un nuevo mensaje, cancelar/invalidar la espera anterior.
- **Vencimientos en D1 + Cron:** consultar periódicamente los flujos vencidos.
  Puede enviar el cierre hasta un intervalo de Cron después de los diez minutos,
  por lo que requiere acordar la tolerancia.

No usar `setTimeout` en memoria como único mecanismo. El servicio de WhatsApp
Business recibe eventos por webhook; no necesita mantener el navegador o la
sesión persistente que usa el producto local.

## 7. Ejecución ágil y fases de entrega

### Meta del producto

Un propietario en Colombia puede registrarse, configurar un local y sus
trabajadores, conectar Google Calendar, compartir un enlace central de Seresta
y recibir citas correctas en el calendario elegido. Los clientes pueden
consultar, reservar y cancelar por WhatsApp. Ningún dato o acción de un local
puede filtrarse a otro, y Seresta Local continúa funcionando como antes.

### Scrum ligero para este proyecto

- **Product Owner:** el usuario decide prioridades, políticas del producto y
  acepta o rechaza cada entregable.
- **Facilitación técnica/Scrum Master:** en cada fase organizaré el objetivo,
  dependencias, historias, criterios de aceptación, riesgos y evidencia de
  pruebas. No cerraré decisiones de negocio por suposición.
- Las fases son incrementos comprobables, no estimaciones de calendario. Cada
  fase se divide en historias pequeñas y puede ocupar una o varias iteraciones.
- Historias con el formato «Como [actor], quiero [capacidad], para
  [beneficio]» y criterios comprobables, preferiblemente Given/When/Then.
- Tablero sugerido: `Backlog → Ready → In progress → Review → Done`; agregar
  `Blocked` cuando dependa de Meta, Google o una decisión externa. No crear
  tickets en un repositorio remoto hasta acordar el tablero y tener acceso.
- Al inicio de cada iteración se acuerda un objetivo pequeño. Al final se
  demuestra el entregable con pruebas/evidencia, el Product Owner lo acepta y
  se registra lo aprendido para la siguiente fase.

**Definition of Ready:** historia priorizada, alcance claro, criterios de
aceptación medibles, dependencias conocidas y riesgos de datos/seguridad
identificados.

**Definition of Done:** criterios de aceptación satisfechos; pruebas
pertinentes y build pasan; documentación/comandos actualizados; errores
visibles; revisión de aislamiento entre locales y privacidad cuando aplique;
`git diff --check` limpio. Las integraciones reales con WhatsApp y Calendar no
se ejecutan en la suite automática. Un entregable que requiera verificación
manual queda marcado como pendiente hasta que realmente se pruebe.

### Tecnologías existentes y decisiones todavía abiertas

- La base actual es TypeScript ESM estricto. Ya están instalados `vitest`,
  `googleapis`, `better-sqlite3` y `whatsapp-web.js`.
- `better-sqlite3` y `whatsapp-web.js` pertenecen al runtime local: no se
  importan desde el Worker ni se reemplazan en ese producto.
- Para Cloudflare, evaluar Wrangler, bindings nativos de D1 y APIs estándar
  (`fetch`, Web Crypto). No añadir ORM o librería de auth antes de la prueba de
  compatibilidad y una decisión explícita.
- Probar si `googleapis` funciona de forma segura en Workers. Si no, preferir
  una biblioteca compatible u OAuth/Calendar REST oficial; no reimplementar
  OAuth sin una decisión y revisión de seguridad.
- El sitio público actual es estático y no muestra `package.json`; el
  framework del portal autenticado no está decidido. React/Vite puede
  evaluarse como candidato, no es una decisión tomada.
- Para Meta, empezar con el webhook y la API Graph oficial mediante `fetch` y
  Web Crypto; agregar SDK solo si aporta valor y es compatible.

### Restricciones de arquitectura para todas las fases

- **Seresta Local es una línea de producto que debe seguir funcionando.** Su
  composición actual (`src/index.ts`), configuración local, `whatsapp-web.js`,
  `LocalAuth`, almacenamiento SQLite, conexión local de Google Calendar,
  arranque/cierre y flujos existentes no se reemplazan por la versión
  Intermediario. Todo cambio a una regla compartida debe incluir pruebas de
  regresión para Local.
- `src/core/` contiene lógica de negocio y contratos independientes del
  producto/proveedor. No importar allí `whatsapp-web.js`, SDK de Meta,
  `googleapis`, `better-sqlite3`, D1 ni detalles de Workers. Los conectores
  convierten payloads externos al contrato común; las composiciones seleccionan
  conector, almacenamiento y políticas.
- Mantener una composición identificable para Local y crear otra para
  Intermediario. **No seleccionar el producto con `package.json` ni con una
  bandera que mezcle ambos runtimes**; el Intermediario no debe pedir datos de
  tenant al usuario de Local ni compartir su base, sesión o credenciales.
- Reutilizar los flujos que tengan la misma regla de negocio (por ejemplo,
  disponibilidad, reserva y cancelación) desde el núcleo. El alta del local,
  OAuth web, resolución de tenant y políticas del número central pertenecen a
  la aplicación Intermediario. Si la regla cambia por producto, inyectar una
  política/contexto explícito, no ramificar el núcleo con comprobaciones
  dispersas de “producto actual”.
- La versión futura con números propios queda fuera del MVP. Mantener contratos
  neutrales que ya sean útiles para Local e Intermediario, pero no construir
  ahora un sistema de credenciales, onboarding o configuración para esa tercera
  versión sin un caso de uso aprobado.
- **No renombrar archivos en lote ni añadir comentarios como único mecanismo
  de separación.** El conector existente ya se llama
  `whatsapp-web-connector.ts` y el contrato `whatsapp-connector.ts` es
  neutral. Usar carpetas/composiciones y nombres de responsabilidad claros.
  Reservar nombres como `*-whatsapp-web` o `*-whatsapp-business-api` para
  módulos que realmente dependen de ese proveedor; renombrar solo si aclara una
  modificación necesaria, no por uniformidad. Los comentarios explican una
  restricción no obvia; las dependencias, pruebas y límites de módulos son la
  fuente de verdad.
- No guardar secretos, tokens, números de prueba privados ni PII en el plan,
  código, tests, logs, capturas o commits. No añadir una dependencia al
  `package.json` hasta que una fase demuestre que hace falta y se compruebe su
  compatibilidad/licencia/mantenimiento.

| Clasificación | Qué debería vivir ahí | Tratamiento |
|---|---|---|
| **Núcleo compartido** | Reglas de reserva, disponibilidad, servicios, fechas, cancelación y contratos de mensajes/agenda. | Reutilizar cuando la regla sea la misma. Recibir configuración/contexto explícito; no depender de WhatsApp Web, Meta, almacenamiento u OAuth concretos. |
| **Solo Seresta Local** | Composición actual, `LocalAuth`/QR, ciclo de vida de WhatsApp Web, carga de `negocio.json`, SQLite y autorización local de Calendar. | Mantener el comportamiento y los conectores existentes; no hacer que consulte tenants ni infraestructura online. Los nombres ya específicos del proveedor se conservan; no añadir `Wppweb` a cada flujo compartido. |
| **Seresta Intermediario** | Registro y acceso del propietario, OAuth web por negocio, resolución de tenant/enlace, número central, control global de citas y operación multi-tenant. | Mantener fuera del núcleo y de la composición local. Crear módulos propios cuando el caso de uso sea exclusivo; integrar servicios compartidos mediante contratos. |
| **Proveedor reutilizable en futuro** | Webhook/API Graph, normalización de payloads de WhatsApp Business y envío de mensajes. | Separarlo del Intermediario: la versión futura con números propios podría reutilizar el adaptador, pero sus credenciales y configuración por negocio quedan fuera del MVP. |

### Fase 0 — Baseline, backlog y reglas bloqueantes

**Objetivo:** saber desde qué estado real se parte y separar lo necesario para
desarrollar de lo que solo bloquea un piloto comercial.

**Trabajo:**

- Ejecutar y registrar en el árbol actual `npm test`, `npm run build` y
  `git diff --check` antes del primer cambio de producto. El dato de 824 pruebas
  corresponde a una auditoría anterior; no asumir que es el estado actual.
- Convertir los casos UC-01…UC-14 en historias y vincular cada criterio con
  pruebas unitarias, de contrato, integración o manuales.
- Resolver antes de implementar cada flujo: método de ingreso del propietario
  (separado del OAuth de Calendar), identidad del cliente cuando WhatsApp no
  entregue teléfono, regla de cancelación, máximo de citas futuras simultáneas,
  borrado/retención del identificador seudonimizado y roles del portal.
- Definir como **gates de piloto**, no necesariamente de la prueba técnica:
  aviso de privacidad/términos revisados, OAuth publicado/verificado, Meta
  habilitado para el número, política de soporte/retención y criterios de
  costo/precio.
- Mantener fuera del MVP: conexión de números propios de cada negocio,
  aprobación manual de citas, aviso independiente al barbero, reprogramación
  y registro inicial por WhatsApp. Flows visuales no son requisito si el texto
  funciona.

**Tecnología/método:** escenarios de aceptación; tablero y decisiones
registradas en este plan. Sin nuevas dependencias ni cambios de código.

**Entregable:** baseline reproducible, backlog priorizado y matriz de
decisiones `decidido / por resolver / gate de piloto`.

**Aceptación:** se conocen los resultados reales de tests/build del árbol
actual; cada historia de MVP tiene criterio de aceptación; los bloqueos están
asignados a una fase o explícitamente diferidos; el Product Owner acepta el
orden del backlog.

### Fase 1 — Prueba vertical de viabilidad en Cloudflare

**Objetivo:** comprobar las integraciones de mayor riesgo antes de reorganizar
el motor o construir el portal completo.

**Trabajo:**

- Crear una prueba aislada de Worker que recibe un webhook, valida el desafío
  y firma, persiste un ID idempotente en D1 y responde sin ejecutar el diálogo
  dentro del tiempo de respuesta del webhook.
- Probar persistencia y acceso a estado desde D1; comparar Workflows con D1 +
  Cron para un vencimiento que debe sobrevivir reinicios.
- Probar el OAuth web de Google con una cuenta de prueba y la creación/lectura
  de calendarios secundarios. Verificar scopes mínimos, refresh, revocación y
  compatibilidad de `googleapis`.
- Usar el número, ID y token de prueba de Meta ya proporcionados para la
  integración de pruebas autorizada; no registrar sus valores en este plan ni
  en el repositorio.
- Comprobar rutas/subdominio del portal independiente y límites/costo con
  datos sintéticos.
- Evaluar WhatsApp Flow/selector de fecha como experimento opcional. Si
  horarios dinámicos o compatibilidad fallan, continuar con conversación de
  texto y botones/listas disponibles.

**Tecnología candidata:** Wrangler y tipos generados para Worker/D1; D1 nativo
o librería compatible; `fetch`/Web Crypto; `googleapis` existente solo si pasa
la prueba. No copiar `better-sqlite3` al Worker.

**Entregable:** spike ejecutable y una decisión de arquitectura breve con
resultados, límites, riesgos y recomendación `go / ajustar / usar Node.js`.

**Aceptación:** se demuestra webhook verificado, persistencia idempotente,
OAuth/calendario y una espera durable en entornos de prueba; se documenta qué
no funciona y qué cuesta. Todas las pruebas automatizadas usan mocks o
fixtures. Las pruebas manuales con cuentas externas se hacen aparte y con
autorización; nunca con datos reales de clientes.

#### Registro de avance — 9 de noviembre de 2026

Se inició el spike aislado en
[`spikes/cloudflare-viability/`](./spikes/cloudflare-viability/). No se tocó la
composición ni los conectores de Seresta Local.

- **Baseline:** `npm test` pasó 824/824 pruebas, `npm run build` pasó y
  `git diff --check` pasó antes de los cambios del spike.
- **Worker + D1 local:** Wrangler 4.159.0 creó la base local y aplicó la
  migración. Con valores sintéticos se comprobaron challenge GET válido,
  firma HMAC válida, rechazo de firma inválida, POST duplicado y persistencia
  de una sola fila. Se confirmó que solo se almacena el ID del mensaje, no el
  contacto ni el cuerpo. No se conectó Meta ni se usaron los recursos reales
  proporcionados para la prueba.
- **Tamaño/compilación:** el Worker webhook produjo un bundle de 4.58 KiB
  (1.68 KiB gzip) en `wrangler deploy --dry-run`; no se desplegó remotamente.
- **`googleapis`:** el bundle de la sonda produjo 34,787 KiB (1,030.55 KiB
  gzip). En `wrangler dev` local con `nodejs_compat` se pudieron crear
  `OAuth2` y Calendar clients y generar una URL de autorización con acceso
  offline y scope `calendar.app.created`. Esto demuestra compatibilidad básica
  del bundle/runtime, no intercambio/renovación de tokens, uso real del
  calendario ni aptitud para producción. La dependencia trae un bundle grande
  y requiere medir arranque/CPU y comparar alternativas antes de adoptarla.
- **Workflow vs Cron:** revisión documental, no prueba ejecutable. Workflows
  ofrece espera durable (`sleep`/`sleepUntil`) y reintentos; Cron dispara un
  Worker según horario UTC y puede procesar vencimientos con D1, pero el cierre
  queda sujeto al intervalo y latencia del disparador. La documentación indica
  que cambios de Cron pueden tardar hasta 15 minutos en propagarse. No se
  eligió mecanismo ni se ha probado la invalidación de expiraciones antiguas.
- **Pendiente para completar la fase:** OAuth web con cuenta de prueba,
  refresh/revocación y creación de calendario; prueba de espera durable y
  comportamiento al reiniciar; revisar el subdominio real; integración manual
  de webhook/API Meta con el número de prueba, sin ejecutar operaciones con
  clientes.

**Conclusión provisional:** `go` para continuar probando Cloudflare Workers +
D1 y mantener `googleapis` como candidato de prueba, no como decisión de
producción. La fase sigue **en progreso** hasta resolver los puntos pendientes
y decidir si la demora de cierre con Cron cumple la política de producto.

### Fase 2 — Límites de aplicación y contexto multi-local

**Objetivo:** permitir que el mismo núcleo atienda al runtime local y al
producto Intermediario sin mezclar configuración, identidad ni estado.

**Trabajo:**

- Conservar `src/index.ts` y el camino WhatsApp Web como composición local;
  agregar una composición alojada sin importar dependencias Cloudflare en
  `src/core/`.
- Definir el sobre normalizado de mensaje, proveedor, ID externo, identidad
  de conversación, respuesta interactiva y `businessId` resuelto.
- Cambiar la frontera del procesador para recibir el contexto/configuración
  correcta por conversación; no usar un negocio global en el servicio SaaS.
- Definir claves de conversación y deduplicación que distingan proveedor,
  contacto y contexto de local; resolver tenant antes de cualquier acceso a
  configuración o Calendar.
- Implementar puertos/adaptadores para mensajería, persistencia y agenda.
  Evitar mover todos los archivos existentes solo por estética.

**Tecnología/método:** arquitectura de puertos y adaptadores; TypeScript y
contratos existentes; Vitest para pruebas unitarias y de contrato.

**Entregable:** frontera local/intermediario y contratos de mensaje/contexto
documentados e implementados.

**Aceptación:** los tests/build de Seresta Local pasan; una conversación puede
recibir contextos distintos por local; pruebas con dos locales demuestran que
no se comparte conversación/configuración; el core no importa SDK de Meta,
Cloudflare ni almacenamiento concreto.

### Fase 3 — Cuenta del propietario, local y portal de configuración

**Objetivo:** que un propietario pueda entrar al portal y dejar listo un local
sin que todavía tenga que atender clientes.

**Trabajo:**

- Decidir e implementar autenticación de la cuenta del portal (separada del
  consentimiento OAuth de Google Calendar), recuperación de acceso y sesión.
- Modelar local/tenant, trabajadores, servicios, relación servicio-trabajador,
  horarios y estados de configuración con migraciones versionadas.
- Implementar registro, edición, validación y aislamiento de datos; inicialmente
  solo rol propietario salvo que se acuerde otro rol.
- Crear la página pública de Seresta dentro del sitio iQDevTech y el portal
  como aplicación separada bajo el subdominio aprobado.
- Definir qué información es pública, cuál es privada y cómo se evita exponer
  identificadores o secretos.

**Tecnología candidata:** repositorios D1 detrás de los contratos; SQL
versionado; frontend TypeScript (evaluar React/Vite); elegir proveedor/librería
de auth compatible con Workers antes de implementarlo. No guardar tokens de
Google en esta fase.

**Entregable:** propietario autenticado puede crear y editar un local,
trabajadores, servicios y horarios en un ambiente de prueba.

**Aceptación:** flujos de registro/edición y validaciones comprobados; dos
propietarios no pueden leer ni modificar los datos del otro; las rutas privadas
exigen autorización en servidor; el portal indica claramente estados y errores.

### Fase 4 — OAuth Google y calendarios por trabajador

**Objetivo:** conectar la cuenta del propietario y crear los calendarios que
usará el motor.

**Trabajo:**

- Implementar consentimiento OAuth web con `state`, redirect URI controlado,
  scopes mínimos, estado de conexión, refresh y revocación.
- Crear un calendario por trabajador y persistir solo la relación necesaria
  entre tenant, trabajador y Calendar ID.
- Consultar eventos ocupados y crear/eliminar eventos sin confirmar éxito
  antes de recibir respuesta de Google.
- Diseñar almacenamiento cifrado para refresh tokens y rotación de claves;
  secretos de aplicación no sustituyen el cifrado de tokens por propietario.
- Mostrar en portal conectado, requiere reconexión y error sin revelar tokens.

**Tecnología candidata:** `googleapis` ya instalado si la Fase 1 confirma
compatibilidad; en caso contrario, adaptador a API REST oficial compatible con
Workers. Repositorio y cifrado aislados del core.

**Entregable:** un local de prueba conecta Google, crea calendarios y los
desconecta/reconecta.

**Aceptación:** un tenant no puede leer ni escribir calendarios de otro; los
tokens no aparecen en logs ni en texto plano persistido; pruebas con respuestas
falsas cubren éxito, timeout, revocación y error; verificación manual con cuenta
de prueba separada confirma el flujo OAuth.

### Fase 5 — WhatsApp Business: webhook, bandeja y enrutamiento

**Objetivo:** recibir y responder mensajes de un número central, asociándolos
con seguridad al local correcto.

**Trabajo:**

- Configurar activos de Meta y número de prueba, callback HTTPS, desafío y
  verificación de firma del cuerpo original.
- Usar el número/ID/token de prueba ya entregados solo en el entorno de
  pruebas y únicamente para verificaciones manuales autorizadas; no cargar
  credenciales reales de clientes ni convertirlos en configuración de
  producción.
- Normalizar texto, `wa_id`, IDs de mensajes, botones/listas y estados de
  entrega al contrato de Fase 2.
- Resolver el local desde el enlace prellenado; para entrada libre, buscar por
  nombre/ciudad y confirmar homónimos. No elegir por aproximación silenciosa.
- Guardar inbox/outbox idempotentes, aceptar reintentos y responder al webhook
  antes del trabajo largo; recuperar el trabajo de forma durable.
- Enviar mensajes mediante la API Graph oficial con errores/reintentos
  explícitos y límites adecuados. Documentar la entrega saliente como al menos
  una vez si Meta no ofrece idempotencia para esa operación; no prometer
  “exactamente una vez” para efectos externos.

**Tecnología candidata:** `fetch` y Web Crypto para firma; sin SDK de Meta al
inicio; persistencia D1 y mecanismos durables validados en Fase 1.

**Entregable:** número de prueba puede recibir un mensaje, asociarlo a un local
de prueba y contestar una respuesta controlada.

**Aceptación:** firmas incorrectas se rechazan; un evento duplicado no repite
el efecto de negocio ni crea otra reserva; local inválido/inactivo no se enruta;
dos locales concurrentes permanecen aislados; desconexión/reintento no pierde
el trabajo. Si una respuesta puede repetirse por un fallo después del envío y
antes del acuse local, esa limitación queda probada/documentada. Las pruebas
automatizadas no llaman a Meta.

### Fase 6 — Agenda multi-tenant y flujos del MVP

**Objetivo:** habilitar consultas, reservas y cancelaciones correctas a través
del motor actual.

**Trabajo:**

- Pasar el tenant/configuración resueltos a los flujos existentes sin crear un
  fork del motor local.
- Implementar consulta de servicios/precios/disponibilidad; selección de
  trabajador, fecha y hora; confirmación explícita; cancelación.
- Tratar Google Calendar como fuente de verdad y revalidar el espacio antes de
  crear. Guardar referencias mínimas e idempotentes.
- Aplicar el máximo global de tres citas creadas por contacto y día, contando
  entre locales, atómicamente y sin devolver cupo al cancelar.
- Manejar ausencia de teléfono de contacto, timezone Colombia y errores de
  Calendar sin completar datos por suposición ni informar éxito falso.

**Tecnología/método:** reutilizar reglas `src/core/booking/` y
`src/core/conversation/`; proveedores en adaptadores; repositorio de cupos con
operación atómica/índice único o transacción equivalente validada para D1.

**Entregable:** un cliente de prueba completa de principio a fin una consulta,
reserva confirmada y cancelación sobre calendarios de prueba.

**Aceptación:** casos UC-05…UC-10 y UC-12…UC-13 cubiertos; una reserva solo se
confirma después de Calendar; reintentos no duplican evento ni cupo; cuarta
cita diaria se rechaza incluso entre locales; ninguna prueba permite usar
calendario/configuración de otro tenant; tests Local siguen pasando.

### Fase 7 — Expiración, recuperación y experiencia de conversación

**Objetivo:** hacer confiable y entendible el flujo incluso ante abandono,
reinicios, mensajes inesperados o falta de componentes interactivos.

**Trabajo:**

- Implementar expiración durable a los diez minutos desde el último mensaje del
  bot, renovación en cada turno, cierre del borrador y botón de reanudación con
  payload no sensible del local.
- Añadir manejo de bandeja fallida, reintentos acotados, cuarentena/alertas y
  recuperación del outbox; especificar entrega al menos una vez.
- Usar texto como experiencia completa de respaldo. Añadir botones/listas o
  WhatsApp Flows solo donde reduzcan errores y tras comprobar compatibilidad.
- Mantener mensajes breves y accesibles, explicar campos no entendidos y
  preservar datos válidos al pedir aclaración.

**Tecnología:** Workflow durable o D1 + Cron según resultado de Fase 1; nunca
`setTimeout` en memoria como única fuente de expiración.

**Entregable:** conversación de prueba sobrevive a reinicio, vence, se reanuda
y permite continuar por texto si no hay Flow.

**Aceptación:** expiración y reanudación comprobadas con reloj controlado y
prueba de reinicio; respuestas fallidas no bloquean toda la cola; no se pierde
ni duplica una reserva; el cliente puede completar los casos esenciales sin
Flow.

### Fase 8 — Piloto, seguridad operativa y lanzamiento

**Objetivo:** abrir el producto gradualmente y con soporte, datos y costos
controlados.

**Trabajo:**

- Verificar aislamiento, permisos, amenazas principales, secretos, logs sin
  PII, rate limits, recuperación y borrado en staging.
- Preparar backups/restauración, alertas, panel operativo, runbook, soporte,
  revocación de cuentas y plan de rollback.
- Publicar/verificar OAuth de producción, dominio HTTPS y páginas de privacidad
  y términos; confirmar habilitación/condiciones de Meta y tarifas para Colombia.
- Ejecutar piloto limitado con propietarios que acepten participar; obtener
  consentimiento, revisar fallos y medir costo de Meta, Google, Workers y D1.
- Definir umbrales de éxito antes del piloto (por ejemplo, onboarding completado,
  reservas correctas, duplicados, fallos y costo por cita); no inventar números
  objetivo sin aprobación.

**Entregable:** piloto controlado con manual de operación, revisión de
incidentes y recomendación documentada de continuar, corregir o detener.

**Aceptación:** Product Owner aprueba los umbrales; pruebas funcionales y de
aislamiento pasan; rollback y restauración están demostrados; cualquier
integración manual se registra como tal; no quedan secretos ni datos reales en
el repositorio.

### Restricciones específicas de cada fase

| Fase | Restricciones y límites |
|---|---|
| **0 — Baseline y reglas** | No limpiar ni sobrescribir cambios previos del árbol de trabajo. Registrar fallos existentes antes de tocar código; no introducir dependencias ni hacer refactor por estilo. |
| **1 — Prueba Cloudflare** | Solo entornos y cuentas de prueba autorizados. Meta: tratar el ID como configuración y el token como secreto; usar variables locales ignoradas o el almacén de secretos del Worker, sin imprimirlos. No usar datos de clientes ni cambiar producción. Si el token se expone, revocarlo/rotarlo antes de seguir. Las pruebas automáticas usan mocks/fixtures. |
| **2 — Límites y contexto** | No cambiar el comportamiento observable del runtime local. No mover/renombrar masivamente `src/`; el conector local permanece aislado y el núcleo no importa SDKs o bindings de infraestructura. |
| **3 — Portal y tenants** | El login del portal y el OAuth de Calendar son decisiones/credenciales distintas. Toda lectura y escritura se autoriza en servidor por tenant; no confiar en ocultar vistas o botones en el frontend. |
| **4 — Google Calendar** | Scope mínimo y consentimiento claro; jamás persistir refresh tokens en texto plano ni registrarlos. Un error/revocación de Calendar bloquea la confirmación, no genera un resultado exitoso de respaldo. |
| **5 — WhatsApp Business** | Implementar el adaptador de Business API separado del de WhatsApp Web. El número/ID/token entregados son de prueba y no equivalen a credenciales de producción. No prometer entrega exactamente una vez si el proveedor no la garantiza; automatizaciones no llaman a Meta. |
| **6 — Flujos de cita** | Calendar sigue siendo la fuente de verdad; revalidar antes de reservar. El límite global de tres debe ser atómico. No cambiar las reglas Local sin regresiones ni completar datos ambiguos por suposición. |
| **7 — Expiración y UX** | No usar temporizadores en memoria como única persistencia. Texto es el camino completo de respaldo; WhatsApp Flows no es requisito para lanzar. Respetar la entrega saliente al menos una vez si no puede garantizarse exactamente una vez. |
| **8 — Piloto** | No abrir a usuarios externos hasta completar los gates de OAuth, Meta, privacidad, seguridad y operación. No incluir reprogramación, aviso independiente al barbero ni números propios de negocio en este MVP. |

## 8. Sitio web: propuesta de estructura y diseño

El cliente agenda por WhatsApp; el portal está dirigido al propietario y no
reemplaza el chat por un formulario web de reservas.

### Sitio público

- El sitio existente es el de **iQDevTech**, desplegado actualmente en
  `https://iq-devtech.iqdevtech.workers.dev/`. Su inicio ya presenta Seresta
  como producto, con una descripción de Seresta Local en validación y Business
  como propuesta futura.
- El código fuente compartido es
  [`JohanGar-Dev/iQ-DevTech`](https://github.com/JohanGar-Dev/iQ-DevTech), un
  repositorio distinto del motor local. La raíz visible contiene archivos
  estáticos y no muestra un `package.json`; confirmar su flujo de despliegue
  antes de integrarle cambios.
- El estilo visible es limpio y editorial, con fondo claro, azul/navy y CTA
  amarillo. Se acordó presentar Seresta como producto avalado por iQDevTech,
  con identidad propia pero relacionada. El creador del sitio confirma que
  puede modificarlo; se podrá mejorar la página pública para explicar Seresta.
- **Inicio:** explicación breve de Seresta, beneficio para el local, cómo
  funciona el intermediario y CTA principal “Registrar mi local”.
- **Producto Seresta:** explicar las modalidades Local e Intermediario como
  productos separados. La modalidad de números propios queda como futura y no
  debe presentarse como disponible.
- **Cómo funciona:** registro del propietario, autorización del calendario,
  enlace que comparte con clientes y agenda en los calendarios de trabajadores.
- **Planes:** precio por trabajador y límites, cuando se decidan; no publicar
  valores antes de calcularlos.
- **Acceso/registro**, centro de ayuda/contacto, términos y privacidad.

### Portal del propietario

1. **Registro y cuenta:** datos de acceso y verificación del propietario.
2. **Datos del local:** nombre, ciudad, dirección/contacto y zona horaria.
3. **Trabajadores:** alta/baja, nombre, calendario y horario semanal individual.
4. **Servicios:** catálogo común con duración/precio y selección de qué
   trabajadores ofrecen cada servicio.
5. **Google Calendar:** autorización, creación de calendarios y estados claros
   (conectado, falta permiso, reconectar, error).
6. **Revisión:** confirmar información, horarios, servicios y calendario antes
   de activar el enlace.
7. **Compartir WhatsApp:** enlace `wa.me`, botón de copiar y QR descargable con
   el identificador de enrutamiento del local.
8. **Resumen y ajustes:** estado de conexión, datos del local, agenda por
   trabajador, enlace para clientes, cuenta y plan.

### Criterios visuales

- Diseño primero para móvil; los propietarios probablemente configuran desde
  un teléfono, aunque el calendario se consulta también en escritorio.
- Apariencia cálida y profesional para barberías/peluquerías, todavía sin
  fijar colores, tipografía o identidad gráfica definitivos.
- Asistente por pasos con progreso visible, campos grandes, instrucciones
  concretas y opción de volver sin perder lo guardado.
- Usar estados y texto además del color; mensajes entendibles para permisos,
  errores de Calendar y datos incompletos.
- Explicar qué permiso de Google se solicita antes de OAuth. No pedir ni guardar
  contraseñas de Google.
- No mostrar una cita como creada hasta tener confirmación del Calendar.

El acuerdo es presentar y ofrecer Seresta dentro del ecosistema iQDevTech, con
posibilidad de convertir el sitio en una **plataforma multiproducto**. Esto no
obliga a acoplar el portal autenticado al código o al despliegue del marketing.
La recomendación de arquitectura es mantener una aplicación del portal
separada en el monorepo `FelipeGar17/Seresta`, compartiendo el núcleo con el
runtime local mediante límites explícitos, y publicarla bajo el dominio de
iQDevTech con una ruta o subdominio propio. Así el cliente percibe un mismo
ecosistema, mientras que autenticación, permisos, despliegues y reversión del
portal permanecen aislados.

Se acordó que la página pública de Seresta viva en una ruta del sitio iQDevTech
(por ejemplo, `/productos/seresta`) y que el portal sea una aplicación y
despliegue separados bajo un subdominio de iQDevTech (por ejemplo,
`app.<dominio>/seresta`). La idea de largo plazo se puede describir como un
**portal multiproducto de iQDevTech**, con Seresta como uno de sus productos.
El backend debe autenticar y autorizar cada operación; ocultar vistas en el
frontend no protege los datos. Falta elegir el dominio real y confirmar el
enrutamiento/despliegue que lo hará posible en Cloudflare.

La URL actual termina en `workers.dev`; antes de publicar registro/OAuth para
propietarios se debe definir un dominio controlado por iQDevTech/Seresta,
configurar HTTPS y verificarlo en Google. Google requiere que la página pública
y las políticas de privacidad/términos para una aplicación OAuth externa de
producción estén en dominios verificados que controle el producto.

## 9. Casos de uso del MVP

| ID | Actor y objetivo | Flujo principal | Resultado y casos alternativos |
|---|---|---|---|
| **UC-01** | Propietario registra un local | Completa datos, trabajadores, horarios, servicios y elegibilidad de servicios por trabajador. | El local queda en estado de configuración; errores de validación indican el campo y cómo corregirlo. |
| **UC-02** | Propietario conecta Google | Autoriza su cuenta; Seresta crea un Calendar por trabajador y guarda sus IDs. | El local solo se activa si Calendar queda accesible; revocación/expiración cambia el estado y bloquea confirmaciones falsas. |
| **UC-03** | Propietario comparte el acceso | Revisa que se creó un calendario por trabajador y decide en Google los permisos para trabajadores o secretaria. | Cada persona obtiene solo el acceso que configuró el propietario. |
| **UC-04** | Propietario comparte el enlace Seresta | Copia el enlace prellenado o descarga un QR. | El enlace abre el número central y conserva la identificación del local. |
| **UC-05** | Cliente nuevo llega desde el enlace | Escribe a Seresta; el webhook resuelve el local y se inicia la conversación. | No se pide el ID de forma innecesaria; un ID inválido/inactivo no puede seleccionar otro negocio por aproximación silenciosa. |
| **UC-06** | Cliente nuevo no tiene el enlace | Busca por nombre; si hay homónimos, da ciudad y confirma el resultado. | Seresta no inicia una reserva hasta que el cliente confirme el local. |
| **UC-07** | Cliente que ya reservó vuelve | Seresta pregunta si quiere el último local confirmado; el cliente continúa o busca otro. | Solo se reemplaza el último local recordado después de confirmar una reserva en el nuevo local. |
| **UC-08** | Cliente agenda con un trabajador | Elige servicio/trabajador, indica fecha y elige o escribe horario; el bot valida Calendar y pide confirmación final. | Al confirmar se inserta un único evento en el Calendar correcto. Si el horario cambió, no se confirma y se ofrecen opciones actualizadas. |
| **UC-09** | Cliente consulta sin reservar | Pregunta por horarios, servicios o precios. | La consulta no crea evento ni consume el límite de tres citas. |
| **UC-10** | Cliente cancela una cita | Seresta identifica las citas futuras confirmadas del cliente, pide elegir y confirma la cancelación. | Se elimina el evento correspondiente; no hay límite diario de cancelaciones acordado. |
| **UC-11** | Cliente abandona una reserva | Sin confirmación durante diez minutos desde el último mensaje del bot, el flujo se cierra y se libera el borrador. | Se envía despedida con botón que reanuda en ese local; no se deja un evento provisional en Calendar. |
| **UC-12** | Cliente llega al límite global | Intenta crear una cuarta cita en el mismo día desde cualquier local. | Se explica el límite; cancelar una cita no repone el cupo. Solo cuenta una creación exitosa en Calendar. |
| **UC-13** | Webhook duplica o reintenta un mensaje | Meta vuelve a entregar el mismo ID externo o el backend se reinicia. | No duplica efectos de negocio, reserva ni cupo. La entrega de una respuesta puede repetirse si el envío externo tuvo éxito pero falló el acuse local; documentar y mitigar esa entrega al menos una vez. |
| **UC-14** | Cliente pide borrar datos de Seresta | Seresta elimina su asociación/perfil seudonimizado según la política acordada. | No se elimina automáticamente un evento del Calendar del propietario; se informa este límite. La retención del contador antiabuso queda pendiente. |

### Criterios de aceptación para el piloto

- Una conversación queda siempre enlazada a un solo local y cada Calendar/evento
  pertenece al local y trabajador seleccionados.
- No se crea una reserva en Calendar antes de la confirmación del cliente; no
  se promete éxito si Calendar no confirmó la escritura.
- La tercera cita diaria se permite y la cuarta se bloquea por identidad de
  WhatsApp global, incluso si es en otro local; una cancelación no libera el
  cupo.
- Un mensaje repetido o un reinicio no genera una segunda cita.
- El cierre y el botón de reanudación siguen funcionando después de reiniciar
  el backend.
- Si Flows/botones no están disponibles, el cliente puede completar el flujo
  por texto.
- El producto local continúa funcionando con su configuración y conector
  existentes, sin pedir el ID de un local del intermediario.

## 10. Pendientes para la próxima sesión

1. **Despliegue:** Cloudflare queda elegido para la primera prueba técnica; aún
   falta validar Pages vs Worker Static Assets, Workers, D1 y Workflows/Cron, así
   como compatibilidad, límites y costo antes de elegir producción. Node.js
   administrado queda como alternativa. La web actual es
   `https://iq-devtech.iqdevtech.workers.dev/`; su repositorio es
   `JohanGar-Dev/IQ-DevTech`, estático en la raíz y modificable por el usuario;
   falta confirmar el pipeline y el enrutamiento del subdominio del portal.
2. **OAuth:** comprobar publicación y verificación del proyecto, scopes mínimos
   para crear calendarios y operación sostenida de refresh tokens. La guía
   oficial de [audiencia y estado de publicación OAuth](https://support.google.com/cloud/answer/15549945?hl=en)
   explica el límite de test users y la expiración en Testing.
3. **Cuotas de Google:** la guía oficial de [cuotas de Calendar API](https://developers.google.com/workspace/calendar/api/guides/quota)
   describe cuotas por proyecto y usuario. Desde mayo de 2026, la documentación
   muestra límites por minuto y un umbral diario de facturación por proyecto;
   se debe revisar el proyecto concreto y las condiciones vigentes antes de
   prometer que el costo es cero. El dato de “100 cuentas” no debe usarse como
   límite gratuito de calendarios: puede confundirse con usuarios de prueba
   OAuth.
4. **Meta:** revisar [precios oficiales de WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing),
   ventana de servicio, categorías y tarifas para Colombia al momento de lanzar.
   No se presupone que todo mensaje de salida sea gratuito; el aviso al barbero
   continúa fuera del MVP.
5. **WhatsApp Flows:** la documentación oficial lista componentes de fecha y
   calendario en los [componentes de Flows](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components.md/).
   Falta probar si la experiencia deseada puede consultar horarios en tiempo
   real y volver al diálogo de Seresta.
6. **Límite global y borrado:** acordar cuánto dura el contador seudonimizado
   diario y qué pasa si una solicitud de borrado llega antes de medianoche.
7. **Reglas de citas:** confirmar si el límite global de tres es solo por día o
   también hay un máximo de citas futuras simultáneas; definir hasta cuándo se
   puede cancelar una cita confirmada.
8. **Calendar y datos personales:** definir qué ocurre con información de una
   cita guardada en el Calendar del propietario cuando el cliente pide borrar
   sus datos de Seresta.
9. **Suscripción:** definir prueba gratuita, niveles, límites por trabajadores y
   método de cobro. La idea de precio por trabajador está acordada; los valores
   no.
10. **Acceso de trabajadores:** documentar que el propietario administra o
    comparte permisos desde Google; decidir si el portal de Seresta necesitará
    roles para propietario y secretaria en el MVP.
11. **Diseño:** acordar logo/identidad, colores y tipografía definitivos de la
    submarca Seresta; mejorar la página pública de producto en iQDevTech.
12. **Flows:** decidir qué pasos van en un WhatsApp Flow frente a la
    conversación normal; validar fecha visual, horarios dinámicos, respuesta
    escrita y compatibilidad en clientes de WhatsApp.
13. **Dominio:** Seresta se ofrecerá dentro del ecosistema iQDevTech; la
    página pública irá en el sitio existente y el portal en un subdominio con
    despliegue independiente. Falta elegir/configurar el dominio real (el
    actual usa `workers.dev`) y verificarlo para Google OAuth.
14. **Despliegue del sitio:** confirmar el pipeline actual de
    `JohanGar-Dev/IQ-DevTech` y validar el enrutamiento del subdominio del
    portal en Cloudflare.

## 11. Referencias del proyecto

- [README del producto](./README.md)
- [Composición actual](./src/index.ts)
- [Contratos de WhatsApp](./src/connectors/whatsapp/whatsapp-connector.ts)
- [Procesador de mensajes](./src/core/messaging/incoming-message-processor.ts)
- [Contrato de agenda](./src/core/reservations/reservation-calendar.ts)
- [Persistencia SQLite local](./src/core/storage/sqlite-storage.ts)
- [Sitio actual de iQDevTech](https://iq-devtech.iqdevtech.workers.dev/)
- [Repositorio web de iQDevTech](https://github.com/JohanGar-Dev/iQ-DevTech)
- [Repositorio Seresta](https://github.com/FelipeGar17/Seresta)
- [Spike aislado Cloudflare](./spikes/cloudflare-viability/README.md)
