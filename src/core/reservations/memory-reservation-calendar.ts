import type { ConfiguracionNegocio, Reservation } from '../types.js';
import type { ExistingAppointment } from '../booking/appointment-schedule.js';
import type { ReservationCalendar } from './reservation-calendar.js';

export class MemoryReservationCalendar implements ReservationCalendar {
  private readonly reservations = new Map<string, Reservation>();

  async listBusyAppointments(
    business: ConfiguracionNegocio,
    from: Date,
    to: Date,
    excludeReservationId?: string,
  ): Promise<ExistingAppointment[]> {
    return [...this.reservations.values()]
      .filter(
        (reservation) =>
          reservation.businessId === business.businessId &&
          reservation.id !== excludeReservationId &&
          reservation.startsAt < to &&
          reservation.endsAt > from,
      )
      .map((reservation) => ({
        startsAt: reservation.startsAt,
        endsAt: reservation.endsAt,
        durationMinutes:
          (reservation.endsAt.getTime() - reservation.startsAt.getTime()) /
          60_000,
      }));
  }

  async createReservationEvent(
    _business: ConfiguracionNegocio,
    reservation: Reservation,
  ): Promise<string> {
    this.reservations.set(reservation.id, reservation);
    return `memory:${reservation.id}`;
  }

  async deleteReservationEvent(
    _business: ConfiguracionNegocio,
    reservation: Reservation,
  ): Promise<void> {
    this.reservations.delete(reservation.id);
  }
}
