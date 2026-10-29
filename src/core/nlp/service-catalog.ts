import type { Service, ServiceCatalogEntry } from '../types.js';

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

const hasUsableId = (id: string | undefined): id is string =>
  typeof id === 'string' && id.trim().length > 0;

/**
 * Deriva el catálogo que consume el NLP a partir de la configuración canónica
 * del negocio (`ConfiguracionNegocio.services`).
 *
 * Reglas:
 * - solo servicios activos;
 * - solo servicios con id utilizable, porque la reserva se resuelve por id;
 * - se conservan nombre y alias tal como los configuró el negocio;
 * - lo excluido se devuelve con su motivo para que el cargador lo reporte.
 */
export function buildServiceCatalog(
  services: readonly Service[],
): ServiceCatalogBuildResult {
  const entries: OperationalServiceCatalogEntry[] = [];
  const excluded: ExcludedService[] = [];

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

    entries.push({
      id: service.id,
      name: service.name,
      ...(service.aliases && service.aliases.length > 0
        ? { aliases: [...service.aliases] }
        : {}),
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
): OperationalServiceCatalogEntry[] {
  return buildServiceCatalog(services).entries;
}
