import type { Weekday } from '../types.js';

export const DEFAULT_TIME_ZONE = 'America/Bogota';
export const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// Orden calendario: el índice coincide con Date.getUTCDay() (0 = domingo).
const WEEKDAY_ORDER: readonly Weekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

// Fecha calendario (año, mes 1-12, día) sin notion de hora ni de zona.
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const displayFormatterCache = new Map<string, Intl.DateTimeFormat>();

const getDisplayFormatter = (
  timeZone: string,
  dateOnly: boolean,
): Intl.DateTimeFormat => {
  const cacheKey = `${timeZone}|${dateOnly ? 'display-date' : 'display-time'}`;
  const cached = displayFormatterCache.get(cacheKey);
  if (cached) return cached;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(
      'es-CO',
      dateOnly
        ? {
            timeZone,
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }
        : {
            timeZone,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          },
    );
  } catch {
    throw new Error(`Zona horaria inválida: "${timeZone}"`);
  }

  displayFormatterCache.set(cacheKey, formatter);
  return formatter;
};

const getFormatter = (
  timeZone: string,
  withTime: boolean,
): Intl.DateTimeFormat => {
  const cacheKey = `${timeZone}|${withTime ? 'full' : 'date'}`;
  const cached = formatterCache.get(cacheKey);
  if (cached) return cached;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(
      'en-US',
      withTime
        ? {
            timeZone,
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }
        : {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          },
    );
  } catch {
    throw new Error(`Zona horaria inválida: "${timeZone}"`);
  }

  formatterCache.set(cacheKey, formatter);
  return formatter;
};

const readParts = (
  date: Date,
  timeZone: string,
  withTime: boolean,
): Record<string, number> => {
  const parts = getFormatter(timeZone, withTime).formatToParts(date);
  const values: Record<string, number> = {};

  for (const { type, value } of parts) {
    if (type === 'literal') continue;
    values[type] = Number(value);
  }

  return values;
};

/**
 * Fecha calendario que el instante corresponde en la zona del negocio.
 */
export function getLocalCalendarDate(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): CalendarDate {
  const values = readParts(date, timeZone, false);

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

/**
 * Partes calendario (UTC) de una fecha ya reducida a medianoche UTC.
 */
export function getUtcCalendarDate(date: Date): CalendarDate {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/**
 * Convierte una fecha calendario en la medianoche UTC que la representa.
 */
export function toUtcDateOnly(calendarDate: CalendarDate): Date {
  return new Date(
    Date.UTC(calendarDate.year, calendarDate.month - 1, calendarDate.day),
  );
}

/**
 * Redondea un instante al día calendario del negocio (medianoche UTC).
 */
export function getBusinessDateOnly(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date {
  return toUtcDateOnly(getLocalCalendarDate(date, timeZone));
}

/**
 * Redondea una fecha ya calendarizada a su medianoche UTC.
 */
export function getDateOnly(date: Date): Date {
  return toUtcDateOnly(getUtcCalendarDate(date));
}

/**
 * Suma días de calendario a una fecha de medianoche UTC.
 */
export function addDays(dateOnly: Date, days: number): Date {
  return new Date(dateOnly.getTime() + days * MILLISECONDS_PER_DAY);
}

/**
 * Día de la semana de una fecha de medianoche UTC.
 */
export function getWeekdayOfDateOnly(dateOnly: Date): Weekday {
  return WEEKDAY_ORDER[dateOnly.getUTCDay()];
}

/**
 * Índice del día de la semana (0 = domingo), compatible con Date.getUTCDay().
 */
export function getWeekdayIndex(weekday: Weekday): number {
  return WEEKDAY_ORDER.indexOf(weekday);
}

/**
 * Minutos desde medianoche de una hora en formato "HH:mm".
 */
export function parseTimeToMinutes(time: string): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return undefined;

  return Number(match[1]) * 60 + Number(match[2]);
}

export function getLocalTimeMinutes(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): number {
  const values = readParts(date, timeZone, true);
  const hour = values.hour === 24 ? 0 : values.hour;

  return hour * 60 + values.minute;
}

/**
 * Fecha legible en la zona del negocio ("viernes, 23 de octubre de 2026").
 */
export function formatBusinessDate(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  return getDisplayFormatter(timeZone, true).format(date);
}

/**
 * Hora legible en la zona del negocio ("3:00 p. m.").
 */
export function formatBusinessTime(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  return getDisplayFormatter(timeZone, false).format(date);
}

/**
 * Desfase de la zona respecto a UTC, en milisegundos, para un instante dado.
 */
export function getTimeZoneOffsetMs(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): number {
  const values = readParts(date, timeZone, true);
  // Con hour12:false el idioma puede entregar "24" para medianoche.
  const hour = values.hour === 24 ? 0 : values.hour;
  const asUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    hour,
    values.minute,
    values.second,
  );

  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Combina un día calendario con una hora "HH:mm" y devuelve el instante
 * correspondiente en la zona del negocio.
 *
 * El día se interpreta como fecha calendario (medianoche UTC) y la hora como
 * hora de pared local del negocio. Se resuelve en dos pasadas para corregir
 * el desfase cuando la zona tiene cambio de horario.
 */
export function combineDateAndTime(
  dateOnly: Date,
  time: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date | undefined {
  const minutes = parseTimeToMinutes(time);
  if (minutes === undefined) return undefined;

  const { year, month, day } = getUtcCalendarDate(dateOnly);
  const wallClock = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minutes / 60),
    minutes % 60,
  );

  const firstOffset = getTimeZoneOffsetMs(new Date(wallClock), timeZone);
  let result = new Date(wallClock - firstOffset);
  const refinedOffset = getTimeZoneOffsetMs(result, timeZone);

  if (refinedOffset !== firstOffset) {
    result = new Date(wallClock - refinedOffset);
  }

  return result;
}

export { WEEKDAY_ORDER };
