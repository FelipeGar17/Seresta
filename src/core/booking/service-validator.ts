import type {
  ConfiguracionNegocio,
  Service,
  ValidationResult,
} from '../types.js';
import { normalizeServiceName } from '../nlp/service-matcher.js';

export type ServiceValidationReason =
  | 'not-found'
  | 'inactive'
  | 'invalid-configuration';

export type ServiceValidationResult = ValidationResult<
  Service,
  ServiceValidationReason
>;

const isValidServiceConfiguration = (service: Service): boolean =>
  Number.isFinite(service.durationMinutes) &&
  service.durationMinutes > 0 &&
  Number.isFinite(service.price) &&
  service.price >= 0;

const findService = (
  business: ConfiguracionNegocio,
  serviceQuery: string,
): Service | undefined => {
  const serviceById = business.services.find(
    (service) => service.id === serviceQuery,
  );

  if (serviceById) return serviceById;

  const normalizedQuery = normalizeServiceName(serviceQuery);
  if (!normalizedQuery) return undefined;

  return business.services.find(
    (service) =>
      normalizeServiceName(service.name) === normalizedQuery ||
      (service.aliases ?? []).some(
        (alias) => normalizeServiceName(alias) === normalizedQuery,
      ),
  );
};

/**
 * Busca un servicio por identificador, nombre o alias y valida su configuración.
 *
 * La normalización del nombre es la misma que usa el matcher de catálogo, de
 * modo que un nombre resuelto por el extractor siempre se encuentra aquí.
 */
export function validateService(
  business: ConfiguracionNegocio,
  serviceQuery: string,
): ServiceValidationResult {
  const service = findService(business, serviceQuery);

  if (!service) {
    return { valid: false, reason: 'not-found' };
  }

  if (!service.active) {
    return { valid: false, reason: 'inactive', value: service };
  }

  if (!isValidServiceConfiguration(service)) {
    return { valid: false, reason: 'invalid-configuration', value: service };
  }

  return { valid: true, value: service };
}
