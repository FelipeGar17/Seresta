import type { Identifier } from '../types.js';
import {
  initializeSqliteSchema,
  type SqliteDatabase,
} from '../storage/sqlite-schema.js';
import type {
  IncomingMessageRecord,
  IncomingMessageInput,
  IncomingMessageStatus,
  IncomingMessageStore,
} from './incoming-message-store.js';

interface IncomingMessageRow {
  message_id: string;
  business_id: string;
  contact_id: string;
  whatsapp_id: string | null;
  customer_phone: string | null;
  body: string;
  received_at: string;
  status: string;
  reply: string | null;
  failed_attempts: number;
}

const isIncomingMessageStatus = (
  value: string,
): value is IncomingMessageStatus =>
  [
    'pending',
    'processing',
    'reply-pending',
    'sent',
  ].includes(value);

const parseDate = (value: string): Date => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid received_at stored in WhatsApp inbox');
  }
  return date;
};

const decode = (row: IncomingMessageRow): IncomingMessageRecord => {
  if (!isIncomingMessageStatus(row.status)) {
    throw new Error(`Unknown WhatsApp inbox status "${row.status}"`);
  }

  return {
    messageId: row.message_id,
    businessId: row.business_id,
    contactId: row.contact_id,
    whatsappId: row.whatsapp_id ?? row.contact_id,
    ...(row.customer_phone ? { customerPhone: row.customer_phone } : {}),
    body: row.body,
    receivedAt: parseDate(row.received_at),
    status: row.status,
    ...(row.reply === null ? {} : { reply: row.reply }),
    failedAttempts: row.failed_attempts,
  };
};

export class SqliteIncomingMessageStore implements IncomingMessageStore {
  constructor(private readonly database: SqliteDatabase) {
    initializeSqliteSchema(database);
  }

  async enqueue(
    message: IncomingMessageInput,
  ): Promise<boolean> {
    if (
      typeof message.messageId !== 'string' ||
      message.messageId.trim().length === 0 ||
      typeof message.contactId !== 'string' ||
      message.contactId.trim().length === 0
    ) {
      throw new Error('WhatsApp message and contact IDs are required');
    }
    if (Number.isNaN(message.receivedAt.getTime())) {
      throw new Error('WhatsApp message timestamp is invalid');
    }

    const result = this.database
      .prepare(
        `INSERT INTO whatsapp_inbox (
          message_id, business_id, contact_id, whatsapp_id, customer_phone, body,
          received_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
        ON CONFLICT(message_id) DO NOTHING`,
      )
      .run(
        message.messageId,
        message.businessId,
        message.contactId,
        message.whatsappId ?? message.contactId,
        message.customerPhone ?? null,
        message.body,
        message.receivedAt.toISOString(),
      );

    return result.changes === 1;
  }

  async listUndeliveredContactIds(): Promise<Identifier[]> {
    const rows = this.database
      .prepare(
        `SELECT contact_id
         FROM whatsapp_inbox
         WHERE status != 'sent'
         GROUP BY contact_id
         ORDER BY MIN(sequence)`,
      )
      .all() as { contact_id: string }[];

    return rows.map(({ contact_id }) => contact_id);
  }

  async getNextUndelivered(
    contactId: Identifier,
  ): Promise<IncomingMessageRecord | null> {
    const row = this.database
      .prepare(
        `SELECT message_id, business_id, contact_id, whatsapp_id,
                customer_phone, body, received_at, status, reply,
                failed_attempts
         FROM whatsapp_inbox
         WHERE contact_id = ? AND status != 'sent'
         ORDER BY sequence
         LIMIT 1`,
      )
      .get(contactId) as IncomingMessageRow | undefined;

    return row ? decode(row) : null;
  }

  async claim(messageId: Identifier): Promise<IncomingMessageRecord | null> {
    const result = this.database
      .prepare(
        `UPDATE whatsapp_inbox
         SET status = 'processing'
         WHERE message_id = ? AND status = 'pending'`,
      )
      .run(messageId);
    if (result.changes === 0) return null;

    const row = this.database
      .prepare(
        `SELECT message_id, business_id, contact_id, whatsapp_id,
                customer_phone, body, received_at, status, reply,
                failed_attempts
         FROM whatsapp_inbox
         WHERE message_id = ? AND status IN ('pending', 'processing')`,
      )
      .get(messageId) as IncomingMessageRow | undefined;

    return row ? decode(row) : null;
  }

  async saveReply(messageId: Identifier, reply: string): Promise<void> {
    const result = this.database
      .prepare(
        `UPDATE whatsapp_inbox
         SET reply = ?, status = 'reply-pending'
         WHERE message_id = ? AND status = 'processing'`,
      )
      .run(reply, messageId);

    if (result.changes === 0) {
      throw new Error(`WhatsApp inbox message "${messageId}" is not processing`);
    }
  }

  async markSent(messageId: Identifier): Promise<void> {
    const result = this.database
      .prepare(
        `UPDATE whatsapp_inbox
         SET status = 'sent', contact_id = '', whatsapp_id = NULL,
             customer_phone = NULL, body = '', reply = NULL
         WHERE message_id = ? AND status = 'reply-pending'`,
      )
      .run(messageId);

    if (result.changes === 0) {
      const current = this.database
        .prepare('SELECT status FROM whatsapp_inbox WHERE message_id = ?')
        .get(messageId) as { status: string } | undefined;
      if (current?.status !== 'sent') {
        throw new Error(`WhatsApp inbox message "${messageId}" has no pending reply`);
      }
    }
  }

  async retry(messageId: Identifier): Promise<void> {
    const result = this.database
      .prepare(
        `UPDATE whatsapp_inbox
         SET status = 'pending', failed_attempts = failed_attempts + 1
         WHERE message_id = ? AND status = 'processing'`,
      )
      .run(messageId);

    if (result.changes === 0) {
      throw new Error(`WhatsApp inbox message "${messageId}" is not processing`);
    }
  }

  async recoverInterrupted(): Promise<number> {
    const result = this.database
      .prepare(
        `UPDATE whatsapp_inbox
         SET status = 'pending', failed_attempts = failed_attempts + 1
         WHERE status = 'processing'`,
      )
      .run();

    return Number(result.changes);
  }
}
