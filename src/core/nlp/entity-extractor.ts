import type { ExtractedEntities } from '../types.js';
import {
  normalizeForExtraction,
  normalizeIntent,
  splitEmojis,
} from './normalize.js';
import { parseRelativeDate, type DateParserOptions } from './date-parser.js';

const SERVICE_NAMES = [
  'corte de pelo',
  'cortes de pelo',
  'corte',
  'cortes',
  'manicure',
  'pedicure',
  'barberia',
  'peinado',
] as const;

export interface EntityExtractionOptions extends DateParserOptions {
  normalizedIntent?: string;
}


const extractTime = (message: string): string | undefined => {
  const timeMatch =
    message.match(
      /\b(?:a\s+las\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)\b/i,
    ) ??
    message.match(/\b(?:a\s+las\s+)?(\d{1,2}):(\d{2})\b/i);

  if (!timeMatch) return undefined;

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] ?? '0');
  const meridiem = timeMatch[3]?.replace(/[\s.]/g, '').toLowerCase();

  if (minute > 59) return undefined;

  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;

    let normalizedHour = hour;

    if (meridiem === 'pm' && hour < 12) normalizedHour += 12;
    if (meridiem === 'am' && hour === 12) normalizedHour = 0;

    return `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  if (hour > 23) return undefined;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};


const extractTimeOfDay = (
  message: string,
): ExtractedEntities['timeOfDay'] => {
  if (
    message.includes('en la manana') ||
    message.includes('por la manana') ||
    message.includes('de la manana')
  ) {
    return 'morning';
  }
  if (message.includes('en la tarde')) return 'afternoon';
  if (message.includes('en la noche')) return 'evening';
  return undefined;
};

// "en/por/de la mañana" es una franja horaria, no una fecha. Se quitan estas
// frases antes de buscar la fecha relativa para que no inventen "mañana".
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

const containsPhrase = (message: string, phrase: string): boolean =>
  new RegExp(
    `(^|[^\\p{Letter}\\p{Number}])${phrase.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )}([^\\p{Letter}\\p{Number}]|$)`,
    'u',
  ).test(message);

const extractService = (message: string): string | undefined =>
  SERVICE_NAMES.find((serviceName) => containsPhrase(message, serviceName));

const DATE_TRIGGER_TERMS = [
  'hoy',
  'manana',
  'pasado',
  'proximo',
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
] as const;

const RELATIVE_DATE_PATTERN =
  /\b(?:hoy|pasado\s+manana|manana|el\s+(?:proximo\s+)?(?:domingo|lunes|martes|miercoles|jueves|viernes|sabado))\b/;

// Extrae entidades sin cambiar ni inferir la intención del mensaje.
export function extractEntities(
  message: string,
  options: EntityExtractionOptions = {},
): ExtractedEntities {
  const { text } = splitEmojis(normalizeForExtraction(message));
  const normalizedMessage = text.toLowerCase();
  const matchingMessage = normalizedMessage.replace(/ñ/gu, 'n');
  const dateCandidateText = stripMorningFranja(
    (options.normalizedIntent ?? normalizeIntent(text)).replace(/ñ/gu, 'n'),
  );
  const relativeDate = DATE_TRIGGER_TERMS.some((term) =>
    dateCandidateText.includes(term),
  )
    ? dateCandidateText.match(RELATIVE_DATE_PATTERN)?.[0]
    : undefined;

  return {
    serviceName: extractService(matchingMessage),
    relativeDate,
    date: relativeDate
      ? parseRelativeDate(relativeDate, options)
      : undefined,
    time: extractTime(matchingMessage),
    timeOfDay: extractTimeOfDay(matchingMessage),
  };
}
