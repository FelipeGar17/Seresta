

Estructura de archivos recomendada

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