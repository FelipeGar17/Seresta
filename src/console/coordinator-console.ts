import { createInterface } from 'node:readline';
import { loadBusinessConfig } from '../config/load-config.js';
import { ConversationCoordinator } from '../core/conversation/coordinator.js';
import { getPendingReservationFields } from '../core/conversation/reservation-progress.js';
import { purgeCancelledReservations } from '../core/reservations/reservation-retention.js';
import {
  DEFAULT_SQLITE_PATH,
  openSqliteStorage,
} from '../core/storage/sqlite-storage.js';

const argumentValue = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const configPath =
  argumentValue('--config') ??
  argumentValue('-c') ??
  process.env.BUSINESS_CONFIG_PATH;

if (!configPath) {
  console.error(
    'Falta la configuración del negocio. Usa --config <negocio.json>, -c <negocio.json> o BUSINESS_CONFIG_PATH.',
  );
  process.exit(1);
}

const business = loadBusinessConfig(configPath);
const storage = openSqliteStorage(
  process.env.SQLITE_DATABASE_PATH ?? DEFAULT_SQLITE_PATH,
);
const coordinator = new ConversationCoordinator(storage.conversations, {
  reservations: storage.reservations,
});

await storage.conversations.deleteExpired();
const purgedReservations = await purgeCancelledReservations(
  storage.reservations,
  new Date(),
);
if (purgedReservations > 0) {
  console.log(`Citas canceladas antiguas depuradas: ${purgedReservations}.`);
}

console.log(
  `Configuración cargada: ${business.name} (${business.businessId}).`,
);
console.log('Consola del flujo de reserva. Escribe "salir" para terminar.');

const consoleInterface = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'Tú> ',
});

let closed = false;
consoleInterface.on('close', () => {
  closed = true;
});

consoleInterface.prompt();

try {
  for await (const line of consoleInterface) {
    const text = line.trim();

    if (text.toLowerCase() === 'salir') {
      break;
    }

    if (text.length > 0) {
      try {
        const result = await coordinator.handleMessage({
          business,
          contactId: 'console-contact',
          whatsappId: 'console-whatsapp',
          message: text,
        });
        const pending = getPendingReservationFields(result.conversation.data);

        console.log(`Bot: ${result.reply}`);
        console.log(`Estado: ${result.conversation.state}`);
        console.log(`Siguiente dato: ${result.nextField ?? 'ninguno'}`);
        console.log(`Pendientes: ${pending.join(', ') || 'ninguno'}`);
        console.log(
          `Datos: ${JSON.stringify(result.conversation.data, null, 2)}`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
      }
    }

    if (!closed) {
      consoleInterface.prompt();
    }
  }
} finally {
  if (!closed) {
    consoleInterface.close();
  }
  storage.close();
}

console.log('Prueba finalizada.');
