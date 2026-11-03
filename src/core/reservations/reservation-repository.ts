import type { Identifier, Reservation } from '../types.js';

// Contrato de almacenamiento de reservas definitivas. No conoce WhatsApp ni
// Google Calendar; el almacenamiento en memoria es reemplazable por SQLite.
export interface ReservationRepository {
  // Idempotente: si ya existe una reserva con el mismo `id`, devuelve la
  // existente sin modificarla.
  create(reservation: Reservation): Promise<Reservation>;
  // Reserva un intervalo provisional de forma atómica; devuelve false ante
  // solapamientos con otra reserva pendiente o confirmada.
  createPendingIfAvailable(reservation: Reservation): Promise<boolean>;
  getById(id: Identifier): Promise<Reservation | null>;
  listBlockingAppointments(
    businessId: Identifier,
    from: Date,
    to: Date,
  ): Promise<Reservation[]>;
  // Reservas `confirmed` del contacto que empiezan después de `from`,
  // ordenadas por inicio.
  listConfirmedByContact(
    businessId: Identifier,
    contactId: Identifier,
    from: Date,
  ): Promise<Reservation[]>;
  update(reservation: Reservation): Promise<void>;
  // Elimina las reservas canceladas antes de `cutoff` y devuelve cuántas.
  deleteCancelledBefore(cutoff: Date): Promise<number>;
}
