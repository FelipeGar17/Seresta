import type { Service, ServiceCatalogEntry } from '../types.js';
import { normalizeIntent } from './normalize.js';
import { suggestAliasesForServiceName } from './service-presets.js';

// `ServiceCatalogEntry.id` es obligatorio: toda entrada operativa puede
// vincularse con su `Service` canónico por identificador.
export type OperationalServiceCatalogEntry = ServiceCatalogEntry;

export type ExcludedServiceReason =
  | 'inactive'
  | 'missing-id'
  | 'missing-name';

export interface ExcludedService {
  service: Service;
  reason: ExcludedServiceReason;
}

export interface ServiceCatalogBuildResult {
  entries: OperationalServiceCatalogEntry[];
  excluded: ExcludedService[];
}

export interface ServiceCatalogBuildOptions {
  /**
   * Agrega alias sugeridos por presets cuando no colisionan con otros servicios
   * configurados. Ayuda a reconocer variaciones comunes sin cambiar el catálogo
   * canónico del negocio. Por defecto: true.
   */
  enrichAliasesFromPresets?: boolean;
}

const hasUsableId = (id: string | undefined): id is string =>
  typeof id === 'string' && id.trim().length > 0;

const collectClaimedPhrases = (services: readonly Service[]): Set<string> => {
  const claimed = new Set<string>();
  for (const service of services) {
    for (const phrase of [service.name, ...(service.aliases ?? [])]) {
      const key = normalizeIntent(phrase);
      if (key) claimed.add(key);
    }
  }
  return claimed;
};

/**
 * Deriva el catálogo que consume el NLP a partir de la configuración canónica
 * del negocio (`ConfiguracionNegocio.services`).
 *
 * Reglas:
 * - solo servicios activos;
 * - solo servicios con id utilizable, porque la reserva se resuelve por id;
 * - se conservan nombre y alias tal como los configuró el negocio;
 * - puede enriquecer alias desde presets, sin colisionar con otros servicios;
 * - lo excluido se devuelve con su motivo para que el cargador lo reporte.
 */
export function buildServiceCatalog(
  services: readonly Service[],
  options: ServiceCatalogBuildOptions = {},
): ServiceCatalogBuildResult {
  const entries: OperationalServiceCatalogEntry[] = [];
  const excluded: ExcludedService[] = [];
  const enrichAliasesFromPresets = options.enrichAliasesFromPresets ?? true;
  const claimedByOtherServices = collectClaimedPhrases(services);

  for (const service of services) {
    if (!service.active) {
      excluded.push({ service, reason: 'inactive' });
      continue;
    }

    if (!hasUsableId(service.id)) {
      excluded.push({ service, reason: 'missing-id' });
      continue;
    }

    if (typeof service.name !== 'string' || service.name.trim().length === 0) {
      excluded.push({ service, reason: 'missing-name' });
      continue;
    }

    const aliases = [...(service.aliases ?? [])];
    if (enrichAliasesFromPresets) {
      const ownClaims = new Set(
        [service.name, ...aliases].map((phrase) => normalizeIntent(phrase)).filter(Boolean),
      );
      const otherServiceNames = services
        .filter((other) => other !== service)
        .flatMap((other) => [other.name, ...(other.aliases ?? [])])
        .map((phrase) => normalizeIntent(phrase))
        .filter(Boolean);
      for (const alias of suggestAliasesForServiceName(service.name, { max: 6 })) {
        const key = normalizeIntent(alias);
        if (!key || ownClaims.has(key)) continue;
        const usedByAnotherConfiguredService = claimedByOtherServices.has(key) && !ownClaims.has(key);
        if (usedByAnotherConfiguredService) continue;
        // Conserva la ambigüedad legítima: no agregues un alias genérico si
        // otro servicio configurado contiene esa frase/palabra en su nombre.
        const wouldShadowAnotherService = otherServiceNames.some((name) => {
          if (name === key) return true;
          const words = key.split(/\s+/u).filter(Boolean);
          if (words.length === 1) {
            return new RegExp(`(^|\\s)${words[0]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'u').test(name);
          }
          return name.includes(key);
        });
        if (wouldShadowAnotherService) continue;
        aliases.push(alias);
        ownClaims.add(key);
      }
    }

    entries.push({
      id: service.id,
      name: service.name,
      ...(aliases.length > 0 ? { aliases } : {}),
    });
  }

  return { entries, excluded };
}

/**
 * Atajo para el catálogo operativo. No silencia los descartes: si se necesita
 * trazabilidad, usar `buildServiceCatalog`.
 */
export function toServiceCatalog(
  services: readonly Service[],
  options: ServiceCatalogBuildOptions = {},
): OperationalServiceCatalogEntry[] {
  return buildServiceCatalog(services, options).entries;
}
