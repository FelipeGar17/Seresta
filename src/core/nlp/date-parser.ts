import type { Weekday } from '../types.js';
import {
  DEFAULT_TIME_ZONE,
  addDays,
  getBusinessDateOnly,
  getWeekdayIndex,
  getWeekdayOfDateOnly,
} from '../time/business-time.js';
import { normalizeText } from './normalize.js';

const SPANISH_WEEKDAYS: ReadonlyArray<{ name: string; weekday: Weekday }> = [
  { name: 'domingo', weekday: 'sunday' },
  { name: 'lunes', weekday: 'monday' },
  { name: 'martes', weekday: 'tuesday' },
  { name: 'miercoles', weekday: 'wednesday' },
  { name: 'jueves', weekday: 'thursday' },
  { name: 'viernes', weekday: 'friday' },
  { name: 'sabado', weekday: 'saturday' },
];

const WEEKDAY_NAMES = SPANISH_WEEKDAYS.map(({ name }) => name).join('|');

// "en/por/de la mañana" es una franja horaria, no una fecha. Se quitan estas
// frases antes de buscar la fecha para que no conviertan "por la mañana" en
// "mañana" (el día siguiente).
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

const KEYWORD_DATE_PATTERN = /\b(?:pasado\s+manana|manana|hoy)\b/;

// Día de la semana como fecha única. Admite artículo y "próximo" opcionales:
// "lunes", "el lunes", "el próximo lunes".
const WEEKDAY_DATE_PATTERN = new RegExp(
  `\\b(?:(?:el|este|esta)\\s+)?(?:(?:proximo|proxima)\\s+)?(?:${WEEKDAY_NAMES})s?\\b`,
  'u',
);

// Repetición semanal: "los martes", "cada martes", "todos los martes".
const RECURRING_DATE_PATTERN = new RegExp(
  `\\b(?:(?:todos|todas)\\s+(?:los|las)|los|cada|estos|estas)\\s+(?:${WEEKDAY_NAMES})s?\\b`,
  'u',
);

export interface DateParserOptions {
  now?: Date;
  timeZone?: string;
}

export type DatePhraseMatch =
  | {
      kind: 'single';
      type: 'today' | 'tomorrow' | 'day-after-tomorrow' | 'weekday';
      phrase: string;
      weekday?: Weekday;
      // El cliente pidió explícitamente "el próximo <día>".
      isNextWeek: boolean;
    }
  | {
      kind: 'recurring';
      phrase: string;
      weekday: Weekday;
      frequency: 'weekly';
    };

const findWeekday = (phrase: string): Weekday | undefined =>
  SPANISH_WEEKDAYS.find(({ name }) => phrase.includes(name))?.weekday;

const isNextWeekPhrase = (phrase: string): boolean =>
  /\b(?:proximo|proxima)\b/u.test(phrase);

/**
 * Localiza la frase de fecha de un mensaje y la clasifica.
 *
 * Una frase es "única" (hoy, mañana, pasado mañana, un día de la semana) o
 * "recurrente" (los martes, cada martes). Las frases recurrentes nunca se
 * convierten en una fecha concreta.
 */
export function matchDatePhrase(text: string): DatePhraseMatch | undefined {
  const normalized = normalizeText(text).replace(/ñ/gu, 'n');
  const candidate = stripMorningFranja(normalized);

  const recurring = RECURRING_DATE_PATTERN.exec(candidate);
  const keyword = KEYWORD_DATE_PATTERN.exec(candidate);
  const weekday = WEEKDAY_DATE_PATTERN.exec(candidate);

  // Gana la coincidencia más a la izquierda; a igual posición, la recurrencia
  // por ser la lectura más específica ("los martes" no es un martes suelto).
  const matches = [
    {
      index: recurring?.index ?? Infinity,
      match: recurring,
      kind: 'recurring' as const,
      priority: 0,
    },
    {
      index: keyword?.index ?? Infinity,
      match: keyword,
      kind: 'keyword' as const,
      priority: 1,
    },
    {
      index: weekday?.index ?? Infinity,
      match: weekday,
      kind: 'weekday' as const,
      priority: 2,
    },
  ].sort(
    (left, right) => left.index - right.index || left.priority - right.priority,
  );

  const winner = matches[0];
  if (!winner.match) return undefined;

  const phrase = winner.match[0];

  if (winner.kind === 'recurring') {
    const weekdayName = findWeekday(phrase);
    if (!weekdayName) return undefined;

    return {
      kind: 'recurring',
      phrase,
      weekday: weekdayName,
      frequency: 'weekly',
    };
  }

  if (winner.kind === 'keyword') {
    const type =
      phrase === 'hoy'
        ? 'today'
        : phrase === 'manana'
          ? 'tomorrow'
          : 'day-after-tomorrow';

    return { kind: 'single', type, phrase, isNextWeek: false };
  }

  const weekdayName = findWeekday(phrase);
  if (!weekdayName) return undefined;

  return {
    kind: 'single',
    type: 'weekday',
    phrase,
    weekday: weekdayName,
    isNextWeek: isNextWeekPhrase(phrase),
  };
}

/**
 * Convierte una frase de fecha ya reconocida en la fecha calendario
 * correspondiente (medianoche UTC del día del negocio).
 */
export function resolveDatePhrase(
  match: DatePhraseMatch,
  options: DateParserOptions = {},
): Date | undefined {
  if (match.kind === 'recurring') return undefined;

  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const now = options.now ?? new Date();
  const today = getBusinessDateOnly(now, timeZone);

  if (match.type === 'today') return today;
  if (match.type === 'tomorrow') return addDays(today, 1);
  if (match.type === 'day-after-tomorrow') return addDays(today, 2);

  const weekdayIndex = getWeekdayIndex(match.weekday ?? 'sunday');
  const currentWeekday = getWeekdayIndex(getWeekdayOfDateOnly(today));
  const daysUntil = (weekdayIndex - currentWeekday + 7) % 7;

  // El día de la semana nombrado que coincide con hoy se resuelve a hoy.
  // Solo "el próximo <día>" salta a la semana siguiente.
  if (daysUntil === 0) {
    return addDays(today, match.isNextWeek ? 7 : 0);
  }

  return addDays(today, daysUntil);
}

/**
 * Interpreta fechas relativas usando el calendario local del negocio.
 */
export function parseRelativeDate(
  text: string,
  options: DateParserOptions = {},
): Date | undefined {
  const match = matchDatePhrase(text);
  if (!match) return undefined;

  return resolveDatePhrase(match, options);
}
