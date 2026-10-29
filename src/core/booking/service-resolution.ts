import type {
  ConfiguracionNegocio,
  Service,
  ServiceMatch,
} from '../types.js';

export type ServiceResolution =
  | { status: 'resolved'; service: Service }
  | { status: 'ambiguous'; candidates: Service[] }
  | { status: 'not-found' }
  | { status: 'invalid-catalog-entry'; entryId: string }
  | { status: 'foreign-service'; service: Service }
  | { status: 'inactive'; service: Service };

const findServiceById = (
  business: ConfiguracionNegocio,
  id: string,
): Service | undefined =>
  business.services.find((service) => service.id === id);

/**
 * Resuelve una coincidencia del NLP contra los servicios canónicos del
 * negocio.
 *
 * No selecciona cuando hay ambigüedad y no acepta entradas de catálogo que no
 * existan en la configuración, pertenezcan a otro negocio o estén inactivas.
 * El resultado `resolved` es la única vía para escribir `serviceId` en una
 * reserva; precio y duración se leen de ese `Service`, nunca del catálogo NLP.
 */
export function resolveServiceMatch(
  match: ServiceMatch,
  business: ConfiguracionNegocio,
): ServiceResolution {
  if (match.status === 'not-found') {
    return { status: 'not-found' };
  }

  if (match.status === 'ambiguous') {
    const candidates: Service[] = [];

    for (const candidate of match.candidates) {
      const service = findServiceById(business, candidate.id);
      if (!service) {
        return { status: 'invalid-catalog-entry', entryId: candidate.id };
      }
      if (service.businessId !== business.businessId) {
        return { status: 'foreign-service', service };
      }
      if (!service.active) {
        return { status: 'inactive', service };
      }
      candidates.push(service);
    }

    return candidates.length > 0
      ? { status: 'ambiguous', candidates }
      : { status: 'not-found' };
  }

  const service = findServiceById(business, match.service.id);
  if (!service) {
    return { status: 'invalid-catalog-entry', entryId: match.service.id };
  }
  if (service.businessId !== business.businessId) {
    return { status: 'foreign-service', service };
  }
  if (!service.active) {
    return { status: 'inactive', service };
  }

  return { status: 'resolved', service };
}
