import { afterEach, describe, expect, it } from 'vitest';
import type {
  ConfiguracionNegocio,
  Conversation,
} from '../../../src/core/types.js';
import { parseBusinessConfig } from '../../../src/config/load-config.js';
import { IncomingMessageProcessor } from '../../../src/core/messaging/incoming-message-processor.js';
import { openSqliteStorage, type SqliteStorage } from '../../../src/core/storage/sqlite-storage.js';
import type { IncomingConversationHandler } from '../../../src/core/messaging/incoming-message-processor.js';

const business: ConfiguracionNegocio = parseBusinessConfig({
  businessId: 'business-1',
  nombre: 'Barbería',
  zonaHoraria: 'America/Bogota',
  whatsappNumero: '+573000000000',
  calendarId: 'calendar-1',
  servicios: [
    {
      id: 'service-1',
      nombre: 'Corte',
      precio: 20_000,
      duracionMinutos: 30,
      activo: true,
    },
  ],
  horariosAtencion: {
    friday: [{ abreA: '08:00', cierraA: '18:00' }],
  },
});

const storages: SqliteStorage[] = [];

afterEach(() => {
  for (const storage of storages.splice(0)) storage.close();
});

const createProcessor = (
  handler: IncomingConversationHandler,
  sent: string[],
): { processor: IncomingMessageProcessor; storage: SqliteStorage } => {
  const storage = openSqliteStorage(':memory:');
  storages.push(storage);
  return {
    storage,
    processor: new IncomingMessageProcessor(
      storage.incomingMessages,
      handler,
      {
        async sendMessage(chatId, body) {
          sent.push(`${chatId}:${body}`);
        },
      },
      business,
    ),
  };
};

const conversation = (
  message: { contactId: string; whatsappId: string },
): Conversation => ({
  id: 'conversation-1',
  businessId: 'business-1',
  contactId: message.contactId,
  whatsappId: message.whatsappId,
  intent: 'unknown',
  state: 'idle',
  messages: [],
  data: {},
  expiresAt: null,
  createdAt: new Date('2026-10-15T15:00:00.000Z'),
  updatedAt: new Date('2026-10-15T15:00:00.000Z'),
});

const received = (messageId: string, body: string) => ({
  messageId,
  contactId: 'contact-1@lid',
  whatsappId: '573000000001@c.us',
  customerPhone: '+573000000001',
  body,
  receivedAt: new Date('2026-10-15T15:00:00.000Z'),
});

describe('IncomingMessageProcessor', () => {
  it('procesa mensajes del mismo contacto en orden FIFO y los envía una vez', async () => {
    const processed: string[] = [];
    const sent: string[] = [];
    const handler: IncomingConversationHandler = {
      async handleMessage(input) {
        processed.push(input.message);
        if (input.message === 'primero') {
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
        return {
          conversation: conversation(input),
          reply: `respuesta:${input.message}`,
          nextField: null,
        };
      },
    };
    const { processor } = createProcessor(handler, sent);

    await processor.accept(received('message-1', 'primero'));
    await processor.accept(received('message-2', 'segundo'));
    await processor.drainPending();

    expect(processed).toEqual(['primero', 'segundo']);
    expect(sent).toEqual([
      'contact-1@lid:respuesta:primero',
      'contact-1@lid:respuesta:segundo',
    ]);
  });

  it('deduplica IDs de WhatsApp y recupera mensajes interrumpidos', async () => {
    const processed: string[] = [];
    const sent: string[] = [];
    const handler: IncomingConversationHandler = {
      async handleMessage(input) {
        processed.push(input.message);
        return {
          conversation: conversation(input),
          reply: `respuesta:${input.message}`,
          nextField: null,
        };
      },
    };
    const { processor, storage } = createProcessor(handler, sent);
    const message = received('message-1', 'hola');

    await storage.incomingMessages.enqueue({
      messageId: message.messageId,
      businessId: business.businessId,
      contactId: message.contactId,
      whatsappId: message.whatsappId,
      customerPhone: message.customerPhone,
      body: message.body,
      receivedAt: message.receivedAt,
    });
    await storage.incomingMessages.claim(message.messageId);
    await expect(processor.recover()).resolves.toBeUndefined();
    await processor.accept(message);
    await processor.drainPending();

    expect(processed).toEqual(['hola']);
    expect(sent).toEqual(['contact-1@lid:respuesta:hola']);
  });

  it('reintenta mensajes cuyo coordinador falló antes de guardar la respuesta', async () => {
    let attempts = 0;
    const sent: string[] = [];
    const handler: IncomingConversationHandler = {
      async handleMessage(input) {
        attempts += 1;
        if (attempts === 1) throw new Error('fallo temporal');
        return {
          conversation: conversation(input),
          reply: 'respuesta recuperada',
          nextField: null,
        };
      },
    };
    const { processor, storage } = createProcessor(handler, sent);
    const message = received('message-1', 'hola');

    await processor.accept(message);
    await processor.waitForCurrentWork();
    await expect(
      storage.incomingMessages.getNextUndelivered(message.contactId),
    ).resolves.toMatchObject({ status: 'pending', failedAttempts: 1 });

    await processor.drainPending();

    expect(attempts).toBe(2);
    expect(sent).toEqual([
      'contact-1@lid:respuesta recuperada',
    ]);
  });

  it('reenvía una respuesta pendiente sin volver a ejecutar el coordinador', async () => {
    let processed = 0;
    const sent: string[] = [];
    const handler: IncomingConversationHandler = {
      async handleMessage(input) {
        processed += 1;
        return {
          conversation: conversation(input),
          reply: 'respuesta duplicada',
          nextField: null,
        };
      },
    };
    const { processor, storage } = createProcessor(handler, sent);
    const message = received('message-1', 'hola');
    await storage.incomingMessages.enqueue({
      messageId: message.messageId,
      businessId: business.businessId,
      contactId: message.contactId,
      whatsappId: message.whatsappId,
      body: message.body,
      receivedAt: message.receivedAt,
    });
    await storage.incomingMessages.claim(message.messageId);
    await storage.incomingMessages.saveReply(
      message.messageId,
      'respuesta guardada',
    );

    await processor.recover();

    expect(processed).toBe(0);
    expect(sent).toEqual(['contact-1@lid:respuesta guardada']);
  });
});
