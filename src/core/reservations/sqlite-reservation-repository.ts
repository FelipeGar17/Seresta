import type { Identifier, Reservation } from '../types.js';
import {
  initializeSqliteSchema,
  type SqliteDatabase,
} from '../storage/sqlite-schema.js';
import type { ReservationRepository } from './reservation-repository.js';

type SerializedReservation = Omit<
  Reservation,
  'startsAt' | 'endsAt' | 'createdAt' | 'updatedAt' | 'cancelledAt'
> & {
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
};

const parseDate = (value: string, field: string): Date => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${field} stored in SQLite`);
  }
  return date;
};

const decodeReservation = (payload: string): Reservation => {
  const reservation = JSON.parse(payload) as SerializedReservation;
  const {
    startsAt,
    endsAt,
    createdAt,
    updatedAt,
    cancelledAt,
    ...remainingReservation
  } = reservation;

  return {
    ...remainingReservation,
    startsAt: parseDate(startsAt, 'startsAt'),
    endsAt: parseDate(endsAt, 'endsAt'),
    createdAt: parseDate(createdAt, 'createdAt'),
    updatedAt: parseDate(updatedAt, 'updatedAt'),
    ...(cancelledAt && {
      cancelledAt: parseDate(cancelledAt, 'cancelledAt'),
    }),
  };
};

export class SqliteReservationRepository implements ReservationRepository {
  constructor(private readonly database: SqliteDatabase) {
    initializeSqliteSchema(database);
  }

  async create(reservation: Reservation): Promise<Reservation> {
    this.database
      .prepare(
        `INSERT INTO reservations (
          id, business_id, contact_id, status, starts_at, cancelled_at, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`,
      )
      .run(
        reservation.id,
        reservation.businessId,
        reservation.contactId,
        reservation.status,
        reservation.startsAt.toISOString(),
        reservation.cancelledAt?.toISOString() ?? null,
        JSON.stringify(reservation),
      );

    const existing = await this.getById(reservation.id);
    if (!existing) {
      throw new Error(`Reservation "${reservation.id}" could not be stored`);
    }
    return existing;
  }

  async getById(id: Identifier): Promise<Reservation | null> {
    const row = this.database
      .prepare('SELECT payload FROM reservations WHERE id = ?')
      .get(id) as { payload: string } | undefined;

    return row ? decodeReservation(row.payload) : null;
  }

  async listConfirmedByContact(
    businessId: Identifier,
    contactId: Identifier,
    from: Date,
  ): Promise<Reservation[]> {
    const rows = this.database
      .prepare(
        `SELECT payload
         FROM reservations
         WHERE business_id = ?
           AND contact_id = ?
           AND status = 'confirmed'
           AND starts_at > ?
         ORDER BY starts_at`,
      )
      .all(businessId, contactId, from.toISOString()) as {
      payload: string;
    }[];

    return rows.map(({ payload }) => decodeReservation(payload));
  }

  async update(reservation: Reservation): Promise<void> {
    const result = this.database
      .prepare(
        `UPDATE reservations
         SET business_id = ?, contact_id = ?, status = ?, starts_at = ?,
             cancelled_at = ?, payload = ?
         WHERE id = ?`,
      )
      .run(
        reservation.businessId,
        reservation.contactId,
        reservation.status,
        reservation.startsAt.toISOString(),
        reservation.cancelledAt?.toISOString() ?? null,
        JSON.stringify(reservation),
        reservation.id,
      );

    if (result.changes === 0) {
      throw new Error(`Reservation "${reservation.id}" does not exist`);
    }
  }

  async deleteCancelledBefore(cutoff: Date): Promise<number> {
    const result = this.database
      .prepare(
        `DELETE FROM reservations
         WHERE status = 'cancelled' AND cancelled_at < ?`,
      )
      .run(cutoff.toISOString());

    return Number(result.changes);
  }
}
