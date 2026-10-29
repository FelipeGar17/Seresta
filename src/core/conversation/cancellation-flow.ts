import type {
  ConfiguracionNegocio,
  Conversation,
  Reservation,
} from '../types.js';
import {
  formatBusinessDate,
  formatBusinessTime,
} from '../time/business-time.js';
import type { ReservationRepository } from '../reservations/reservation-repository.js';
import { isExplicitConfirmation } from './booking-changes.js';
import { appendTurnMessages, type FlowReply } from './turn-utils.js';

// Flujo de cancelación de citas YA confirmadas (no confundir con cancelar el
// borrador de una reserva, que vive en `booking-flow.ts`). Identifica la cita,
// pide confirmación explícita y la marca como `cancelled` (se conserva hasta
// que la depuración la elimine). No persiste la conversación.

export interface CancellationFlowInput {
  conversation: Conversation;
  business: ConfiguracionNegocio;
  reservations: ReservationRepository;
  normalized: string;
  message: string;
  now: Date;
}

const ORDINALS: Readonly<Record<string, number>> = {
  primera: 1, primero: 1, segunda: 2, segundo: 2, tercera: 3, tercero: 3,
  cuarta: 4, cuarto: 4, quinta: 5, quinto: 5,
};

const CANCEL_CONFIRMATION_PATTERNS: readonly RegExp[] = [
  /^si,? ?(?:cancel\w*|cancelar\w*)(?: (?:la|mi|esa|esta))?(?: (?:cita|reserva))?$/u,
  /^(?:si )?confirmo(?: (?:la|su))?(?: cancelacion)?$/u,
];

const DECLINE_PATTERN =
  /^(?:no|nop|nope|no gracias|mejor no|no cancelar|no quiero cancelar|no la cancel\w*|dejala asi|dejalo asi|ninguna|ninguno|conservar(?: la)?(?: cita)?)$/u;

const describeReservation = (
  reservation: Reservation,
  business: ConfiguracionNegocio,
): string => {
  const service = business.services.find(
    (candidate) => candidate.id === reservation.serviceId,
  );

  return `${service?.name ?? 'Cita'} — ${formatBusinessDate(reservation.startsAt, business.timezone)}, ${formatBusinessTime(reservation.startsAt, business.timezone)}`;
};

const parseSelection = (normalized: string, total: number): number | null => {
  const digits = normalized.match(/^(?:la |el |numero |opcion )?(\d+)$/u);
  const word = normalized.match(/^(?:la |el )?([a-z]+)$/u);
  const value = digits ? Number(digits[1]) : word ? ORDINALS[word[1]] : undefined;

  return value !== undefined && value >= 1 && value <= total ? value : null;
};

const isCancellationConfirmation = (normalized: string): boolean =>
  isExplicitConfirmation(normalized) ||
  CANCEL_CONFIRMATION_PATTERNS.some((pattern) => pattern.test(normalized));

const reply = (
  conversation: Conversation,
  text: string,
  message: string,
  now: Date,
): FlowReply => {
  conversation.updatedAt = now;
  appendTurnMessages(conversation, message, text, now);

  return { reply: text, nextField: null };
};

const askConfirmation = (
  conversation: Conversation,
  reservation: Reservation,
  business: ConfiguracionNegocio,
  message: string,
  now: Date,
): FlowReply =>
  reply(
    conversation,
    [
      '¿Confirmas que deseas cancelar esta cita?',
      '',
      `• ${describeReservation(reservation, business)}`,
      '',
      'Responde *Sí, cancelar* o *No*.',
    ].join('\n'),
    message,
    now,
  );

// Entrada: el cliente pidió cancelar y no hay una reserva en curso.
export async function startCancellationFlow(
  input: Omit<CancellationFlowInput, 'normalized'>,
): Promise<FlowReply> {
  const { conversation, business, reservations, message, now } = input;
  const upcoming = await reservations.listConfirmedByContact(
    conversation.businessId,
    conversation.contactId,
    now,
  );

  conversation.intent = 'cancel-appointment';

  if (upcoming.length === 0) {
    return reply(
      conversation,
      'No encuentro citas confirmadas para cancelar. Si quieres agendar una, dime qué servicio deseas.',
      message,
      now,
    );
  }

  conversation.state = 'awaiting-cancellation';
  conversation.cancellation = { reservationIds: upcoming.map((r) => r.id) };

  if (upcoming.length === 1) {
    conversation.cancellation.selectedId = upcoming[0].id;
    return askConfirmation(conversation, upcoming[0], business, message, now);
  }

  return reply(
    conversation,
    [
      'Tienes estas citas confirmadas. ¿Cuál deseas cancelar? Responde con el número.',
      '',
      ...upcoming.map(
        (reservation, index) =>
          `${index + 1}. ${describeReservation(reservation, business)}`,
      ),
    ].join('\n'),
    message,
    now,
  );
}

// Continuación: elegir la cita (si hay varias) y confirmar la cancelación.
export async function continueCancellationFlow(
  input: CancellationFlowInput,
): Promise<FlowReply> {
  const { conversation, business, reservations, normalized, message, now } =
    input;
  const pending = conversation.cancellation;

  if (!pending) {
    conversation.state = 'idle';
    return startCancellationFlow(input);
  }

  if (DECLINE_PATTERN.test(normalized)) {
    conversation.state = 'completed';
    delete conversation.cancellation;
    return reply(
      conversation,
      'Listo, no cancelé nada. Tu cita sigue vigente.',
      message,
      now,
    );
  }

  if (!pending.selectedId) {
    const options = (
      await Promise.all(pending.reservationIds.map((id) => reservations.getById(id)))
    ).filter(
      (item): item is Reservation => item !== null && item.status === 'confirmed',
    );
    const choice = parseSelection(normalized, options.length);

    if (choice === null) {
      return reply(
        conversation,
        [
          'No identifiqué cuál cita. Responde con el número:',
          '',
          ...options.map(
            (item, index) => `${index + 1}. ${describeReservation(item, business)}`,
          ),
        ].join('\n'),
        message,
        now,
      );
    }

    pending.reservationIds = options.map((item) => item.id);
    pending.selectedId = options[choice - 1].id;
    return askConfirmation(conversation, options[choice - 1], business, message, now);
  }

  const selected = await reservations.getById(pending.selectedId);

  if (!selected || selected.status !== 'confirmed') {
    conversation.state = 'completed';
    delete conversation.cancellation;
    return reply(
      conversation,
      'Esa cita ya no está confirmada, así que no hay nada que cancelar.',
      message,
      now,
    );
  }

  if (!isCancellationConfirmation(normalized)) {
    return askConfirmation(conversation, selected, business, message, now);
  }

  await reservations.update({
    ...selected,
    status: 'cancelled',
    cancelledAt: now,
    updatedAt: now,
  });
  conversation.state = 'cancelled';
  delete conversation.cancellation;

  return reply(
    conversation,
    `Tu cita fue cancelada:\n\n• ${describeReservation(selected, business)}\n\nSi quieres agendar otra, escríbeme.`,
    message,
    now,
  );
}
