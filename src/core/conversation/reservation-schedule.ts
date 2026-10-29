import type {
  ConfiguracionNegocio,
  ReservationData,
  Service,
} from '../types.js';
import {
  validateAppointmentAvailability,
  type AppointmentAvailabilityReason,
} from '../booking/appointment-availability.js';
import type { BusinessHoursSlot } from '../booking/business-hours-validator.js';
import {
  validateService,
  type ServiceValidationReason,
} from '../booking/service-validator.js';
import {
  combineDateAndTime,
  parseTimeToMinutes,
} from '../time/business-time.js';

export type ReservationScheduleField =
  | 'serviceId'
  | 'requestedDate'
  | 'requestedTime';

export type ReservationScheduleReason =
  | AppointmentAvailabilityReason
  | ServiceValidationReason
  | 'invalid-time';

export type ReservationScheduleResult =
  | { status: 'incomplete' }
  | {
      status: 'invalid';
      field: ReservationScheduleField;
      reason: ReservationScheduleReason;
      service?: Service;
      requestedStartsAt?: Date;
    }
  | {
      status: 'valid';
      service: Service;
      slot: BusinessHoursSlot;
    };

const DATE_REASONS: ReadonlySet<ReservationScheduleReason> = new Set([
  'invalid-date',
  'past-date',
  'out-of-window',
  'closed-day',
  'exceptional-closure',
]);

const SERVICE_REASONS: ReadonlySet<ReservationScheduleReason> = new Set([
  'not-found',
  'inactive',
  'invalid-service-duration',
]);

const getFieldForReason = (
  reason: ReservationScheduleReason,
): ReservationScheduleField => {
  if (DATE_REASONS.has(reason)) return 'requestedDate';
  if (SERVICE_REASONS.has(reason)) return 'serviceId';
  return 'requestedTime';
};

export function validateReservationSchedule(
  business: ConfiguracionNegocio,
  data: ReservationData,
  now: Date,
): ReservationScheduleResult {
  if (!data.serviceId) return { status: 'incomplete' };

  const serviceResult = validateService(business, data.serviceId);
  if (!serviceResult.valid) {
    return {
      status: 'invalid',
      field: 'serviceId',
      reason: serviceResult.reason,
    };
  }

  if (!data.requestedDate) return { status: 'incomplete' };
  if (Number.isNaN(data.requestedDate.getTime())) {
    return {
      status: 'invalid',
      field: 'requestedDate',
      reason: 'invalid-date',
      service: serviceResult.value,
    };
  }

  if (!data.requestedTime) return { status: 'incomplete' };
  if (parseTimeToMinutes(data.requestedTime) === undefined) {
    return {
      status: 'invalid',
      field: 'requestedTime',
      reason: 'invalid-time',
      service: serviceResult.value,
    };
  }

  const startsAt = combineDateAndTime(
    data.requestedDate,
    data.requestedTime,
    business.timezone,
  );
  if (!startsAt) {
    return {
      status: 'invalid',
      field: 'requestedTime',
      reason: 'invalid-time',
      service: serviceResult.value,
    };
  }

  const availability = validateAppointmentAvailability(business, {
    startsAt,
    durationMinutes: serviceResult.value.durationMinutes,
    now,
  });
  if (!availability.valid) {
    return {
      status: 'invalid',
      field: getFieldForReason(availability.reason),
      reason: availability.reason,
      service: serviceResult.value,
      requestedStartsAt: startsAt,
    };
  }

  return {
    status: 'valid',
    service: serviceResult.value,
    slot: availability.value,
  };
}
