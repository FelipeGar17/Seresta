import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openSqliteStorage, type SqliteStorage } from '../../../src/core/storage/sqlite-storage.js';
import type { Conversation } from '../../../src/core/types.js';

const openedStorages: SqliteStorage[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const storage of openedStorages.splice(0)) {
    storage.close();
  }
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

const createDatabasePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'appointments-sqlite-'));
  temporaryDirectories.push(directory);
  return join(directory, 'appointments.sqlite');
};

const openStorage = (path: string): SqliteStorage => {
  const storage = openSqliteStorage(path);
  openedStorages.push(storage);
  return storage;
};

const conversation = (
  overrides: Partial<Conversation> = {},
): Conversation => ({
  id: 'conversation-1',
  businessId: 'business-1',
  contactId: '203843543527451@lid',
  whatsappId: '203843543527451@lid',
  customerPhone: '',
  intent: 'book-appointment',
  state: 'collecting-time',
  messages: [
    {
      id: 'message-1',
      direction: 'incoming',
      text: 'quiero un corte mañana',
      createdAt: new Date('2026-10-15T15:00:00.000Z'),
    },
  ],
  data: {
    customerName: 'Carlos',
    serviceId: 'cut-1',
    requestedDate: new Date('2026-10-16T00:00:00.000Z'),
    requestedTime: '15:00',
    startsAt: new Date('2026-10-16T20:00:00.000Z'),
    endsAt: new Date('2026-10-16T20:30:00.000Z'),
    occupiedEndsAt: new Date('2026-10-16T20:30:00.000Z'),
  },
  expiresAt: new Date('2026-10-15T15:10:00.000Z'),
  createdAt: new Date('2026-10-15T15:00:00.000Z'),
  updatedAt: new Date('2026-10-15T15:00:00.000Z'),
  ...overrides,
});

describe('SqliteConversationStore', () => {
  it('conserva conversación, fechas y @lid después de cerrar y reabrir la base', async () => {
    const path = await createDatabasePath();
    const first = openStorage(path);
    await first.conversations.save(conversation());
    first.close();
    openedStorages.splice(openedStorages.indexOf(first), 1);

    const reopened = openStorage(path);
    const restored = await reopened.conversations.get('conversation-1');

    expect(restored).toEqual(conversation());
    await expect(
      reopened.conversations.getByContact(
        'business-1',
        '203843543527451@lid',
        new Date('2026-10-15T15:09:59.999Z'),
      ),
    ).resolves.toEqual(conversation());
  });

  it('no devuelve una conversación vencida en el límite exacto de expiración', async () => {
    const storage = openStorage(await createDatabasePath());
    await storage.conversations.save(conversation());

    await expect(
      storage.conversations.getByContact(
        'business-1',
        '203843543527451@lid',
        new Date('2026-10-15T15:10:00.000Z'),
      ),
    ).resolves.toBeNull();
  });

  it('deleteExpired elimina conversaciones vencidas y devuelve la cantidad', async () => {
    const storage = openStorage(await createDatabasePath());
    await storage.conversations.save(conversation());

    await expect(
      storage.conversations.deleteExpired(
        new Date('2026-10-15T15:10:00.000Z'),
      ),
    ).resolves.toBe(1);
    await expect(
      storage.conversations.get('conversation-1'),
    ).resolves.toBeNull();
  });

  it('update informa explícitamente si la conversación no existe', async () => {
    const storage = openStorage(await createDatabasePath());

    await expect(
      storage.conversations.update(conversation()),
    ).rejects.toThrow(/does not exist/);
  });
});
