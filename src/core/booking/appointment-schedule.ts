import type {
  ConfiguracionNegocio,
  Weekday,
  WeeklyBusinessHours,
} from '../types.js';
import {
  combineDateAndTime,
  getBusinessDateOnly,
  getLocalTimeMinutes,
  getWeekdayOfDateOnly,
  parseTimeToMinutes,
  WEEKDAY_ORDER,
} from '../time/business-time.js';

export const DEFAULT_APPOINTMENT_INTERVAL_MINUTES = 30;
export const MAX_APPOINTMENT_INTERVAL_MINUTES = 24 * 60;

export interface BusinessHoursSegment {
  opensAt: number;
  closesAt: number;
}

export interface AppointmentOccupancy {
  startsAt: Date;
  endsAt: Date;
  occupiedEndsAt: Date;
  blockCount: number;
  intervalMinutes: number;
}

export interface ExistingAppointment {
  startsAt: Date;
  durationMinutes: number;
}

export interface TimeInterval {
  startsAt: Date;
  endsAt: Date;
}

export const isValidAppointmentInterval = (
  value: unknown,
): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value > 0 &&
  value <= MAX_APPOINTMENT_INTERVAL_MINUTES;

/**
 * Intervalo efectivo del negocio. Si la política no lo declara se usa 30
 * minutos, valor compatible con las agendas existentes.
 */
export function getAppointmentIntervalMinutes(
  business: ConfiguracionNegocio,
): number | undefined {
  const value =
    business.bookingPolicy?.appointmentIntervalMinutes ??
    DEFAULT_APPOINTMENT_INTERVAL_MINUTES;
  return isValidAppointmentInterval(value) ? value : undefined;
}

/**
 * Convierte las franjas configuradas de un día en segmentos continuos.
 * Dos franjas adyacentes se unen porque no hay descanso entre ellas.
 * Devuelve `undefined` si el horario es inválido.
 */
export function getDayScheduleSegments(
  businessHours: WeeklyBusinessHours | undefined,
  weekday: Weekday,
): BusinessHoursSegment[] | undefined {
  if (!businessHours) return undefined;

  const intervals = businessHours[weekday] ?? [];
  const segments: BusinessHoursSegment[] = [];
  let previousClose = -1;

  for (const interval of intervals) {
    const opensAt = parseTimeToMinutes(interval.opensAt);
    const closesAt = parseTimeToMinutes(interval.closesAt);

    if (
      opensAt === undefined ||
      closesAt === undefined ||
      opensAt >= closesAt ||
      opensAt < previousClose
    ) {
      return undefined;
    }

    const last = segments[segments.length - 1];
    if (last && last.closesAt === opensAt) {
      last.closesAt = closesAt;
    } else {
      segments.push({ opensAt, closesAt });
    }

    previousClose = closesAt;
  }

  return segments;
}

export function isValidBusinessHoursSchedule(
  businessHours: WeeklyBusinessHours | undefined,
): boolean {
  if (!businessHours) return false;

  return WEEKDAY_ORDER.every(
    (weekday) => getDayScheduleSegments(businessHours, weekday) !== undefined,
  );
}

/**
 * Un inicio está alineado si cae dentro del segmento y su distancia desde la
 * apertura de ese segmento es múltiplo del intervalo. No se usa medianoche
 * como origen: cada segmento se alinea con su propia hora de apertura.
 */
export function isStartAlignedWithSegment(
  startMinutes: number,
  segment: BusinessHoursSegment,
  intervalMinutes: number,
): boolean {
  if (!isValidAppointmentInterval(intervalMinutes)) return false;
  if (startMinutes < segment.opensAt || startMinutes >= segment.closesAt) {
    return false;
  }

  return (startMinutes - segment.opensAt) % intervalMinutes === 0;
}

export function getBlockCount(
  durationMinutes: number,
  intervalMinutes: number,
): number | undefined {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return undefined;
  }
  if (!isValidAppointmentInterval(intervalMinutes)) return undefined;

  return Math.ceil(durationMinutes / intervalMinutes);
}

/**
 * Calcula la ocupación derivada de una cita. `endsAt` es la finalización real
 * del servicio; `occupiedEndsAt` es el límite del último bloque de agenda que
 * se superpone con esa ejecución. No se persiste como dato de la reserva.
 */
export function getAppointmentOccupancy(
  startsAt: Date,
  durationMinutes: number,
  intervalMinutes: number,
): AppointmentOccupancy | undefined {
  if (Number.isNaN(startsAt.getTime())) return undefined;

  const blockCount = getBlockCount(durationMinutes, intervalMinutes);
  if (blockCount === undefined) return undefined;

  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
    occupiedEndsAt: new Date(
      startsAt.getTime() + blockCount * intervalMinutes * 60_000,
    ),
    blockCount,
    intervalMinutes,
  };
}

export function doTimeIntervalsOverlap(
  first: TimeInterval,
  second: TimeInterval,
): boolean {
  return (
    first.startsAt.getTime() < second.endsAt.getTime() &&
    second.startsAt.getTime() < first.endsAt.getTime()
  );
}

export function formatMinutesAsTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

/**
 * Genera inicios candidatos alineados para una fecha, sin consultar reservas.
 * Solo aplica reglas de horario y duración; cierres, anticipación y ocupación
 * real se validan en las capas superiores.
 */
export function getScheduleStartTimes(
  business: ConfiguracionNegocio,
  dateOnly: Date,
  durationMinutes: number,
  intervalMinutes: number = getAppointmentIntervalMinutes(business) ?? -1,
): Date[] {
  if (
    Number.isNaN(dateOnly.getTime()) ||
    !isValidAppointmentInterval(intervalMinutes) ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0 ||
    !business.businessHours
  ) {
    return [];
  }

  const weekday = getWeekdayOfDateOnly(dateOnly);
  const segments = getDayScheduleSegments(
    business.businessHours,
    weekday,
  );
  if (!segments) return [];

  const result: Date[] = [];

  for (const segment of segments) {
    for (
      let startMinutes = segment.opensAt;
      startMinutes + durationMinutes <= segment.closesAt;
      startMinutes += intervalMinutes
    ) {
      const startsAt = combineDateAndTime(
        dateOnly,
        formatMinutesAsTime(startMinutes),
        business.timezone,
      );
      if (!startsAt) continue;

      // En cambios de horario, una hora de pared puede no existir o haberse
      // desplazado. Solo se conserva si el instante representa ese minuto.
      if (
        getLocalTimeMinutes(startsAt, business.timezone) !== startMinutes ||
        getBusinessDateOnly(startsAt, business.timezone).getTime() !==
          dateOnly.getTime()
      ) {
        continue;
      }

      result.push(startsAt);
    }
  }

  return result;
}
