import type { ConfiguracionNegocio, Reservation } from '../types.js';
import type { ExistingAppointment } from '../booking/appointment-schedule.js';

export interface ReservationCalendar {
  listBusyAppointments(
    business: ConfiguracionNegocio,
    from: Date,
    to: Date,
    excludeReservationId?: string,
  ): Promise<ExistingAppointment[]>;
  createReservationEvent(
    business: ConfiguracionNegocio,
    reservation: Reservation,
  ): Promise<string>;
  deleteReservationEvent(
    business: ConfiguracionNegocio,
    reservation: Reservation,
  ): Promise<void>;
}
