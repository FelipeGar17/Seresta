import type { ConfiguracionNegocio, ConversationIntent, Service } from '../types.js';
import {
  formatDuration,
  formatPrice,
} from '../booking/reservation-summary.js';
import { resolveServiceMatch } from '../booking/service-resolution.js';
import { findRelatedServices } from '../nlp/service-matcher.js';
import type { MessageAnalysis } from '../nlp/message-analysis.js';

export type CatalogIntent = Extract<
  ConversationIntent,
  'list-services' | 'check-prices'
>;

export const isCatalogIntent = (
  intent: ConversationIntent,
): intent is CatalogIntent =>
  intent === 'list-services' || intent === 'check-prices';

const describeService = (service: Service): string =>
  `• ${service.name}: ${formatPrice(service.price)} (${formatDuration(
    service.durationMinutes,
  )})`;

const listServices = (services: readonly Service[]): string =>
  services.map(describeService).join('\n');

/**
 * Responde consultas de catálogo (servicios y precios) solo con los servicios
 * activos de la configuración del negocio. No modifica la conversación ni
 * inicia reservas; el coordinador decide cómo retomar el flujo.
 */
export function buildCatalogReply(
  business: ConfiguracionNegocio,
  intent: CatalogIntent,
  analysis: MessageAnalysis,
): string {
  const activeServices = business.services.filter((service) => service.active);

  if (activeServices.length === 0) {
    return 'Por ahora no tengo servicios configurados para mostrarte.';
  }

  const match = analysis.entities.serviceMatch;
  const resolution = match ? resolveServiceMatch(match, business) : undefined;

  if (resolution?.status === 'ambiguous') {
    return [
      'Tengo varios servicios que podrían coincidir con tu consulta:',
      listServices(resolution.candidates),
      '',
      '¿Sobre cuál quieres saber?',
    ].join('\n');
  }

  // Mención parcial ("el corte"): se muestran las opciones relacionadas y se
  // pide aclaración; nunca se elige una por el cliente.
  if (!resolution || resolution.status === 'not-found') {
    const related = findRelatedServices(
      analysis.detection.normalized,
      analysis.catalog,
    )
      .map((entry) => activeServices.find((service) => service.id === entry.id))
      .filter((service): service is Service => service !== undefined);

    if (related.length > 0) {
      return [
        related.length === 1
          ? 'Tengo este servicio relacionado con tu consulta:'
          : 'Tengo varios servicios que podrían coincidir con tu consulta:',
        listServices(related),
        '',
        related.length === 1
          ? '¿Te refieres a este servicio?'
          : '¿Sobre cuál quieres saber?',
      ].join('\n');
    }
  }

  if (resolution?.status === 'resolved') {
    const { service } = resolution;

    if (intent === 'list-services') {
      return `Sí, ofrecemos ${service.name}.\n${describeService(service)}`;
    }

    return `${service.name} cuesta ${formatPrice(service.price)} y dura ${formatDuration(
      service.durationMinutes,
    )}.`;
  }

  const heading =
    intent === 'check-prices'
      ? 'Estos son nuestros servicios y precios:'
      : 'Estos son los servicios que ofrecemos:';

  return `${heading}\n${listServices(activeServices)}`;
}
