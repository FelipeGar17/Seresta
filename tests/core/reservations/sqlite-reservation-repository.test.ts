import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openSqliteStorage, type SqliteStorage } from '../../../src/core/storage/sqlite-storage.js';
import type { Reservation } from '../../../src/core/types.js';

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

const reservation = (
  overrides: Partial<Reservation> = {},
): Reservation => ({
  id: 'reservation-1',
  businessId: 'business-1',
  contactId: '203843543527451@lid',
  whatsappId: '203843543527451@lid',
  customerPhone: '',
  customerName: 'Carlos',
  serviceId: 'cut-1',
  startsAt: new Date('2026-10-16T20:00:00.000Z'),
  endsAt: new Date('2026-10-16T20:30:00.000Z'),
  status: 'confirmed',
  createdAt: new Date('2026-10-15T15:00:00.000Z'),
  updatedAt: new Date('2026-10-15T15:00:00.000Z'),
  ...overrides,
});

describe('SqliteReservationRepository', () => {
  it('persiste la cita y fechas entre aperturas y mantiene la creación idempotente', async () => {
    const path = await createDatabasePath();
    const first = openStorage(path);
    await first.reservations.create(reservation());
    first.close();
    openedStorages.splice(openedStorages.indexOf(first), 1);

    const reopened = openStorage(path);
    const duplicate = await reopened.reservations.create(
      reservation({ customerName: 'Otro' }),
    );

    expect(duplicate).toEqual(reservation());
    await expect(
      reopened.reservations.getById('reservation-1'),
    ).resolves.toEqual(reservation());
  });

  it('busca citas confirmadas futuras por businessId y contactId', async () => {
    const storage = openStorage(await createDatabasePath());
    await storage.reservations.create(reservation());
    await storage.reservations.create(
      reservation({
        id: 'other-contact',
        contactId: 'another@lid',
      }),
    );
    await storage.reservations.create(
      reservation({ id: 'cancelled', status: 'cancelled' }),
    );
    await storage.reservations.create(
      reservation({
        id: 'past',
        startsAt: new Date('2026-10-01T20:00:00.000Z'),
      }),
    );

    await expect(
      storage.reservations.listConfirmedByContact(
        'business-1',
        '203843543527451@lid',
        new Date('2026-10-15T15:00:00.000Z'),
      ),
    ).resolves.toEqual([reservation()]);
  });

  it('reserva atómicamente el hueco y rechaza colisiones', async () => {
    const storage = openStorage(await createDatabasePath());
    const first = reservation({ status: 'pending' });
    const contender = reservation({
      id: 'reservation-2',
      contactId: 'another@lid',
      startsAt: new Date('2026-10-16T20:15:00.000Z'),
      endsAt: new Date('2026-10-16T20:45:00.000Z'),
      status: 'pending',
    });

    await expect(
      storage.reservations.createPendingIfAvailable(first),
    ).resolves.toBe(true);
    await expect(
      storage.reservations.createPendingIfAvailable(contender),
    ).resolves.toBe(false);
    await expect(
      storage.reservations.createPendingIfAvailable(
        reservation({
          id: 'adjacent-reservation',
          startsAt: first.endsAt,
          endsAt: new Date('2026-10-16T21:00:00.000Z'),
          status: 'pending',
        }),
      ),
    ).resolves.toBe(true);
  });

  it('permite solo una reserva entre dos solicitudes simultáneas', async () => {
    const storage = openStorage(await createDatabasePath());
    const contenders = ['one', 'two'].map((id) =>
      reservation({ id, status: 'pending' }),
    );

    const results = await Promise.all(
      contenders.map((item) =>
        storage.reservations.createPendingIfAvailable(item),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('conserva y depura cancelaciones según su cancelledAt', async () => {
    const storage = openStorage(await createDatabasePath());
    const oldCancellation = reservation({
      id: 'old-cancelled',
      status: 'cancelled',
      cancelledAt: new Date('2026-10-01T00:00:00.000Z'),
    });
    const recentCancellation = reservation({
      id: 'recent-cancelled',
      status: 'cancelled',
      cancelledAt: new Date('2026-10-14T00:00:00.000Z'),
    });
    await storage.reservations.create(oldCancellation);
    await storage.reservations.create(recentCancellation);
    await storage.reservations.create(reservation());

    await expect(
      storage.reservations.deleteCancelledBefore(
        new Date('2026-10-10T00:00:00.000Z'),
      ),
    ).resolves.toBe(1);
    await expect(
      storage.reservations.getById('old-cancelled'),
    ).resolves.toBeNull();
    await expect(
      storage.reservations.getById('recent-cancelled'),
    ).resolves.toEqual(recentCancellation);
    await expect(
      storage.reservations.getById('reservation-1'),
    ).resolves.toEqual(reservation());
  });

  it('update informa explícitamente si la reserva no existe', async () => {
    const storage = openStorage(await createDatabasePath());

    await expect(
      storage.reservations.update(reservation()),
    ).rejects.toThrow(/does not exist/);
  });
});
