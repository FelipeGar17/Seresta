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

const formatTime = (hour: number, minute: number): string =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

const SPOKEN_HOURS: Readonly<Record<string, number>> = {
  una: 1,
  uno: 1,
  un: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
};
const SPOKEN_HOUR_PATTERN = Object.keys(SPOKEN_HOURS).join('|');

const to24HourTime = (
  hour: number,
  minute: number,
  period: string,
): string => {
  const normalizedPeriod = period.replace(/[\s.]/g, '').toLowerCase();
  let normalizedHour = hour;

  if (normalizedPeriod === 'pm' && hour < 12) normalizedHour += 12;
  if (normalizedPeriod === 'am' && hour === 12) normalizedHour = 0;

  return formatTime(normalizedHour, minute);
};

const PERIOD_PHRASE = '(?:de|en|por)\\s+la\\s+(manana|tarde|noche)';

// Convierte hora + periodo hablado. "de la noche" usa 12 h como medianoche y
// de 6 a 11 como pm; el resto (1–5) se toma como madrugada.
const toPeriodTime = (
  hour: number,
  minute: number,
  period: string,
): string => {
  if (period === 'manana') return to24HourTime(hour, minute, 'am');
  if (period === 'tarde') return to24HourTime(hour, minute, 'pm');
  if (hour === 12) return formatTime(0, minute);
  return to24HourTime(hour, minute, hour >= 6 ? 'pm' : 'am');
};

const extractTime = (message: string): string | undefined => {
  const meridiemMatch = message.match(
    /\b(?:a\s+las\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)\b/i,
  );

  if (meridiemMatch) {
    const hour = Number(meridiemMatch[1]);
    const minute = Number(meridiemMatch[2] ?? '0');

    if (minute > 59 || hour < 1 || hour > 12) return undefined;

    return to24HourTime(hour, minute, meridiemMatch[3]);
  }

  const periodMatch = message.match(
    new RegExp(`\\b(?:a\\s+las\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s+${PERIOD_PHRASE}`, 'i'),
  );

  if (periodMatch) {
    const hour = Number(periodMatch[1]);
    const minute = Number(periodMatch[2] ?? '0');

    if (minute > 59 || hour < 1 || hour > 12) return undefined;

    return toPeriodTime(hour, minute, periodMatch[3].toLowerCase());
  }

  const spokenPeriodMatch = message.match(
    new RegExp(
      `\\b(?:(?:a\\s+las?|de\\s+las?|las?|la)\\s+)?(${SPOKEN_HOUR_PATTERN})(?:\\s*(a\\.?\\s*m\\.?|p\\.?\\s*m\\.?|am|pm)|\\s+${PERIOD_PHRASE})\\b`,
      'i',
    ),
  );

  if (spokenPeriodMatch) {
    const hour = SPOKEN_HOURS[spokenPeriodMatch[1].toLowerCase()];
    return spokenPeriodMatch[2]
      ? to24HourTime(hour, 0, spokenPeriodMatch[2])
      : toPeriodTime(hour, 0, spokenPeriodMatch[3].toLowerCase());
  }

  const clockMatch = message.match(
    /\b(?:a\s+las\s+)?(\d{1,2}):(\d{2})\b/i,
  );

  if (!clockMatch) return undefined;

  const hour = Number(clockMatch[1]);
  const minute = Number(clockMatch[2]);

  if (minute > 59 || hour > 23) return undefined;
  // "4:30" sin periodo es ambigua; solo "16:30" o "04:30" son horas de 24 h.
  if (isAmbiguousClock(clockMatch[1], hour)) return undefined;

  return formatTime(hour, minute);
};

// Hora de 12 h sin cero inicial y sin periodo: puede ser mañana o tarde.
const isAmbiguousClock = (hourText: string, hour: number): boolean =>
  hour >= 1 && hour <= 12 && !hourText.startsWith('0');

/**
 * Hora que el cliente dio sin indicar mañana o tarde ("a las 4", "a las
 * cuatro", "4:30"). No es una hora definitiva: el flujo debe aclararla.
 */
const extractAmbiguousTime = (
  message: string,
): ExtractedEntities['ambiguousTime'] => {
  const numeric =
    message.match(
      /\b(?:a\s+las?|para\s+las?|las?)\s+(\d{1,2})(?::(\d{2}))?(?![\d/:])(?!\s*(?:a\.?\s*m|p\.?\s*m|de\s+la|en\s+la|por\s+la))/i,
    ) ?? message.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (numeric) {
    const hour = Number(numeric[1]);
    const minute = Number(numeric[2] ?? '0');
    if (minute <= 59 && isAmbiguousClock(numeric[1], hour)) {
      return { hour, minute };
    }
  }

  const spoken = message.match(
    new RegExp(
      `\\b(?:a\\s+las?|para\\s+las?|las?)\\s+(${SPOKEN_HOUR_PATTERN})(?!\\s*(?:a\\.?\\s*m|p\\.?\\s*m|de\\s+la|en\\s+la|por\\s+la))\\b`,
      'i',
    ),
  );
  if (spoken) {
    return { hour: SPOKEN_HOURS[spoken[1].toLowerCase()], minute: 0 };
  }

  return undefined;
};

/**
 * Resuelve una hora ambigua con la aclaración del cliente (mañana, tarde o
 * noche). Devuelve `HH:mm` o `undefined` si no hay un periodo.
 */
export function resolveAmbiguousTime(
  ambiguous: NonNullable<ExtractedEntities['ambiguousTime']>,
  timeOfDay: ExtractedEntities['timeOfDay'],
): string | undefined {
  if (!timeOfDay) return undefined;
  const period =
    timeOfDay === 'morning'
      ? 'manana'
      : timeOfDay === 'afternoon'
        ? 'tarde'
        : 'noche';
  return toPeriodTime(ambiguous.hour, ambiguous.minute, period);
}

