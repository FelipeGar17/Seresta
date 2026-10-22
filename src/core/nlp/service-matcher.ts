import type { ServiceCatalogEntry, ServiceMatch } from '../types.js';
import { normalizeIntent } from './normalize.js';

/**
 * Normalización de nombres de servicio: sin mayúsculas, sin tildes y sin
 * espacios ni signos innecesarios.
 *
 * Es la única normalización que se aplica a nombres de servicio; la comparten
 * el matcher de catálogo y el validador de servicios.
 */
export const normalizeServiceName = (name: string): string =>
  normalizeIntent(name);

// Comprueba que la frase aparezca completa, sin cortar palabras.
const containsPhrase = (message: string, phrase: string): boolean =>
  new RegExp(
    `(^|[^\\p{Letter}\\p{Number}])${phrase.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )}([^\\p{Letter}\\p{Number}]|$)`,
    'u',
  ).test(message);

interface ServicePhrase {
  service: ServiceCatalogEntry;
  phrase: string;
}

const collectPhrases = (services: ServiceCatalogEntry[]): ServicePhrase[] =>
  services.flatMap((service) =>
    [service.name, ...(service.aliases ?? [])].map((phrase) => ({
      service,
      phrase: normalizeServiceName(phrase),
    })),
  );

/**
 * Resuelve una petición de servicio contra el catálogo del negocio.
 *
 * Compara nombres y alias normalizados. Si varias entradas del catálogo
 * coinciden con la misma especificidad, el resultado es ambiguo: el motor no
 * elige por su cuenta y el bot debe preguntar al cliente.
 */
export function matchService(
  text: string,
  services: ServiceCatalogEntry[],
): ServiceMatch {
  if (services.length === 0) return { status: 'not-found' };

  const message = normalizeServiceName(text);
  if (!message) return { status: 'not-found' };

  // Longitud de la frase más larga con la que coincide cada servicio.
  const bestLengthByService = new Map<ServiceCatalogEntry, number>();

  for (const { service, phrase } of collectPhrases(services)) {
    if (!phrase || !containsPhrase(message, phrase)) continue;

    const current = bestLengthByService.get(service) ?? 0;
    if (phrase.length > current) bestLengthByService.set(service, phrase.length);
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
