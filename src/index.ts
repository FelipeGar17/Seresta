import qrcode from 'qrcode-terminal';
import whatsapp from 'whatsapp-web.js';
import { loadBusinessConfig } from './config/load-config.js';
import { ConversationCoordinator } from './core/conversation/coordinator.js';
import { isMessageReceivedAfterReady } from './core/messaging/incoming-message-policy.js';
import { purgeCancelledReservations } from './core/reservations/reservation-retention.js';
import {
  DEFAULT_SQLITE_PATH,
  openSqliteStorage,
} from './core/storage/sqlite-storage.js';

const { Client, LocalAuth } = whatsapp;

const main = async (): Promise<void> => {
  const businessConfigPath = process.env.BUSINESS_CONFIG_PATH;
  if (!businessConfigPath) {
    throw new Error(
      'Falta BUSINESS_CONFIG_PATH con la ruta al JSON del negocio.',
    );
  }

  const business = loadBusinessConfig(businessConfigPath);
  const storage = openSqliteStorage(
    process.env.SQLITE_DATABASE_PATH ?? DEFAULT_SQLITE_PATH,
  );
  const coordinator = new ConversationCoordinator(storage.conversations, {
    reservations: storage.reservations,
  });
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'sistema-citas',
      dataPath: '.wwebjs_auth',
    }),
    puppeteer: { headless: false },
  });
  let shuttingDown = false;
  let whatsappReadyAt: Date | undefined;

  try {
    await storage.conversations.deleteExpired();
    const purgedReservations = await purgeCancelledReservations(
      storage.reservations,
      new Date(),
    );
    if (purgedReservations > 0) {
      console.log(`Citas canceladas antiguas depuradas: ${purgedReservations}.`);
    }

    client.on('qr', (qr: string) => {
      console.log('Escanea este código QR con WhatsApp:');
      qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => {
      console.log('Sesión de WhatsApp autenticada.');
    });

    client.on('ready', () => {
      whatsappReadyAt = new Date();
      console.log(
        `WhatsApp listo para ${client.info.pushname ?? 'la cuenta autenticada'}.`,
      );
    });

    client.on('message', async (message) => {
      if (
        message.fromMe ||
        !message.body.trim() ||
        message.from.endsWith('@g.us') ||
        message.from.endsWith('@newsletter') ||
        message.from.endsWith('@broadcast')
      ) {
        return;
      }
      if (
        !whatsappReadyAt ||
        !isMessageReceivedAfterReady(message.timestamp, whatsappReadyAt)
      ) {
        console.info(
          `Mensaje anterior a la conexión lista ignorado: ${message.from}. Envía un mensaje nuevo después de que WhatsApp esté listo.`,
        );
        return;
      }

      try {
        let whatsappId = message.from;
        let customerPhone: string | undefined;
        try {
          const contact = await message.getContact();
          whatsappId = contact.id._serialized;
          const reportedPhone = contact.number.trim();
          if (reportedPhone) customerPhone = reportedPhone;
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          console.error(
            `No se pudieron leer los datos del contacto ${message.from}; continuaré usando su id de chat: ${detail}`,
          );
        }

        const result = await coordinator.handleMessage({
          business,
          contactId: message.from,
          whatsappId,
          ...(customerPhone ? { customerPhone } : {}),
          message: message.body,
        });

        await message.reply(result.reply);
        console.log(
          `Mensaje atendido para ${message.from}; estado ${result.conversation.state}.`,
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(
          `No se pudo procesar o responder al mensaje ${message.id._serialized}: ${detail}`,
        );
      }
    });

    client.on('auth_failure', (message: string) => {
      console.error(`Falló la autenticación de WhatsApp: ${message}`);
    });

    client.on('disconnected', (reason: string) => {
      console.error(`WhatsApp se desconectó: ${reason}`);
    });

    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`${signal}: cerrando WhatsApp y SQLite...`);
      try {
        await client.destroy();
      } finally {
        storage.close();
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

    await client.initialize();
  } catch (error) {
    try {
      await client.destroy();
    } catch (destroyError) {
      const detail =
        destroyError instanceof Error ? destroyError.message : String(destroyError);
      console.error(`No se pudo cerrar el cliente de WhatsApp: ${detail}`);
    } finally {
      storage.close();
    }
    throw error;
  }
};

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`No se pudo iniciar el sistema de citas: ${detail}`);
  process.exitCode = 1;
});
