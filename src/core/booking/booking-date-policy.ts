import type { ValidationResult } from '../types.js';
import {
  DEFAULT_TIME_ZONE,
  addDays,
  getBusinessDateOnly,
  getDateOnly,
} from '../time/business-time.js';

export const MAX_BOOKING_DAYS_AHEAD = 6;

export interface BookingDatePolicyOptions {
  now?: Date;
  timeZone?: string;
  // Ventana configurable por el negocio. Por defecto MAX_BOOKING_DAYS_AHEAD.
  maxDaysAhead?: number;
}

export type BookingDateFailureReason =
  | 'invalid-date'
  | 'invalid-configuration'
  | 'past-date'
  | 'out-of-window';

export type BookingDateValidationResult = ValidationResult<
  Date,
  BookingDateFailureReason
>;

const isValidDate = (date: Date): boolean => !Number.isNaN(date.getTime());

/**
 * Comprueba una fecha de reserva dentro de la ventana del negocio y explica el
 * motivo cuando la rechaza.
 *
 * `requestedDateOnly` es una fecha calendario (medianoche UTC del día local),
 * como las que devuelve el parser de fechas. Para un instante (por ejemplo el
 * inicio de una cita) usar `checkBookingInstant`.
 */
export function checkBookingDate(
  requestedDateOnly: Date,
  options: BookingDatePolicyOptions = {},
): BookingDateValidationResult {
  if (!isValidDate(requestedDateOnly)) {
    return { valid: false, reason: 'invalid-date' };
  }

  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const now = options.now ?? new Date();

  if (!isValidDate(now)) {
    return { valid: false, reason: 'invalid-date' };
  }

  const maxDaysAhead = options.maxDaysAhead ?? MAX_BOOKING_DAYS_AHEAD;
  if (!Number.isInteger(maxDaysAhead) || maxDaysAhead < 0) {
    return { valid: false, reason: 'invalid-configuration' };
  }

  const today = getBusinessDateOnly(now, timeZone);
  const requested = getDateOnly(requestedDateOnly);
  const latestAllowed = addDays(today, maxDaysAhead);

  if (requested < today) {
    return { valid: false, reason: 'past-date', value: requested };
  }

  if (requested > latestAllowed) {
    return { valid: false, reason: 'out-of-window', value: requested };
  }

  return { valid: true, value: requested };
}

/**
 * Igual que `checkBookingDate` pero para un instante: se convierte al día
 * local del negocio antes de comparar.
 */
export function checkBookingInstant(
  instant: Date,
  options: BookingDatePolicyOptions = {},
): BookingDateValidationResult {
  if (!isValidDate(instant)) {
    return { valid: false, reason: 'invalid-date' };
  }

  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;

  return checkBookingDate(getBusinessDateOnly(instant, timeZone), options);
}

/**
 * Comprueba si una fecha de reserva está entre hoy y los próximos seis días.
 *
 * `requestedDateOnly` se interpreta como fecha calendario, igual que las
 * fechas devueltas por el parser de fechas; `now` se convierte al día local
 * del negocio. Para un instante usar `isBookingInstantAllowed`.
 */
export function isBookingDateAllowed(
  requestedDateOnly: Date,
  options: BookingDatePolicyOptions = {},
): boolean {
  return checkBookingDate(requestedDateOnly, options).valid;
}

/**
 * Comprueba si un instante cae dentro de la ventana de reserva del negocio.
 */
export function isBookingInstantAllowed(
  instant: Date,
  options: BookingDatePolicyOptions = {},
): boolean {
  return checkBookingInstant(instant, options).valid;
}
