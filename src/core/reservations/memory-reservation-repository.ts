import type { Identifier, Reservation } from '../types.js';
import type { ReservationRepository } from './reservation-repository.js';

const copy = (reservation: Reservation): Reservation => ({ ...reservation });

export class MemoryReservationRepository implements ReservationRepository {
  private readonly reservations = new Map<Identifier, Reservation>();

  async create(reservation: Reservation): Promise<Reservation> {
    const existing = this.reservations.get(reservation.id);
    if (existing) return copy(existing);

    this.reservations.set(reservation.id, copy(reservation));
    return copy(reservation);
  }

  async getById(id: Identifier): Promise<Reservation | null> {
    const found = this.reservations.get(id);
    return found ? copy(found) : null;
  }

  async listConfirmedByContact(
    businessId: Identifier,
    contactId: Identifier,
    from: Date,
  ): Promise<Reservation[]> {
    return [...this.reservations.values()]
      .filter(
        (reservation) =>
          reservation.businessId === businessId &&
          reservation.contactId === contactId &&
          reservation.status === 'confirmed' &&
          reservation.startsAt > from,
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map(copy);
  }

  async update(reservation: Reservation): Promise<void> {
    if (!this.reservations.has(reservation.id)) {
      throw new Error(`Reservation "${reservation.id}" does not exist`);
    }

    this.reservations.set(reservation.id, copy(reservation));
  }

  async deleteCancelledBefore(cutoff: Date): Promise<number> {
    let deleted = 0;

    for (const [id, reservation] of this.reservations) {
      if (
        reservation.status === 'cancelled' &&
        reservation.cancelledAt !== undefined &&
        reservation.cancelledAt < cutoff
      ) {
        this.reservations.delete(id);
        deleted += 1;
      }
    }

    return deleted;
  }
}
