import type {
  Conversation,
  ConversationMessage,
  Identifier,
  ReservationData,
} from '../types.js';
import {
  initializeSqliteSchema,
  type SqliteDatabase,
} from '../storage/sqlite-schema.js';
import type { ConversationStore } from './store.js';

type SerializedConversation = Omit<
  Conversation,
  'createdAt' | 'updatedAt' | 'expiresAt' | 'messages' | 'data'
> & {
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  messages: Array<Omit<ConversationMessage, 'createdAt'> & { createdAt: string }>;
  data: Omit<
    ReservationData,
    'requestedDate' | 'startsAt' | 'endsAt' | 'occupiedEndsAt'
  > & {
    requestedDate?: string;
    startsAt?: string;
    endsAt?: string;
    occupiedEndsAt?: string;
  };
};

const toIso = (date: Date | null): string | null =>
  date === null ? null : date.toISOString();

const parseDate = (value: string, field: string): Date => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${field} stored in SQLite`);
  }
  return date;
};

const decodeConversation = (payload: string): Conversation => {
  const conversation = JSON.parse(payload) as SerializedConversation;
  const {
    requestedDate,
    startsAt,
    endsAt,
    occupiedEndsAt,
    ...remainingData
  } = conversation.data;

  return {
    ...conversation,
    createdAt: parseDate(conversation.createdAt, 'createdAt'),
    updatedAt: parseDate(conversation.updatedAt, 'updatedAt'),
    expiresAt:
      conversation.expiresAt === null
        ? null
        : parseDate(
            conversation.expiresAt,
            'expiresAt',
          ),
    messages: conversation.messages.map((message) => ({
      ...message,
      createdAt: parseDate(
        message.createdAt,
        'message.createdAt',
      ),
    })),
    data: {
      ...remainingData,
      ...(requestedDate && {
        requestedDate: parseDate(
          requestedDate,
          'data.requestedDate',
        ),
      }),
      ...(startsAt && {
        startsAt: parseDate(
          startsAt,
          'data.startsAt',
        ),
      }),
      ...(endsAt && {
        endsAt: parseDate(
          endsAt,
          'data.endsAt',
        ),
      }),
      ...(occupiedEndsAt && {
        occupiedEndsAt: parseDate(
          occupiedEndsAt,
          'data.occupiedEndsAt',
        ),
      }),
    },
  };
};

export class SqliteConversationStore implements ConversationStore {
  constructor(private readonly database: SqliteDatabase) {
    initializeSqliteSchema(database);
  }

  async get(id: Identifier): Promise<Conversation | null> {
    const row = this.database
      .prepare('SELECT payload FROM conversations WHERE id = ?')
      .get(id) as { payload: string } | undefined;

    return row ? decodeConversation(row.payload) : null;
  }

  async getByContact(
    businessId: Identifier,
    contactId: Identifier,
    now: Date = new Date(),
  ): Promise<Conversation | null> {
    const row = this.database
      .prepare(
        `SELECT payload
         FROM conversations
         WHERE business_id = ?
           AND contact_id = ?
           AND state NOT IN ('completed', 'cancelled', 'expired')
           AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(businessId, contactId, now.toISOString()) as
      | { payload: string }
      | undefined;

    return row ? decodeConversation(row.payload) : null;
  }

  async save(conversation: Conversation): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO conversations (
          id, business_id, contact_id, state, expires_at, updated_at, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        conversation.id,
        conversation.businessId,
        conversation.contactId,
        conversation.state,
        toIso(conversation.expiresAt),
        conversation.updatedAt.toISOString(),
        JSON.stringify(conversation),
      );
  }

  async update(conversation: Conversation): Promise<void> {
    const result = this.database
      .prepare(
        `UPDATE conversations
         SET business_id = ?, contact_id = ?, state = ?, expires_at = ?,
             updated_at = ?, payload = ?
         WHERE id = ?`,
      )
      .run(
        conversation.businessId,
        conversation.contactId,
        conversation.state,
        toIso(conversation.expiresAt),
        conversation.updatedAt.toISOString(),
        JSON.stringify(conversation),
        conversation.id,
      );

    if (result.changes === 0) {
      throw new Error(`Conversation "${conversation.id}" does not exist`);
    }
  }

  async delete(id: Identifier): Promise<void> {
    this.database.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  async deleteExpired(now: Date = new Date()): Promise<number> {
    const result = this.database
      .prepare(
        'DELETE FROM conversations WHERE expires_at IS NOT NULL AND expires_at <= ?',
      )
      .run(now.toISOString());

    return Number(result.changes);
  }
}