const extractTimeOfDay = (
  message: string,
): ExtractedEntities['timeOfDay'] => {
  if (/\b(?:en|por|de)\s+la\s+manana\b/u.test(message)) return 'morning';
  if (/\b(?:en|por|de)\s+la\s+tarde\b/u.test(message)) return 'afternoon';
  if (/\b(?:en|por|de)\s+la\s+noche\b/u.test(message)) return 'evening';

  // Respuesta aislada a una aclaración: "pm", "am", "la tarde", "tarde".
  const reply = message.trim().replace(/[.!?¡¿\s]+$/u, '');
  if (/^(?:a\s*\.?\s*m|la\s+manana)$/u.test(reply)) return 'morning';
  if (/^(?:p\s*\.?\s*m|(?:la\s+)?tarde)$/u.test(reply)) return 'afternoon';
  if (/^(?:la\s+)?noche$/u.test(reply)) return 'evening';
  return undefined;
};

const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}' .-]{1,79}$/u;
const NAME_PREFIX_PATTERN =
  /\b(?:me\s+llamo|me\s+dicen|mi\s+nombre\s+es|el\s+nombre\s+es|a\s+nombre\s+de|soy|(?:cambi\w+|modific\w+|corrig\w+)\s+(?:el\s+)?nombre\s+(?:a|por|para|de))\s+([^,.;!?]+)/iu;
const NAME_CLAUSE_END_PATTERN =
  /\s+(?:y\s+)?(?:quiero|deseo|necesito|voy|agendar|reservar|solicitar|cambiar)\b/iu;
// Introducciones conversacionales que no forman parte del nombre
// ("de Sara", "es Sara", "a nombre de Sara", "para Sara").
const NAME_LEADING_PATTERN =
  /^(?:(?:a\s+nombre\s+de|el\s+nombre\s+es|mi\s+nombre\s+es|me\s+llamo|me\s+dicen|soy|es|de|para)\s+)+/iu;
// Cortesías al final ("Sara gracias", "Sara por favor").
const NAME_TRAILING_PATTERN =
  /\s+(?:muchas\s+gracias|gracias|por\s+favor|porfa(?:vor)?)$/iu;

// Palabras que, comparadas con la normalización de intención, no son nombres.
const NAME_BLOCKED_WORDS: ReadonlySet<string> = new Set([
  'si',
  'no',
  'ok',
  'okay',
  'dale',
  'claro',
  'listo',
  'gracias',
  'hola',
  'buenas',
  'buenos',
  'dias',
  'tardes',
  'noches',
  'manana',
  'mañana',
  'hoy',
  'tarde',
  'noche',
  'cita',
  'hora',
  'fecha',
  'servicio',
  'precio',
  'precios',
  'cuanto',
  'cuánto',
  'disponible',
  'reservar',
  'agendar',
  'quiero',
  'necesito',
  'se',
  'que',
  'qué',
  'cual',
  'cuál',
  'me',
  'llamo',
  'soy',
  'nombre',
  'por',
  'favor',
  'muchas',
  'porfa',
  'porfavor',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
]);

const capitalizeName = (name: string): string =>
  name
    .toLocaleLowerCase('es')
    .replace(
      /(^|[\s'-])(\p{L})/gu,
      (_match, separator: string, letter: string) =>
        `${separator}${letter.toLocaleUpperCase('es')}`,
    );

// Recorta lo que sigue al nombre, quita introducciones y cortesías y rechaza
// palabras que no son nombres.
const cleanNameClause = (clause: string): string | undefined => {
  const cleaned = (clause.split(NAME_CLAUSE_END_PATTERN)[0] ?? '')
    .trim()
    .replace(NAME_LEADING_PATTERN, '')
    .replace(NAME_TRAILING_PATTERN, '')
    .trim();

  if (!NAME_PATTERN.test(cleaned)) return undefined;

  const words = normalizeIntent(cleaned).split(/\s+/).filter(Boolean);
  if (
    words.length === 0 ||
    words.some((word) => NAME_BLOCKED_WORDS.has(word))
  ) {
    return undefined;
  }

  return capitalizeName(cleaned);
};

// Devuelve el primer fragmento separado por puntuación que sea un nombre
// válido: "de Sara, gracias" → Sara; "gracias, de Sara" → Sara.
const cleanNameCandidate = (candidate: string): string | undefined => {
  for (const clause of candidate.split(/[,.;!?]+/u)) {
    const name = cleanNameClause(clause);
    if (name) return name;
  }

  return undefined;
};

// Nombre declarado con prefijo explícito ("me llamo X", "mi nombre es X",
// "soy X"). Nunca inventa un nombre a partir de un mensaje sin prefijo.
export function extractExplicitCustomerName(
  message: string,
): string | undefined {
  const { text } = splitEmojis(normalizeForExtraction(message));
  const prefixed = NAME_PREFIX_PATTERN.exec(text);

  return prefixed ? cleanNameCandidate(prefixed[1]) : undefined;
}

// Interpreta el mensaje completo como un nombre ("Carlos", "de Carlos"). Solo
// debe usarse cuando el flujo conversacional está esperando el nombre.
export function extractBareCustomerName(message: string): string | undefined {
  const { text } = splitEmojis(normalizeForExtraction(message));

  return cleanNameCandidate(text);
}

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
    ambiguousTime: extractTime(matchingMessage)
      ? undefined
      : extractAmbiguousTime(matchingMessage),
    timeOfDay: extractTimeOfDay(matchingMessage),
    recurrence,
    customerName: extractExplicitCustomerName(message),
  };
}
