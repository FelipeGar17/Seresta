import type {
  BusinessHoursInterval,
  ConfiguracionNegocio,
  ValidationResult,
  Weekday,
} from '../types.js';
import {
  checkBookingInstant,
  type BookingDateFailureReason,
} from './booking-date-policy.js';
import {
  getBusinessDateOnly,
  getLocalTimeMinutes,
  getWeekdayOfDateOnly,
  parseTimeToMinutes,
} from '../time/business-time.js';

export type BusinessHoursValidationReason =
  | BookingDateFailureReason
  | 'insufficient-notice'
  | 'exceptional-closure'
  | 'closed-day'
  | 'outside-hours'
  | 'invalid-service-duration';

export interface BusinessHoursValidationInput {
  startsAt: Date;
  durationMinutes: number;
  now?: Date;
}

export type BusinessHoursValidationResult = ValidationResult<
  { startsAt: Date; endsAt: Date },
  BusinessHoursValidationReason
>;

const isValidDate = (value: Date): boolean => !Number.isNaN(value.getTime());

const isValidInterval = (interval: BusinessHoursInterval): boolean => {
  const opensAt = parseTimeToMinutes(interval.opensAt);
  const closesAt = parseTimeToMinutes(interval.closesAt);

  return (
    opensAt !== undefined &&
    closesAt !== undefined &&
    opensAt < closesAt
  );
};

const isValidSchedule = (
  businessHours: ConfiguracionNegocio['businessHours'],
): boolean => {
  if (!businessHours) return false;

  for (const intervals of Object.values(businessHours)) {
    if (!intervals) continue;

    let previousClose = -1;
    for (const interval of intervals) {
      if (!isValidInterval(interval)) return false;

      const opensAt = parseTimeToMinutes(interval.opensAt)!;
      const closesAt = parseTimeToMinutes(interval.closesAt)!;
      if (opensAt < previousClose) return false;
      previousClose = closesAt;
    }
  }

  return true;
};

const isValidPolicy = (
  policy: ConfiguracionNegocio['bookingPolicy'],
): boolean =>
  policy === undefined ||
  (policy.minimumNoticeMinutes === undefined ||
    (Number.isInteger(policy.minimumNoticeMinutes) &&
      policy.minimumNoticeMinutes >= 0)) &&
  (policy.maxDaysAhead === undefined ||
    (Number.isInteger(policy.maxDaysAhead) && policy.maxDaysAhead >= 0));

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

const getIntervalsForDay = (
  businessHours: NonNullable<ConfiguracionNegocio['businessHours']>,
  weekday: Weekday,
): BusinessHoursInterval[] => businessHours[weekday] ?? [];

/**
 * Valida el intervalo local de una reserva sin consultar disponibilidad externa.
 */
export function validateBusinessHours(
  business: ConfiguracionNegocio,
  input: BusinessHoursValidationInput,
): BusinessHoursValidationResult {
  if (!isValidSchedule(business.businessHours) || !isValidPolicy(business.bookingPolicy)) {
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

  const now = input.now ?? new Date();
  const dateResult = checkBookingInstant(input.startsAt, {
    now,
    timeZone: business.timezone,
    maxDaysAhead: business.bookingPolicy?.maxDaysAhead,
  });
  if (!dateResult.valid) {
    return { valid: false, reason: dateResult.reason };
  }

  const minimumNotice = business.bookingPolicy?.minimumNoticeMinutes ?? 0;
  if (
    !isValidDate(now) ||
    input.startsAt.getTime() < now.getTime() + minimumNotice * 60_000
  ) {
    return { valid: false, reason: 'insufficient-notice' };
  }

  if (isExceptionalClosure(input.startsAt, business.closures, business.timezone)) {
    return { valid: false, reason: 'exceptional-closure' };
  }

  const dateOnly = getBusinessDateOnly(input.startsAt, business.timezone);
  const weekday = getWeekdayOfDateOnly(dateOnly);
  const intervals = getIntervalsForDay(business.businessHours!, weekday);
  if (intervals.length === 0) {
    return { valid: false, reason: 'closed-day' };
  }

  const startMinutes = getLocalTimeMinutes(input.startsAt, business.timezone);
  const endMinutes = startMinutes + input.durationMinutes;
  const fitsInterval = intervals.some((interval) => {
    const opensAt = parseTimeToMinutes(interval.opensAt)!;
    const closesAt = parseTimeToMinutes(interval.closesAt)!;
    return startMinutes >= opensAt && endMinutes <= closesAt;
  });

  if (!fitsInterval) {
    return { valid: false, reason: 'outside-hours' };
  }

  const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
  return { valid: true, value: { startsAt: input.startsAt, endsAt } };
}
