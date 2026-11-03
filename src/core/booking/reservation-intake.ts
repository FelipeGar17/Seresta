import type {
  ConfiguracionNegocio,
  ReservationData,
} from '../types.js';
import { assertValidatedBusinessConfig } from '../../config/load-config.js';
import {
  analyzeMessage,
  type MessageAnalysis,
  type MessageAnalysisOptions,
} from '../nlp/message-analysis.js';
import {
  resolveServiceMatch,
  type ServiceResolution,
} from './service-resolution.js';
import { combineDateAndTime } from '../time/business-time.js';

export interface ReservationIntake {
  analysis: MessageAnalysis;
  serviceResolution?: ServiceResolution;
  // Primer fragmento de la reserva: solo lleva serviceId cuando la
  // coincidencia del NLP se resolvió contra la configuración canónica.
  data: ReservationData;
}

/**
 * Primer paso del flujo de reserva: analiza el mensaje y resuelve el servicio
 * contra la configuración del negocio.
 *
 * No completa fecha/hora ni confirma la reserva. Si la coincidencia es
 * ambigua, inexistente, inactiva o de otro negocio, `data.serviceId` queda
 * vacío: el flujo conversacional deberá preguntar o rechazar, nunca elegir.
 */
export function analyzeReservationMessage(
  message: string,
  business: ConfiguracionNegocio,
  options: MessageAnalysisOptions = {},
): ReservationIntake {
  assertValidatedBusinessConfig(business);
  const analysis = analyzeMessage(message, business, options);
  const serviceResolution = analysis.entities.serviceMatch
    ? resolveServiceMatch(analysis.entities.serviceMatch, business)
    : undefined;

  const data: ReservationData = {};
  if (serviceResolution?.status === 'resolved') {
    data.serviceId = serviceResolution.service.id;
  }
  if (analysis.entities.date) {
    data.requestedDate = analysis.entities.date;
  }
  if (analysis.entities.customerName) {
    data.customerName = analysis.entities.customerName;
  }
  if (analysis.entities.time) {
    data.requestedTime = analysis.entities.time;
  } else if (analysis.entities.ambiguousTime) {
    data.ambiguousTime = analysis.entities.ambiguousTime;
  }
  if (!analysis.entities.time && analysis.entities.timeOfDay) {
    data.requestedTimeOfDay = analysis.entities.timeOfDay;
  }

  if (data.requestedDate && data.requestedTime) {
    const startsAt = combineDateAndTime(
      data.requestedDate,
      data.requestedTime,
      business.timezone,
    );
    if (startsAt) {
      data.startsAt = startsAt;
    }
  }

  return { analysis, serviceResolution, data };
}
