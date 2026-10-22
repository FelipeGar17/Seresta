import type { ExtractedEntities, ServiceCatalogEntry } from '../types.js';
import {
  normalizeForExtraction,
  normalizeIntent,
  splitEmojis,
} from './normalize.js';
import {
  matchDatePhrase,
  resolveDatePhrase,
  type DateParserOptions,
} from './date-parser.js';
import { matchService } from './service-matcher.js';

export interface EntityExtractionOptions extends DateParserOptions {
  normalizedIntent?: string;
  // Catálogo de servicios del negocio. Sin catálogo no se resuelve el
  // servicio: el motor no conoce nombres de servicios por sí mismo.
  services?: ServiceCatalogEntry[];
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

// Extrae entidades sin cambiar ni inferir la intención del mensaje.
export function extractEntities(
  message: string,
  options: EntityExtractionOptions = {},
): ExtractedEntities {
  const { text } = splitEmojis(normalizeForExtraction(message));
  const normalizedMessage = text.toLowerCase();
  const matchingMessage = normalizedMessage.replace(/ñ/gu, 'n');
  const dateCandidateText = (
    options.normalizedIntent ?? normalizeIntent(text)
  ).replace(/ñ/gu, 'n');
  const datePhrase = matchDatePhrase(dateCandidateText);

  // Una repetición ("los martes") no es una fecha única: se reporta aparte.
  const relativeDate =
    datePhrase?.kind === 'single' ? datePhrase.phrase : undefined;
  const recurrence =
    datePhrase?.kind === 'recurring'
      ? { frequency: datePhrase.frequency, weekday: datePhrase.weekday }
      : undefined;

  return {
    serviceMatch: options.services
      ? matchService(text, options.services)
      : undefined,
    relativeDate,
    date: datePhrase ? resolveDatePhrase(datePhrase, options) : undefined,
    time: extractTime(matchingMessage),
    timeOfDay: extractTimeOfDay(matchingMessage),
    recurrence,
  };
}
