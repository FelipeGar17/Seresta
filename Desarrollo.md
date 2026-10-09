Arranque del proyecto

Asumo que estás en Windows o Mac/Linux con Node.js ya instalado. Abre la terminal integrada de VS Code (Ctrl + `) dentro de la carpeta del proyecto.

1. Verificar Node y npm
bash
node -v
npm -v

Si no los tienes, instala la versión LTS desde nodejs.org. Para este proyecto, Node 20 o superior está bien.

2. Inicializar el proyecto
bash
npm init -y
git init
3. Instalar TypeScript y Vitest
bash
npm install -D typescript vitest tsx @types/node
npx tsc --init
tsx te permite ejecutar archivos .ts directamente sin compilar mientras desarrollas.
vitest es para las pruebas.

Por ahora no instales whatsapp-web.js ni googleapis: empezamos con el motor puro, como acordamos.

4. Configurar tsconfig.json

Reemplaza el contenido generado por esto (más limpio):

json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true
  },
  "include": ["src", "tests"]
}
5. Scripts en package.json

Agrega esto dentro de "scripts" y pon "type": "module":

json
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
6. .gitignore

Crea el archivo con:

node_modules/
dist/
.env
.wwebjs_auth/
.wwebjs_cache/
data/
*.log

Esto ya protege la sesión de WhatsApp, los tokens y las variables de entorno.

Estructura de archivos
mipes-bot/
├── src/
│   ├── core/
│   │   ├── engine.ts              # Orquesta: recibe mensaje, devuelve respuesta
│   │   ├── nlp/
│   │   │   ├── normalize.ts       # Mayúsculas, tildes, espacios
│   │   │   ├── tokenize.ts
│   │   │   ├── intents.ts         # Detección de intenciones
│   │   │   ├── entities.ts        # Fechas, horas, servicios, nombres
│   │   │   └── synonyms.ts
│   │   ├── conversation/
│   │   │   ├── state.ts           # Modelo de estado de la conversación
│   │   │   ├── store.ts           # Interfaz del almacén (memoria, D1...)
│   │   │   └── memory-store.ts    # Implementación en memoria con expiración
│   │   ├── booking/
│   │   │   ├── flow.ts            # Flujo de reserva paso a paso
│   │   │   └── rules.ts           # Validaciones (horarios, campos obligatorios)
│   │   └── types.ts               # Tipos compartidos
│   ├── ports/
│   │   ├── messaging.ts           # Interfaz que cumple cualquier conector
│   │   └── calendar.ts            # Interfaz que cumple cualquier calendario
│   ├── connectors/
│   │   ├── console/
│   │   │   └── cli.ts             # Conector de consola para probar sin WhatsApp
│   │   ├── whatsapp-web/          # (más adelante)
│   │   └── whatsapp-business/     # (más adelante)
│   ├── calendar/
│   │   ├── fake-calendar.ts       # Calendario simulado para desarrollo
│   │   └── google-calendar.ts     # (más adelante)
│   ├── config/
│   │   ├── business.schema.ts     # Forma de la configuración de un negocio
│   │   └── loader.ts
│   ├── persistence/
│   └── index.ts
├── config/
│   └── business.example.json      # Servicios, precios, horarios de ejemplo
├── tests/
│   ├── unit/
│   │   ├── normalize.test.ts
│   │   └── intents.test.ts
│   ├── integration/
│   │   └── booking-flow.test.ts
│   └── fixtures/
│       └── conversations.ts       # Conversaciones simuladas
├── docs/
│   └── spec-v0.3.md
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md