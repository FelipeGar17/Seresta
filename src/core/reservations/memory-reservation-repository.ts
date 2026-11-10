import type { Identifier, Reservation } from '../types.js';
import {
  isSamePendingReservation,
  type ReservationRepository,
} from './reservation-repository.js';

const copy = (reservation: Reservation): Reservation => ({ ...reservation });

export class MemoryReservationRepository implements ReservationRepository {
  private readonly reservations = new Map<Identifier, Reservation>();

  async create(reservation: Reservation): Promise<Reservation> {
    const existing = this.reservations.get(reservation.id);
    if (existing) return copy(existing);

    this.reservations.set(reservation.id, copy(reservation));
    return copy(reservation);
  }

  async createPendingIfAvailable(reservation: Reservation): Promise<boolean> {
    if (reservation.status !== 'pending') {
      throw new Error('Only pending reservations can claim an available slot');
    }

    const existing = this.reservations.get(reservation.id);
    if (existing) return isSamePendingReservation(existing, reservation);

    const overlaps = [...this.reservations.values()].some(
      (candidate) =>
        candidate.businessId === reservation.businessId &&
        (candidate.status === 'pending' || candidate.status === 'confirmed') &&
        candidate.startsAt < reservation.endsAt &&
        candidate.endsAt > reservation.startsAt,
    );
    if (overlaps) return false;

    this.reservations.set(reservation.id, copy(reservation));
    return true;
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

  async listBlockingAppointments(
    businessId: Identifier,
    from: Date,
    to: Date,
  ): Promise<Reservation[]> {
    return [...this.reservations.values()]
      .filter(
        (reservation) =>
          reservation.businessId === businessId &&
          (reservation.status === 'pending' ||
            reservation.status === 'confirmed') &&
          reservation.startsAt < to &&
          reservation.endsAt > from,
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

  async deleteStalePendingBefore(cutoff: Date): Promise<number> {
    let deleted = 0;

    for (const [id, reservation] of this.reservations) {
      if (
        reservation.status === 'pending' &&
        reservation.createdAt < cutoff
      ) {
        this.reservations.delete(id);
        deleted += 1;
      }
    }

    return deleted;
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
