import type {
  ConfiguracionNegocio,
  ValidationResult,
} from '../types.js';
import {
  checkBookingInstant,
  type BookingDateFailureReason,
} from './booking-date-policy.js';
import {
  getBusinessDateOnly,
  getLocalTimeMinutes,
  getWeekdayOfDateOnly,
} from '../time/business-time.js';
import {
  getAppointmentIntervalMinutes,
  getAppointmentOccupancy,
  getDayScheduleSegments,
  isStartAlignedWithSegment,
  isValidAppointmentInterval,
  isValidBusinessHoursSchedule,
  type AppointmentOccupancy,
} from './appointment-schedule.js';

export type BusinessHoursValidationReason =
  | BookingDateFailureReason
  | 'past-time'
  | 'insufficient-notice'
  | 'exceptional-closure'
  | 'closed-day'
  | 'outside-hours'
  | 'misaligned-start'
  | 'invalid-service-duration';

export interface BusinessHoursValidationInput {
  startsAt: Date;
  durationMinutes: number;
  now?: Date;
}

export type BusinessHoursSlot = AppointmentOccupancy;

export type BusinessHoursValidationResult = ValidationResult<
  BusinessHoursSlot,
  BusinessHoursValidationReason
>;

const isValidDate = (value: Date): boolean => !Number.isNaN(value.getTime());

const isValidPolicy = (
  policy: ConfiguracionNegocio['bookingPolicy'],
): boolean =>
  policy === undefined ||
  ((policy.minimumNoticeMinutes === undefined ||
    (Number.isInteger(policy.minimumNoticeMinutes) &&
      policy.minimumNoticeMinutes >= 0)) &&
    (policy.maxDaysAhead === undefined ||
      (Number.isInteger(policy.maxDaysAhead) && policy.maxDaysAhead >= 0)) &&
    (policy.appointmentIntervalMinutes === undefined ||
      isValidAppointmentInterval(policy.appointmentIntervalMinutes)));

const isValidClosureDate = (date: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
};

const isExceptionalClosure = (
  date: Date,
  closures: ConfiguracionNegocio['closures'],
  timeZone: string,
): boolean => {
  const calendarDate = getBusinessDateOnly(date, timeZone);
  const dateString = calendarDate.toISOString().slice(0, 10);
  return closures?.some((closure) => closure.date === dateString) ?? false;
};

/**
 * Valida el intervalo local de una reserva sin consultar disponibilidad externa.
 * Incluye el intervalo configurable de agenda y calcula la ocupación de bloques.
 */
export function validateBusinessHours(
  business: ConfiguracionNegocio,
  input: BusinessHoursValidationInput,
): BusinessHoursValidationResult {
  if (
    !isValidBusinessHoursSchedule(business.businessHours) ||
    !isValidPolicy(business.bookingPolicy)
  ) {
    return { valid: false, reason: 'invalid-configuration' };
  }

  if (
    business.closures?.some(({ date }) => !isValidClosureDate(date)) ||
    !isValidDate(input.startsAt)
  ) {
    return { valid: false, reason: 'invalid-configuration' };
  }

  if (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0) {
    return { valid: false, reason: 'invalid-service-duration' };
  }

  const intervalMinutes = getAppointmentIntervalMinutes(business);
  if (intervalMinutes === undefined) {
    return { valid: false, reason: 'invalid-configuration' };
  }

  const now = input.now ?? new Date();
  const dateResult = checkBookingInstant(input.startsAt, {
    now,
    timeZone: business.timezone,
    maxDaysAhead: business.bookingPolicy?.maxDaysAhead,
  });
  if (!dateResult.valid) {
    return { valid: false, reason: dateResult.reason };
  }

  if (input.startsAt.getTime() <= now.getTime()) {
    return { valid: false, reason: 'past-time' };
  }

  const minimumNotice = business.bookingPolicy?.minimumNoticeMinutes ?? 0;
  if (
    input.startsAt.getTime() < now.getTime() + minimumNotice * 60_000
  ) {
    return { valid: false, reason: 'insufficient-notice' };
  }

  if (isExceptionalClosure(input.startsAt, business.closures, business.timezone)) {
    return { valid: false, reason: 'exceptional-closure' };
  }

  const dateOnly = getBusinessDateOnly(input.startsAt, business.timezone);
  const weekday = getWeekdayOfDateOnly(dateOnly);
  const segments = getDayScheduleSegments(business.businessHours, weekday);
  if (!segments) {
    return { valid: false, reason: 'invalid-configuration' };
  }
  if (segments.length === 0) {
    return { valid: false, reason: 'closed-day' };
  }

  const startMinutes = getLocalTimeMinutes(input.startsAt, business.timezone);
  const endMinutes = startMinutes + input.durationMinutes;
  const containingSegment = segments.find(
    (segment) =>
      startMinutes >= segment.opensAt && endMinutes <= segment.closesAt,
  );

  if (!containingSegment) {
    return { valid: false, reason: 'outside-hours' };
  }

  if (
    !isStartAlignedWithSegment(
      startMinutes,
      containingSegment,
      intervalMinutes,
    )
  ) {
    return { valid: false, reason: 'misaligned-start' };
  }

  const occupancy = getAppointmentOccupancy(
    input.startsAt,
    input.durationMinutes,
    intervalMinutes,
  );
  if (!occupancy) {
    return { valid: false, reason: 'invalid-service-duration' };
  }

  return { valid: true, value: occupancy };
}
