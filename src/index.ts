import { loadBusinessConfig } from './config/load-config.js';
import { GoogleCalendarConnector } from './connectors/google-calendar/google-calendar-connector.js';
import type { WhatsAppConnector } from './connectors/whatsapp/whatsapp-connector.js';
import { WhatsAppWebConnector } from './connectors/whatsapp/whatsapp-web-connector.js';
import { ConversationCoordinator } from './core/conversation/coordinator.js';
import { IncomingMessageProcessor } from './core/messaging/incoming-message-processor.js';
import { purgeCancelledReservations } from './core/reservations/reservation-retention.js';
import {
  DEFAULT_SQLITE_PATH,
  openSqliteStorage,
} from './core/storage/sqlite-storage.js';

const main = async (): Promise<void> => {
  const businessConfigPath =
    process.env.BUSINESS_CONFIG_PATH ?? 'negocio.json';
  const business = loadBusinessConfig(businessConfigPath);
  console.log(`Configuración del negocio validada: ${businessConfigPath}.`);

  const calendar = await GoogleCalendarConnector.create();
  const calendarCheckFrom = new Date();
  await calendar.listBusyAppointments(
    business,
    calendarCheckFrom,
    new Date(calendarCheckFrom.getTime() + 60_000),
  );
  console.log(`Google Calendar conectado: ${business.googleCalendarId}.`);

  const storage = openSqliteStorage(
    process.env.SQLITE_DATABASE_PATH ?? DEFAULT_SQLITE_PATH,
  );
  let whatsapp: WhatsAppConnector | undefined;
  let processor: IncomingMessageProcessor | undefined;
  let shuttingDown = false;

  try {
    const purgedReservations = await purgeCancelledReservations(
      storage.reservations,
      new Date(),
    );
    if (purgedReservations > 0) {
      console.log(`Citas canceladas antiguas depuradas: ${purgedReservations}.`);
    }

    const coordinator = new ConversationCoordinator(storage.conversations, {
      reservations: storage.reservations,
      calendar,
    });
    const messageProcessor = new IncomingMessageProcessor(
      storage.incomingMessages,
      coordinator,
      (whatsapp = new WhatsAppWebConnector()),
      business,
    );
    processor = messageProcessor;

    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`${signal}: cerrando WhatsApp y SQLite...`);
      try {
        await whatsapp?.close();
      } finally {
        try {
          await processor?.waitForCurrentWork();
        } finally {
          storage.close();
        }
      }
    };

    process.once('SIGINT', () => {
      void shutdown('SIGINT').catch((error: unknown) => {
        console.error('Error al cerrar la aplicación:', error);
        process.exitCode = 1;
      });
    });
    process.once('SIGTERM', () => {
      void shutdown('SIGTERM').catch((error: unknown) => {
        console.error('Error al cerrar la aplicación:', error);
        process.exitCode = 1;
      });
    });

    await whatsapp.start(
      (message) => messageProcessor.accept(message),
      async () => {
        await messageProcessor.recover();
        await storage.conversations.deleteExpired();
      },
    );
    console.log('Sistema iniciado. Esperando mensajes de WhatsApp.');
  } catch (error) {
    try {
      await whatsapp?.close();
    } catch (closeError) {
      const detail =
        closeError instanceof Error ? closeError.message : String(closeError);
      console.error(`No se pudo cerrar el cliente de WhatsApp: ${detail}`);
    } finally {
      try {
        await processor?.waitForCurrentWork();
      } finally {
        storage.close();
      }
    }
    throw error;
  }
};

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`No se pudo iniciar el sistema de citas: ${detail}`);
  process.exitCode = 1;
});
