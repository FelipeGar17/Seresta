import type { ConversationIntent, ReservationData } from '../types.js';
import type { ReservationIntake } from '../booking/reservation-intake.js';
import { resolveAmbiguousTime } from '../nlp/entity-extractor.js';
import type { ReservationProgressField } from './reservation-progress.js';

// Interpretación de confirmaciones y cambios sobre un borrador de reserva.

const CONFIRMATION_PATTERNS: readonly RegExp[] = [
  /^si$/u,
  /^si (?:(?:la|lo|las|los) )?(?:confirmo|confirmar|acepto|aceptar)(?: (?:la|mi))?(?: (?:cita|reserva))?(?: (?:muchas )?gracias| por favor)?$/u,
  /^si (?:correcto|correctos|todo correcto|todo esta correcto|los datos son correctos|los datos estan correctos|esta bien)$/u,
  /^(?:(?:la|lo|las|los) )?(?:confirmo|confirmar|acepto|aceptar)(?: (?:la|mi))?(?: (?:cita|reserva))?(?: (?:muchas )?gracias| por favor)?$/u,
  /^todo (?:esta )?correcto$/u,
  /^los datos (?:son|estan) correctos$/u,
  /^correcto$/u,
];

export const CHANGE_INTENTS: ReadonlySet<ConversationIntent> = new Set([
  'unknown',
  'book-appointment',
  'reschedule-appointment',
]);

const CHANGE_VERB_PATTERN =
  /\b(?:cambiar|cambia|cambio|cambie|modificar|modifica|corregir|corrige|ajustar|ajusta|reprogramar|reprograma|mover|mueve|muevo)\b/u;

const OTHER_SERVICE_PATTERN =
  /\b(?:otro|otra|diferente)\s+servicio\b/u;

export const isExplicitConfirmation = (normalized: string): boolean =>
  CONFIRMATION_PATTERNS.some((pattern) => pattern.test(normalized));

export interface ReservationChangeMapping {
  fields: ReservationProgressField[];
  asksForField: boolean;
}

export const getReservationChangeMapping = (
  normalized: string,
  incoming: ReservationData,
  acceptsIncomingData: boolean,
  expectsField: boolean,
): ReservationChangeMapping => {
  const fields = new Set<ReservationProgressField>();
  const changing = CHANGE_VERB_PATTERN.test(normalized);

  const addFieldMentions = (allowBare: boolean): void => {
    if (!allowBare && !changing) return;

    if (
      /\bfecha\b/u.test(normalized) ||
      (allowBare && /\bdia\b/u.test(normalized)) ||
      (changing && /\bdia\b/u.test(normalized))
    ) {
      fields.add('requestedDate');
    }
    if (/\bhora\b/u.test(normalized)) fields.add('requestedTime');
    if (/\bservicio\b/u.test(normalized)) fields.add('serviceId');
    if (/\bnombre\b/u.test(normalized)) fields.add('customerName');
  };

  addFieldMentions(expectsField);

  if (OTHER_SERVICE_PATTERN.test(normalized)) {
    fields.add('serviceId');
  }

  if (acceptsIncomingData) {
    if (incoming.serviceId) fields.add('serviceId');
    if (incoming.requestedDate) fields.add('requestedDate');
    if (incoming.requestedTime || incoming.ambiguousTime) {
      fields.add('requestedTime');
    }
    // Un nombre con prefijo explícito corrige el nombre guardado.
    if (incoming.customerName) fields.add('customerName');
  }

  return {
    fields: [...fields],
    asksForField: fields.size === 0 && changing,
  };
};

export const applyReservationChanges = (
  current: ReservationData,
  incoming: ReservationData,
  fields: readonly ReservationProgressField[],
): ReservationData => {
  const updated: ReservationData = { ...current };

  if (fields.includes('serviceId')) {
    if (incoming.serviceId) {
      updated.serviceId = incoming.serviceId;
    } else {
      delete updated.serviceId;
    }
    delete updated.endsAt;
    delete updated.occupiedEndsAt;
  }

  if (fields.includes('requestedDate')) {
    if (incoming.requestedDate) {
      updated.requestedDate = incoming.requestedDate;
    } else {
      delete updated.requestedDate;
    }
  }

  if (fields.includes('requestedTime')) {
    delete updated.ambiguousTime;
    if (incoming.requestedTime) {
      updated.requestedTime = incoming.requestedTime;
    } else {
      delete updated.requestedTime;
      if (incoming.ambiguousTime) {
        updated.ambiguousTime = incoming.ambiguousTime;
      }
    }
  }

  if (fields.includes('customerName')) {
    if (incoming.customerName) {
      updated.customerName = incoming.customerName;
    } else {
      delete updated.customerName;
    }
  }

  if (
    fields.includes('requestedDate') ||
    fields.includes('requestedTime')
  ) {
    delete updated.startsAt;
    delete updated.endsAt;
    delete updated.occupiedEndsAt;
  }

  return updated;
};

// Si el bot estaba aclarando una hora ambigua y el cliente responde con el
// periodo ("de la tarde", "pm"), completa la hora con ese periodo.
export const withClarifiedTime = (
  current: ReservationData,
  incoming: ReservationData,
  intake: ReservationIntake,
): ReservationData => {
  if (
    !current.ambiguousTime ||
    incoming.requestedTime ||
    incoming.ambiguousTime
  ) {
    return incoming;
  }

  const requestedTime = resolveAmbiguousTime(
    current.ambiguousTime,
    intake.analysis.entities.timeOfDay,
  );

  return requestedTime ? { ...incoming, requestedTime } : incoming;
};
