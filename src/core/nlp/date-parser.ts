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

// "en/por/de la mañana" es una franja horaria, no una fecha. Estas frases se
// quitan antes de buscar el día relativo para que no conviertan "por la
// mañana" en "mañana" (el día siguiente).
const MORNING_FRANJA_PHRASES = [
  'en la manana',
  'por la manana',
  'de la manana',
] as const;

const stripMorningFranja = (text: string): string =>
  MORNING_FRANJA_PHRASES.reduce(
    (result, phrase) => result.replaceAll(phrase, ' '),
    text,
  )
    .replace(/\s+/g, ' ')
    .trim();

// Interpreta fechas relativas usando el calendario local del negocio.
export function parseRelativeDate(
  text: string,
  options: DateParserOptions = {},
): Date | undefined {
  const normalizedText = normalizeText(text).replace(/ñ/gu, 'n');
  const dateText = stripMorningFranja(normalizedText);
  const timeZone = options.timeZone ?? 'America/Bogota';
  const now = options.now ?? new Date();
  const localToday = getLocalDateParts(now, timeZone);
  const today = toDateOnly(localToday.year, localToday.month, localToday.day);

  // Con fronteras de palabra para no confundir "hoy" dentro de otras palabras.
  if (/\bhoy\b/.test(dateText)) return today;
  if (/\bpasado\s+manana\b/.test(dateText)) {
    return new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
  }
  if (/\bmanana\b/.test(dateText)) {
    return new Date(today.getTime() + 24 * 60 * 60 * 1000);
  }

  const weekdayIndex = WEEKDAYS.findIndex((weekday) =>
    dateText.includes(weekday),
  );
  if (weekdayIndex === -1) return undefined;

  const currentWeekday = today.getUTCDay();
  let daysUntil = (weekdayIndex - currentWeekday + 7) % 7;
  if (dateText.includes('proximo') || daysUntil === 0) daysUntil ||= 7;

  return new Date(today.getTime() + daysUntil * 24 * 60 * 60 * 1000);
}
