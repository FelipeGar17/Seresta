import { normalizeText } from './normalize.js';

const WEEKDAYS = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
] as const;

export interface DateParserOptions {
  now?: Date;
  timeZone?: string;
}

const getLocalDateParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
};

const toDateOnly = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month - 1, day));

// Interpreta fechas relativas usando el calendario local del negocio.
export function parseRelativeDate(
  text: string,
  options: DateParserOptions = {},
): Date | undefined {
  const normalizedText = normalizeText(text).replace(/ñ/gu, 'n');
  const timeZone = options.timeZone ?? 'America/Bogota';
  const now = options.now ?? new Date();
  const localToday = getLocalDateParts(now, timeZone);
  const today = toDateOnly(localToday.year, localToday.month, localToday.day);

  if (normalizedText.includes('hoy')) return today;
  if (
    normalizedText.includes('manana') &&
    !normalizedText.includes('en la manana')
  ) {
    return new Date(today.getTime() + 24 * 60 * 60 * 1000);
  }

  const weekdayIndex = WEEKDAYS.findIndex((weekday) =>
    normalizedText.includes(weekday),
  );
  if (weekdayIndex === -1) return undefined;

  const currentWeekday = today.getUTCDay();
  let daysUntil = (weekdayIndex - currentWeekday + 7) % 7;
  if (normalizedText.includes('proximo') || daysUntil === 0) daysUntil ||= 7;

  return new Date(today.getTime() + daysUntil * 24 * 60 * 60 * 1000);
}
