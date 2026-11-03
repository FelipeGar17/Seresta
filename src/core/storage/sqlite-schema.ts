import type Database from 'better-sqlite3';

export type SqliteDatabase = InstanceType<typeof Database>;

export function initializeSqliteSchema(database: SqliteDatabase): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      state TEXT NOT NULL,
      expires_at TEXT,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS conversations_by_contact
      ON conversations (business_id, contact_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      status TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      cancelled_at TEXT,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS reservations_by_contact
      ON reservations (business_id, contact_id, status, starts_at);

    CREATE INDEX IF NOT EXISTS cancelled_reservations_by_date
      ON reservations (status, cancelled_at);

    CREATE TABLE IF NOT EXISTS whatsapp_inbox (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL UNIQUE,
      business_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      whatsapp_id TEXT,
      customer_phone TEXT,
      body TEXT NOT NULL,
      received_at TEXT NOT NULL,
      status TEXT NOT NULL,
      reply TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS whatsapp_inbox_by_contact
      ON whatsapp_inbox (contact_id, sequence, status);
  `);
}
