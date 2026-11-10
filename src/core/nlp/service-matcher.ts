import type { ServiceCatalogEntry, ServiceMatch } from '../types.js';
import { normalizeIntent } from './normalize.js';
import {
  canonicalizeServiceText,
  expandServicePhraseVariants,
} from './service-term-equivalences.js';

/**
 * Normalización de nombres de servicio: sin mayúsculas, sin tildes y sin
 * espacios ni signos innecesarios.
 *
 * Es la única normalización que se aplica a nombres de servicio; la comparten
 * el matcher de catálogo y el validador de servicios.
 */
export const normalizeServiceName = (name: string): string =>
  normalizeIntent(name);

const getPhraseMatchLength = (message: string, phrase: string): number => {
  const exactMatch = new RegExp(
    `(^|[^\\p{Letter}\\p{Number}])${phrase.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )}([^\\p{Letter}\\p{Number}]|$)`,
    'u',
  ).exec(message);
  const exactLength = exactMatch?.[0].trim().length ?? 0;

  const words = phrase.split(/\s+/u);
  const conjunctionIndex = words.indexOf('y');
  if (conjunctionIndex <= 0 || conjunctionIndex === words.length - 1) {
    return exactLength;
  }

  const beforeConjunction = words.slice(0, conjunctionIndex);
  const afterConjunction = words.slice(conjunctionIndex + 1);
  const coordinatedPattern = new RegExp(
    `(^|[^\\p{Letter}\\p{Number}])${beforeConjunction
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+')}(?:\\s+[\\p{Letter}\\p{Number}]+){0,2}\\s+y\\s+${afterConjunction
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+')}([^\\p{Letter}\\p{Number}]|$)`,
    'u',
  ).exec(message);

  return Math.max(exactLength, coordinatedPattern?.[0].trim().length ?? 0);
};

interface ServicePhrase {
  service: ServiceCatalogEntry;
  phrase: string;
}

const collectPhrases = (services: ServiceCatalogEntry[]): ServicePhrase[] =>
  services.flatMap((service) =>
    [service.name, ...(service.aliases ?? [])].flatMap((phrase) => {
      const normalized = normalizeServiceName(phrase);
      if (!normalized) return [];
      const variants = [
        ...new Set([normalized, ...expandServicePhraseVariants(phrase)]),
      ];
      return variants.map((variant) => ({ service, phrase: variant }));
    }),
  );

const RELATED_GENERIC_WORDS: ReadonlySet<string> = new Set([
  'servicio',
  'cita',
  'precio',
  'tarifa',
  'valor',
  'hora',
]);

// Singular aproximado: "cortes" y "corte" cuentan como la misma palabra.
const stemWord = (word: string): string =>
  word.length > 4 && word.endsWith('es')
    ? word.slice(0, -2)
    : word.length > 3 && word.endsWith('s')
      ? word.slice(0, -1)
      : word;

const significantWords = (text: string): Set<string> =>
  new Set(
    (canonicalizeServiceText(text).match(/[\p{Letter}\p{Number}]+/gu) ?? [])
      .filter((word) => word.length >= 4)
      .map(stemWord)
      .filter((word) => !RELATED_GENERIC_WORDS.has(word)),
  );

/**
 * Servicios que comparten alguna palabra significativa con el mensaje, para
 * consultas de catálogo ("¿cuánto cuesta el corte?"). Es solo una pista para
 * pedir aclaración: nunca resuelve ni elige un servicio para una reserva.
 */
export function findRelatedServices(
  text: string,
  services: ServiceCatalogEntry[],
): ServiceCatalogEntry[] {
  const messageWords = significantWords(text);
  if (messageWords.size === 0) return [];

  return services.filter((service) =>
    [service.name, ...(service.aliases ?? [])].some((phrase) =>
      [...significantWords(phrase)].some((word) => messageWords.has(word)),
    ),
  );
}

/**
 * Resuelve una petición de servicio contra el catálogo del negocio.
 *
 * Compara nombres y alias normalizados (incluidas variantes comunes como
 * "pelo"/"cabello"). Si varias entradas del catálogo coinciden con la misma
 * especificidad, el resultado es ambiguo: el motor no elige por su cuenta y el
 * bot debe preguntar al cliente.
 */
export function matchService(
  text: string,
  services: ServiceCatalogEntry[],
): ServiceMatch {
  if (services.length === 0) return { status: 'not-found' };

  const message = normalizeServiceName(text);
  if (!message) return { status: 'not-found' };
  const canonicalMessage = canonicalizeServiceText(text);
  const messages = [
    ...new Set([message, canonicalMessage].filter(Boolean)),
  ];

  // Longitud de la coincidencia más extensa con cada servicio.
  const bestLengthByService = new Map<ServiceCatalogEntry, number>();

  for (const { service, phrase } of collectPhrases(services)) {
    if (!phrase) continue;
    let matchLength = 0;
    for (const candidateMessage of messages) {
      matchLength = Math.max(
        matchLength,
        getPhraseMatchLength(candidateMessage, phrase),
      );
    }
    if (matchLength === 0) continue;

    const current = bestLengthByService.get(service) ?? 0;
    if (matchLength > current) bestLengthByService.set(service, matchLength);
  }

  if (bestLengthByService.size === 0) return { status: 'not-found' };

  // La coincidencia más específica gana: "corte de pelo" no es ambiguo con
  // "corte" si el catálogo define el nombre completo.
  const longest = Math.max(...bestLengthByService.values());
  const candidates = services.filter(
    (service) => bestLengthByService.get(service) === longest,
  );

  if (candidates.length === 1) {
    return { status: 'matched', service: candidates[0] };
  }

  return { status: 'ambiguous', candidates };
}
