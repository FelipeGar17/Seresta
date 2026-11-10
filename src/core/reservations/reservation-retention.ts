import { MILLISECONDS_PER_DAY } from '../time/business-time.js';
import type { ReservationRepository } from './reservation-repository.js';

// Las citas canceladas se conservan este tiempo y luego se depuran.
export const DEFAULT_CANCELLED_RETENTION_DAYS = 15;

// Depuración de citas canceladas: pensada para invocarse desde un proceso
// periódico (no se ejecuta sola dentro del coordinador).
export async function purgeCancelledReservations(
  repository: ReservationRepository,
  now: Date,
  retentionDays: number = DEFAULT_CANCELLED_RETENTION_DAYS,
): Promise<number> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error('retentionDays debe ser un número mayor que cero');
  }

  const cutoff = new Date(now.getTime() - retentionDays * MILLISECONDS_PER_DAY);
  return repository.deleteCancelledBefore(cutoff);
}

// Una reserva provisional que no se confirmó en este tiempo se considera
// abandonada: deja de bloquear su horario. Es mayor que el TTL de la
// conversación (10 minutos) para no interferir con una confirmación en curso.
export const DEFAULT_STALE_PENDING_MINUTES = 60;

export async function purgeStalePendingReservations(
  repository: ReservationRepository,
  now: Date,
  maxAgeMinutes: number = DEFAULT_STALE_PENDING_MINUTES,
): Promise<number> {
  if (!Number.isFinite(maxAgeMinutes) || maxAgeMinutes <= 0) {
    throw new Error('maxAgeMinutes debe ser un número mayor que cero');
  }

  const cutoff = new Date(now.getTime() - maxAgeMinutes * 60 * 1000);
  return repository.deleteStalePendingBefore(cutoff);
}
