import { loadBusinessConfig } from './config/load-config.js';
import { GoogleCalendarConnector } from './connectors/google-calendar/google-calendar-connector.js';
import type { WhatsAppConnector } from './connectors/whatsapp/whatsapp-connector.js';
import { WhatsAppWebConnector } from './connectors/whatsapp/whatsapp-web-connector.js';
import { ConversationCoordinator } from './core/conversation/coordinator.js';
import { IncomingMessageProcessor } from './core/messaging/incoming-message-processor.js';
import {
  purgeCancelledReservations,
  purgeStalePendingReservations,
} from './core/reservations/reservation-retention.js';
import {
  DEFAULT_SQLITE_PATH,
  openSqliteStorage,
} from './core/storage/sqlite-storage.js';

// Cada cuánto se reintenta la cola y se depuran conversaciones/reservas vencidas.
const MAINTENANCE_INTERVAL_MS = 20_000;

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
  let maintenanceTimer: ReturnType<typeof setInterval> | undefined;
  let fatalErrorHandler: ((error: Error) => void) | undefined;
  let shuttingDown = false;

  const purgeStalePending = async (): Promise<void> => {
    const purged = await purgeStalePendingReservations(
      storage.reservations,
      new Date(),
    );
    if (purged > 0) {
      console.log(
        `Reservas provisionales abandonadas depuradas: ${purged}.`,
      );
    }
  };

  try {
    const purgedReservations = await purgeCancelledReservations(
      storage.reservations,
      new Date(),
    );
    if (purgedReservations > 0) {
      console.log(`Citas canceladas antiguas depuradas: ${purgedReservations}.`);
    }
    await purgeStalePending();

    const coordinator = new ConversationCoordinator(storage.conversations, {
      reservations: storage.reservations,
      calendar,
    });
    const connector = new WhatsAppWebConnector({
      onFatalError: (error) => fatalErrorHandler?.(error),
    });
    whatsapp = connector;
    const messageProcessor = new IncomingMessageProcessor(
      storage.incomingMessages,
      coordinator,
      connector,
      business,
    );
    processor = messageProcessor;

    // Reintenta la cola y ejecuta la retención sin bloquear la atención de
    // mensajes. Un tick lento no debe solaparse con el siguiente.
    let maintenanceRunning = false;
    const runMaintenance = async (): Promise<void> => {
      if (maintenanceRunning || shuttingDown) return;
      maintenanceRunning = true;
      try {
        await messageProcessor.drainPending();
        await storage.conversations.deleteExpired();
        await purgeStalePending();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`Falló el mantenimiento periódico: ${detail}`);
      } finally {
        maintenanceRunning = false;
      }
    };

    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      if (maintenanceTimer) {
        clearInterval(maintenanceTimer);
        maintenanceTimer = undefined;
      }
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

    fatalErrorHandler = (error: Error): void => {
      console.error(`WhatsApp requiere intervención: ${error.message}`);
      process.exitCode = 1;
      void shutdown('WhatsApp desconectado').catch((closeError: unknown) => {
        console.error('Error al cerrar tras la desconexión:', closeError);
      });
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
        // Idempotente: se repite en cada reconexión para recuperar el trabajo
        // que quedó interrumpido mientras WhatsApp estaba caído.
        await messageProcessor.recover();
        await storage.conversations.deleteExpired();
        await purgeStalePending();
      },
    );

    maintenanceTimer = setInterval(() => {
      void runMaintenance();
    }, MAINTENANCE_INTERVAL_MS);
    maintenanceTimer.unref?.();

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
