import { describe, expect, it } from 'vitest';
import { MemoryReservationRepository } from '../../../src/core/reservations/memory-reservation-repository.js';
import {
  DEFAULT_CANCELLED_RETENTION_DAYS,
  purgeCancelledReservations,
} from '../../../src/core/reservations/reservation-retention.js';
import type { Reservation } from '../../../src/core/types.js';

const now = new Date('2026-10-31T12:00:00.000Z');
const daysAgo = (days: number): Date =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const reservation = (id: string, overrides: Partial<Reservation> = {}): Reservation => ({
  id,
  businessId: 'business-1',
  contactId: 'contact-1',
  whatsappId: 'whatsapp-1',
  customerPhone: '+573001112233',
  customerName: 'Carlos',
  serviceId: 'cut-1',
  startsAt: new Date('2026-11-05T20:00:00.000Z'),
  endsAt: new Date('2026-11-05T20:30:00.000Z'),
  status: 'confirmed',
  createdAt: daysAgo(20),
  updatedAt: daysAgo(20),
  ...overrides,
});

describe('MemoryReservationRepository', () => {
  it('create es idempotente: no sobrescribe la reserva existente', async () => {
    const repository = new MemoryReservationRepository();
    await repository.create(reservation('r1'));

    const second = await repository.create(
      reservation('r1', { customerName: 'Otro' }),
    );

    expect(second.customerName).toBe('Carlos');
    await expect(repository.getById('r1')).resolves.toMatchObject({
      customerName: 'Carlos',
    });
  });

  it('devuelve copias: modificar el resultado no altera lo almacenado', async () => {
    const repository = new MemoryReservationRepository();
    const created = await repository.create(reservation('r1'));
    created.status = 'cancelled';

    await expect(repository.getById('r1')).resolves.toMatchObject({
      status: 'confirmed',
    });
  });

  it('lista solo confirmadas, futuras, del contacto y ordenadas por inicio', async () => {
    const repository = new MemoryReservationRepository();
    await repository.create(
      reservation('late', { startsAt: new Date('2026-11-06T20:00:00.000Z') }),
    );
    await repository.create(reservation('early'));
    await repository.create(reservation('cancelled', { status: 'cancelled' }));
    await repository.create(
      reservation('past', { startsAt: new Date('2026-10-01T20:00:00.000Z') }),
    );
    await repository.create(reservation('other', { contactId: 'contact-2' }));

    const list = await repository.listConfirmedByContact(
      'business-1',
      'contact-1',
      now,
    );

    expect(list.map((item) => item.id)).toEqual(['early', 'late']);
  });

  it('update falla si la reserva no existe', async () => {
    await expect(
      new MemoryReservationRepository().update(reservation('missing')),
    ).rejects.toThrow(/does not exist/);
  });
});

describe('purgeCancelledReservations', () => {
  const seed = async () => {
    const repository = new MemoryReservationRepository();
    await repository.create(
      reservation('old-cancelled', { status: 'cancelled', cancelledAt: daysAgo(16) }),
    );
    await repository.create(
      reservation('recent-cancelled', { status: 'cancelled', cancelledAt: daysAgo(3) }),
    );
    await repository.create(
      reservation('old-confirmed', { createdAt: daysAgo(60) }),
    );
    return repository;
  };

  it('el valor por defecto es de 15 días', () => {
    expect(DEFAULT_CANCELLED_RETENTION_DAYS).toBe(15);
  });

  it('elimina solo las canceladas más antiguas que el plazo', async () => {
    const repository = await seed();

    await expect(purgeCancelledReservations(repository, now)).resolves.toBe(1);

    await expect(repository.getById('old-cancelled')).resolves.toBeNull();
    await expect(repository.getById('recent-cancelled')).resolves.not.toBeNull();
    await expect(repository.getById('old-confirmed')).resolves.not.toBeNull();
  });

  it('acepta un plazo configurable (7 días)', async () => {
    const repository = await seed();
    await repository.update(
      reservation('recent-cancelled', { status: 'cancelled', cancelledAt: daysAgo(8) }),
    );

    await expect(purgeCancelledReservations(repository, now, 7)).resolves.toBe(2);
    await expect(repository.getById('old-confirmed')).resolves.not.toBeNull();
  });

  it('una segunda ejecución no elimina nada más', async () => {
    const repository = await seed();
    await purgeCancelledReservations(repository, now);

    await expect(purgeCancelledReservations(repository, now)).resolves.toBe(0);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza un plazo inválido (%s)',
    async (days) => {
      await expect(
        purgeCancelledReservations(new MemoryReservationRepository(), now, days),
      ).rejects.toThrow(/mayor que cero/);
    },
  );
});
