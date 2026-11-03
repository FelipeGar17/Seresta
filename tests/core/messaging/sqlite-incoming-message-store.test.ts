import { describe, expect, it } from 'vitest';
import { openSqliteStorage } from '../../../src/core/storage/sqlite-storage.js';

describe('SqliteIncomingMessageStore', () => {
  it('deduplica IDs, conserva orden y borra el contenido personal al enviar', async () => {
    const storage = openSqliteStorage(':memory:');
    try {
      const receivedAt = new Date('2026-10-15T15:00:00.000Z');
      const input = {
        messageId: 'message-1',
        businessId: 'business-1',
        contactId: 'contact-1@lid',
        whatsappId: '573000000001@c.us',
        customerPhone: '+573000000001',
        body: 'Quiero agendar una cita',
        receivedAt,
      };

      await expect(storage.incomingMessages.enqueue(input)).resolves.toBe(true);
      await expect(storage.incomingMessages.enqueue(input)).resolves.toBe(false);
      await storage.incomingMessages.enqueue({
        ...input,
        messageId: 'message-2',
        body: 'mañana',
      });

      await expect(
        storage.incomingMessages.getNextUndelivered(input.contactId),
      ).resolves.toMatchObject({
        messageId: 'message-1',
        whatsappId: input.whatsappId,
        customerPhone: input.customerPhone,
      });
      await storage.incomingMessages.claim(input.messageId);
      await storage.incomingMessages.saveReply(input.messageId, '¿A qué hora?');
      await storage.incomingMessages.markSent(input.messageId);

      const sentRow = storage.database
        .prepare(
          `SELECT contact_id, whatsapp_id, customer_phone, body, reply, status
           FROM whatsapp_inbox WHERE message_id = ?`,
        )
        .get(input.messageId) as {
        contact_id: string;
        whatsapp_id: string | null;
        customer_phone: string | null;
        body: string;
        reply: string | null;
        status: string;
      };

      expect(sentRow).toEqual({
        contact_id: '',
        whatsapp_id: null,
        customer_phone: null,
        body: '',
        reply: null,
        status: 'sent',
      });
      await expect(
        storage.incomingMessages.getNextUndelivered(input.contactId),
      ).resolves.toMatchObject({ messageId: 'message-2' });
    } finally {
      storage.close();
    }
  });

  it('restaura los mensajes en procesamiento después de un reinicio', async () => {
    const storage = openSqliteStorage(':memory:');
    try {
      await storage.incomingMessages.enqueue({
        messageId: 'message-1',
        businessId: 'business-1',
        contactId: 'contact-1@lid',
        body: 'hola',
        receivedAt: new Date('2026-10-15T15:00:00.000Z'),
      });
      await storage.incomingMessages.claim('message-1');

      await expect(storage.incomingMessages.recoverInterrupted()).resolves.toBe(
        1,
      );
      await expect(
        storage.incomingMessages.getNextUndelivered('contact-1@lid'),
      ).resolves.toMatchObject({
        messageId: 'message-1',
        status: 'pending',
        failedAttempts: 1,
      });
    } finally {
      storage.close();
    }
  });
});
