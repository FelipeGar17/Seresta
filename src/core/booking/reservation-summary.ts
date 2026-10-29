import type {
  ConfiguracionNegocio,
  ReservationData,
  Service,
} from '../types.js';
import {
  combineDateAndTime,
  formatBusinessDate,
  formatBusinessTime,
} from '../time/business-time.js';
import { validateService } from './service-validator.js';

export interface ReservationSummary {
  service: Service;
  customerName: string;
  startsAt: Date;
  endsAt: Date;
}

export const formatDuration = (minutes: number): string =>
  minutes === 1 ? '1 minuto' : `${minutes} minutos`;

export const formatPrice = (price: number): string =>
  `$${new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 2,
  }).format(price)} COP`;

export function buildReservationSummary(
  business: ConfiguracionNegocio,
  data: ReservationData,
): ReservationSummary | undefined {
  if (!data.serviceId || !data.customerName?.trim()) return undefined;
  if (!data.requestedDate || !data.requestedTime) return undefined;
  if (Number.isNaN(data.requestedDate.getTime())) return undefined;

  const serviceResult = validateService(business, data.serviceId);
  if (!serviceResult.valid) return undefined;

  const startsAt = combineDateAndTime(
    data.requestedDate,
    data.requestedTime,
    business.timezone,
  );
  if (!startsAt) return undefined;

  return {
    service: serviceResult.value,
    customerName: data.customerName.trim(),
    startsAt,
    endsAt: new Date(
      startsAt.getTime() +
        serviceResult.value.durationMinutes * 60 * 1000,
    ),
  };
}

export function formatReservationSummary(
  summary: ReservationSummary,
  timeZone: string,
): string {
  return [
    '*Resumen de tu cita*',
    '',
    `• Servicio: ${summary.service.name}`,
    `• Fecha: ${formatBusinessDate(summary.startsAt, timeZone)}`,
    `• Hora: ${formatBusinessTime(summary.startsAt, timeZone)}`,
    `• Nombre: ${summary.customerName}`,
    `• Duración: ${formatDuration(summary.service.durationMinutes)}`,
    `• Precio: ${formatPrice(summary.service.price)}`,
    '',
    '¿Los datos son correctos? ¿Confirmas la solicitud?',
    '',
    'Responde:',
    '• *Sí, confirmar*',
    '• *Cambiar algún dato*',
    '• *Cancelar*',
  ].join('\n');
}
