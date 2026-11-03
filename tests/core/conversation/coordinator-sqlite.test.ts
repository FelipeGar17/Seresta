import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseBusinessConfig } from '../../../src/config/load-config.js';
import { ConversationCoordinator } from '../../../src/core/conversation/coordinator.js';
import {
  openSqliteStorage,
  type SqliteStorage,
} from '../../../src/core/storage/sqlite-storage.js';

const now = new Date('2026-10-15T15:00:00.000Z');
const contactId = '203843543527451@lid';
const business = parseBusinessConfig({
  businessId: 'business-1',
  nombre: 'Barbería Central',
  zonaHoraria: 'America/Bogota',
  whatsappNumero: '+573000000000',
  calendarId: 'calendar-1',
  servicios: [
    {
      id: 'cut-1',
      nombre: 'Corte de cabello',
      aliases: ['corte'],
      precio: 25_000,
      duracionMinutos: 30,
      activo: true,
    },
  ],
  horariosAtencion: { friday: [{ abreA: '08:00', cierraA: '18:00' }] },
});

const openedStorages: SqliteStorage[] = [];
let temporaryDirectory: string | undefined;

afterEach(async () => {
  for (const storage of openedStorages.splice(0)) {
    storage.close();
  }
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  }
});

const createDatabasePath = async (): Promise<string> => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'appointments-sqlite-'));
  return join(temporaryDirectory, 'appointments.sqlite');
};

const openStorage = (path: string): SqliteStorage => {
  const storage = openSqliteStorage(path);
  openedStorages.push(storage);
  return storage;
};

const createCoordinator = (storage: SqliteStorage, id: string) =>
  new ConversationCoordinator(storage.conversations, {
    now: () => now,
    idFactory: () => id,
    reservations: storage.reservations,
  });

const send = (
  coordinator: ConversationCoordinator,
  message: string,
  messageId?: string,
) =>
  coordinator.handleMessage({
    business,
    contactId,
    whatsappId: contactId,
    customerPhone: '',
    ...(messageId ? { messageId, receivedAt: now } : {}),
    message,
  });

describe('flujo conversacional con SQLite', () => {
  it('reutiliza una respuesta deduplicada después de reabrir SQLite', async () => {
    const path = await createDatabasePath();
    const firstStorage = openStorage(path);
    const firstCoordinator = createCoordinator(firstStorage, 'first-session');
    const first = await send(firstCoordinator, 'Hola', 'whatsapp-message-1');
    firstStorage.close();
    openedStorages.splice(openedStorages.indexOf(firstStorage), 1);

    const reopenedStorage = openStorage(path);
    const reopenedCoordinator = createCoordinator(
      reopenedStorage,
      'different-session',
    );
    const retry = await send(
      reopenedCoordinator,
      'Hola',
      'whatsapp-message-1',
    );

    expect(retry.reply).toBe(first.reply);
    expect(retry.conversation.id).toBe('first-session');
    expect(retry.conversation.messages).toHaveLength(2);
    expect(retry.conversation.messages[0].externalMessageId).toBe(
      'whatsapp-message-1',
    );
  });

  it('reanuda una consulta de disponibilidad después de reabrir SQLite', async () => {
    const path = await createDatabasePath();
    const firstStorage = openStorage(path);
    const firstCoordinator = createCoordinator(firstStorage, 'availability-1');
    const initial = await send(
      firstCoordinator,
      '¿Tienen disponibilidad para mañana?',
    );
    expect(initial.conversation.state).toBe('checking-availability');
    expect(initial.conversation.data.requestedDate?.toISOString()).toBe(
      '2026-10-16T00:00:00.000Z',
    );
    firstStorage.close();
    openedStorages.splice(openedStorages.indexOf(firstStorage), 1);

    const reopenedStorage = openStorage(path);
    const reopenedCoordinator = createCoordinator(
      reopenedStorage,
      'availability-2',
    );
    const resumed = await send(reopenedCoordinator, 'Corte de cabello');

    expect(resumed.conversation.id).toBe('availability-1');
    expect(resumed.conversation.state).toBe('checking-availability');
    expect(resumed.conversation.data.serviceId).toBe('cut-1');
    expect(resumed.conversation.data.requestedDate?.toISOString()).toBe(
      '2026-10-16T00:00:00.000Z',
    );
    expect(resumed.reply).toMatch(/disponibilidad/i);
  });

  it('mantiene la cita y la cancelación pendiente después de reiniciar el motor', async () => {
    const path = await createDatabasePath();
    const firstStorage = openStorage(path);
    const firstCoordinator = createCoordinator(firstStorage, 'booking-1');

    await send(
      firstCoordinator,
      'Quiero un corte de cabello mañana a las 3 pm, me llamo Carlos',
    );
    const finalConfirmation = await send(firstCoordinator, 'sí, confirmar');
    expect(finalConfirmation.conversation.state).toBe(
      'awaiting-final-confirmation',
    );
    const confirmed = await send(firstCoordinator, 'sí, confirmar');
    expect(confirmed.conversation.state).toBe('awaiting-acknowledgment');
    await send(firstCoordinator, 'gracias');
    firstStorage.close();
    openedStorages.splice(openedStorages.indexOf(firstStorage), 1);

    const secondStorage = openStorage(path);
    const secondCoordinator = createCoordinator(secondStorage, 'cancellation-1');
    const cancellationPrompt = await send(
      secondCoordinator,
      'quiero cancelar mi cita',
    );
    expect(cancellationPrompt.conversation.state).toBe('awaiting-cancellation');
    expect(cancellationPrompt.reply).toContain('Corte de cabello');
    secondStorage.close();
    openedStorages.splice(openedStorages.indexOf(secondStorage), 1);

    const thirdStorage = openStorage(path);
    const thirdCoordinator = createCoordinator(thirdStorage, 'cancellation-2');
    const cancelled = await send(thirdCoordinator, 'sí, cancelar');

    expect(cancelled.reply).toMatch(/fue cancelada/i);
    expect(cancelled.conversation.state).toBe('cancelled');
    await expect(
      thirdStorage.reservations.getById('reservation:booking-1'),
    ).resolves.toMatchObject({
      status: 'cancelled',
      cancelledAt: now,
      contactId,
    });
  });
});
