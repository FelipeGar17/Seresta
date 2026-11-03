import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { SqliteConversationStore } from '../conversation/sqlite-store.js';
import { SqliteReservationRepository } from '../reservations/sqlite-reservation-repository.js';
import { SqliteIncomingMessageStore } from '../messaging/sqlite-incoming-message-store.js';
import type { IncomingMessageStore } from '../messaging/incoming-message-store.js';
import type { SqliteDatabase } from './sqlite-schema.js';

export const DEFAULT_SQLITE_PATH = 'data/appointments.sqlite';

export interface SqliteStorage {
  database: SqliteDatabase;
  conversations: SqliteConversationStore;
  reservations: SqliteReservationRepository;
  incomingMessages: IncomingMessageStore;
  close(): void;
}

export function openSqliteStorage(
  databasePath: string = DEFAULT_SQLITE_PATH,
): SqliteStorage {
  if (!databasePath.trim()) {
    throw new Error('SQLite database path cannot be empty');
  }

  if (databasePath !== ':memory:') {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }

  const database = new Database(databasePath);
  try {
    database.pragma('journal_mode = WAL');
    database.pragma('busy_timeout = 5000');

    return {
      database,
      conversations: new SqliteConversationStore(database),
      reservations: new SqliteReservationRepository(database),
      incomingMessages: new SqliteIncomingMessageStore(database),
      close: () => database.close(),
    };
  } catch (error) {
    database.close();
    throw error;
  }
}
