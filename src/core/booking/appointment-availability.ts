import type {
  ConfiguracionNegocio,
  ValidationResult,
} from '../types.js';
import { getBusinessDateOnly } from '../time/business-time.js';
import {
  validateBusinessHours,
  type BusinessHoursSlot,
  type BusinessHoursValidationReason,
} from './business-hours-validator.js';
import {
  doTimeIntervalsOverlap,
  getAppointmentIntervalMinutes,
  getAppointmentOccupancy,
  getScheduleStartTimes,
  type ExistingAppointment,
} from './appointment-schedule.js';

export type AppointmentAvailabilityReason =
  | BusinessHoursValidationReason
  | 'overlaps-existing-appointment'
  | 'invalid-existing-appointment';

export interface AppointmentAvailabilityInput {
  startsAt: Date;
  durationMinutes: number;
  now?: Date;
  // Datos que debe aportar la fuente de disponibilidad (store, Calendar, ...).
  // Si se omite, no se comprueban solapamientos ni se prometen alternativas.
  existingAppointments?: readonly ExistingAppointment[];
  maxAlternatives?: number;
}

export type AppointmentAvailabilityResult =
  ValidationResult<BusinessHoursSlot, AppointmentAvailabilityReason> & {
    alternatives?: Date[];
  };

const DEFAULT_MAX_ALTERNATIVES = 3;

const getOccupiedInterval = (
  appointment: ExistingAppointment,
  intervalMinutes: number,
) => {
  if (
    appointment.endsAt &&
    appointment.endsAt.getTime() > appointment.startsAt.getTime()
  ) {
    return {
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    };
  }

  const occupancy = getAppointmentOccupancy(
    appointment.startsAt,
    appointment.durationMinutes,
    intervalMinutes,
  );
  if (!occupancy) return undefined;

  return {
    startsAt: occupancy.startsAt,
    endsAt: occupancy.occupiedEndsAt,
  };
};

const overlapsAny = (
  candidate: BusinessHoursSlot,
  existing: readonly ExistingAppointment[],
  intervalMinutes: number,
): boolean | undefined => {
  const candidateInterval = {
    startsAt: candidate.startsAt,
    endsAt: candidate.occupiedEndsAt,
  };

  for (const appointment of existing) {
    const occupied = getOccupiedInterval(appointment, intervalMinutes);
    if (!occupied) return undefined;
    if (doTimeIntervalsOverlap(candidateInterval, occupied)) return true;
  }

  return false;
};

const getAlternatives = (
  business: ConfiguracionNegocio,
  input: AppointmentAvailabilityInput,
  intervalMinutes: number,
): Date[] => {
  if (input.existingAppointments === undefined) return [];
  if (Number.isNaN(input.startsAt.getTime())) return [];

  const requestedTime = input.startsAt.getTime();
  const dateOnly = getBusinessDateOnly(input.startsAt, business.timezone);
  const starts = getScheduleStartTimes(
    business,
    dateOnly,
    input.durationMinutes,
    intervalMinutes,
  );
  const maxAlternatives =
    typeof input.maxAlternatives === 'number' &&
    Number.isInteger(input.maxAlternatives) &&
    input.maxAlternatives >= 0
      ? input.maxAlternatives
      : DEFAULT_MAX_ALTERNATIVES;
  const alternatives: Date[] = [];
  if (maxAlternatives === 0) return alternatives;

  for (const startsAt of starts) {
    if (startsAt.getTime() === requestedTime) continue;

    const slot = validateBusinessHours(business, {
      startsAt,
      durationMinutes: input.durationMinutes,
      now: input.now,
    });
    if (!slot.valid) continue;

    const overlaps = overlapsAny(
      slot.value,
      input.existingAppointments,
      intervalMinutes,
    );
    if (overlaps !== false) continue;

    alternatives.push(startsAt);
  }

  return alternatives
    .sort((left, right) => {
      const distance =
        Math.abs(left.getTime() - requestedTime) -
        Math.abs(right.getTime() - requestedTime);
      if (distance !== 0) return distance;

      const leftIsEarlier = left.getTime() < requestedTime;
      const rightIsEarlier = right.getTime() < requestedTime;
      if (leftIsEarlier !== rightIsEarlier) {
        return leftIsEarlier ? -1 : 1;
      }
      return left.getTime() - right.getTime();
    })
    .slice(0, maxAlternatives);
};

export interface AvailableAppointmentStartTimesInput {
  dateOnly: Date;
  durationMinutes: number;
  now?: Date;
  existingAppointments: readonly ExistingAppointment[];
}

export function getAvailableAppointmentStartTimes(
  business: ConfiguracionNegocio,
  input: AvailableAppointmentStartTimesInput,
): Date[] {
  if (Number.isNaN(input.dateOnly.getTime())) {
    throw new Error('La fecha para consultar disponibilidad no es válida.');
  }
  if (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0) {
    throw new Error('La duración del servicio no es válida.');
  }

  const intervalMinutes = getAppointmentIntervalMinutes(business);
  if (intervalMinutes === undefined) {
    throw new Error('El intervalo de agenda del negocio no es válido.');
  }

  return getScheduleStartTimes(
    business,
    input.dateOnly,
    input.durationMinutes,
    intervalMinutes,
  ).filter((startsAt) => {
    const result = validateAppointmentAvailability(business, {
      startsAt,
      durationMinutes: input.durationMinutes,
      now: input.now,
      existingAppointments: input.existingAppointments,
    });
    if (
      !result.valid &&
      (result.reason === 'invalid-configuration' ||
        result.reason === 'invalid-existing-appointment')
    ) {
      throw new Error(
        'No se pudo validar la configuración o las citas existentes de la agenda.',
      );
    }
    return result.valid;
  });
}

/**
 * Valida el inicio de una cita contra horario, intervalo, bloques y las citas
 * existentes que aporte el llamador. No consulta Google Calendar ni inventa
 * disponibilidad: si no se reciben citas existentes, solo se valida la agenda
 * local y no se generan alternativas.
 */
export function validateAppointmentAvailability(
  business: ConfiguracionNegocio,
  input: AppointmentAvailabilityInput,
): AppointmentAvailabilityResult {
  const hours = validateBusinessHours(business, input);
  const intervalMinutes = getAppointmentIntervalMinutes(business);

  if (!hours.valid) {
    if (
      intervalMinutes === undefined ||
      hours.reason === 'invalid-configuration' ||
      hours.reason === 'invalid-service-duration' ||
      hours.reason === 'invalid-date'
    ) {
      return hours;
    }

    const alternatives = getAlternatives(business, input, intervalMinutes);
    return alternatives.length > 0 ? { ...hours, alternatives } : hours;
  }

  if (!intervalMinutes) {
    return { valid: false, reason: 'invalid-configuration' };
  }

  if (input.existingAppointments !== undefined) {
    const overlaps = overlapsAny(
      hours.value,
      input.existingAppointments,
      intervalMinutes,
    );

    if (overlaps === undefined) {
      return { valid: false, reason: 'invalid-existing-appointment' };
    }
    if (overlaps) {
      const alternatives = getAlternatives(
        business,
        input,
        intervalMinutes,
      );
      return alternatives.length > 0
        ? {
            valid: false,
            reason: 'overlaps-existing-appointment',
            alternatives,
          }
        : { valid: false, reason: 'overlaps-existing-appointment' };
    }
  }

  return hours;
}
