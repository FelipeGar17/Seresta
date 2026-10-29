import type {
  ConfiguracionNegocio,
  Conversation,
  ConversationIntent,
  ConversationState,
  ReservationData,
} from '../types.js';
import type { ReservationIntake } from '../booking/reservation-intake.js';
import {
  buildReservationSummary,
  formatReservationSummary,
} from '../booking/reservation-summary.js';
import { validateService } from '../booking/service-validator.js';
import { parseTimeToMinutes } from '../time/business-time.js';
import type { ReservationRepository } from '../reservations/reservation-repository.js';
import { normalizeIntent } from '../nlp/normalize.js';
import { extractBareCustomerName } from '../nlp/entity-extractor.js';
import {
  applyReservationChanges,
  CHANGE_INTENTS,
  getReservationChangeMapping,
  isExplicitConfirmation,
  withClarifiedTime,
} from './booking-changes.js';
import {
  CONFIRMATION_OPTIONS,
  formatFinalConfirmationPrompt,
  formatConfirmedReservationReply,
  getFieldPrompt,
  getPromptForData,
  getScheduleRejectionReply,
  getUnrecognizedFieldReply,
  getUnexpectedConfirmationReply,
} from './booking-replies.js';
import {
  getNextReservationField,
  mergeReservationData,
  type ReservationProgressField,
} from './reservation-progress.js';
import { validateReservationSchedule } from './reservation-schedule.js';
import { POST_CONFIRMATION_ACK_TIMEOUT_MS } from './post-confirmation-flow.js';
import {
  appendTurnMessages,
  getLastBotQuestion,
  type FlowReply,
} from './turn-utils.js';

// Flujo de reserva: recopila y valida datos, gestiona las dos confirmaciones,
// los cambios y la cancelación del borrador. El coordinador persiste la
// conversación; aquí solo se crea la reserva tras la confirmación final.

const ACTIVE_BOOKING_STATES: ReadonlySet<ConversationState> = new Set([
  'collecting-service',
  'collecting-date',
  'collecting-time',
  'collecting-customer-data',
  'awaiting-confirmation',
  'awaiting-final-confirmation',
]);

export const isActiveBookingState = (state: ConversationState): boolean =>
  ACTIVE_BOOKING_STATES.has(state);

const getStateForField = (
  field: ReservationProgressField | null,
): ConversationState => {
  if (field === 'serviceId') return 'collecting-service';
  if (field === 'requestedDate') return 'collecting-date';
  if (field === 'requestedTime') return 'collecting-time';
  if (field === 'customerName') return 'collecting-customer-data';
  return 'awaiting-confirmation';
};

const getValidNextReservationField = (
  data: ReservationData,
  business: ConfiguracionNegocio,
): ReservationProgressField | null => {
  const pending = getNextReservationField(data);
  if (pending) return pending;

  if (!data.serviceId || !validateService(business, data.serviceId).valid) {
    return 'serviceId';
  }
  if (!data.requestedDate || Number.isNaN(data.requestedDate.getTime())) {
    return 'requestedDate';
  }
  if (
    !data.requestedTime ||
    parseTimeToMinutes(data.requestedTime) === undefined
  ) {
    return 'requestedTime';
  }
  if (!data.customerName?.trim()) return 'customerName';

  return null;
};

// Pregunta con la que se retoma la reserva en curso después de una
// interrupción (por ejemplo, una consulta de catálogo).
export const getBookingResumePrompt = (
  conversation: Conversation,
  business: ConfiguracionNegocio,
): FlowReply & { followUp: string } => {
  if (conversation.state === 'awaiting-confirmation') {
    return {
      reply: '',
      nextField: null,
      followUp: [
        'Tu solicitud de reserva sigue pendiente de confirmación y no se ha creado ninguna cita.',
        '',
        CONFIRMATION_OPTIONS,
      ].join('\n'),
    };
  }

  if (conversation.state === 'awaiting-final-confirmation') {
    const summary = buildReservationSummary(business, conversation.data);
    return {
      reply: '',
      nextField: null,
      followUp: summary
        ? formatFinalConfirmationPrompt(summary, business.timezone)
        : [
            'La cita todavía no está confirmada.',
            '',
            CONFIRMATION_OPTIONS,
          ].join('\n'),
    };
  }

  const nextField = getValidNextReservationField(conversation.data, business);

  return {
    reply: '',
    nextField,
    followUp: getPromptForData(
      nextField ?? 'serviceId',
      conversation.data,
      business,
    ),
  };
};

export interface BookingFlowInput {
  conversation: Conversation;
  intake: ReservationIntake;
  business: ConfiguracionNegocio;
  reservations: ReservationRepository;
  message: string;
  now: Date;
}

export async function handleBookingFlow(
  input: BookingFlowInput,
): Promise<FlowReply> {
  const { conversation, intake, business, reservations, message, now } = input;
  const detection = intake.analysis.detection;

  if (detection.intent === 'cancel-appointment') {
    return cancelBooking(conversation, message, now);
  }

  if (
    (conversation.state === 'awaiting-confirmation' ||
      conversation.state === 'awaiting-final-confirmation') &&
    buildReservationSummary(business, conversation.data)
  ) {
    return handleConfirmationTurn(
      conversation,
      intake,
      business,
      reservations,
      message,
      now,
    );
  }

  const canApplyReservationData =
    detection.intent === 'book-appointment' ||
    detection.intent === 'unknown' ||
    detection.intent === 'reschedule-appointment' ||
    detection.intent === 'check-availability';
  const pendingBeforeMerge = getNextReservationField(conversation.data);
  const incomingData = withClarifiedTime(
    conversation.data,
    intake.data,
    intake,
  );
  const mergedData = canApplyReservationData
    ? mergeReservationData(conversation.data, incomingData)
    : { ...conversation.data };

  // Una respuesta sin prefijo solo es un nombre si el bot lo estaba pidiendo.
  // Se reutiliza el texto corregido del análisis para no incorporar errores
  // ortográficos de cortesías al nombre.
  if (
    !intake.data.customerName &&
    pendingBeforeMerge === 'customerName' &&
    (detection.intent === 'unknown' || detection.intent === 'thanks')
  ) {
    const customerName = extractBareCustomerName(
      intake.analysis.spelling.text,
    );
    if (customerName) {
      mergedData.customerName = customerName;
    }
  }

  const hasRecognizedBookingData = Boolean(
    intake.data.serviceId ||
      intake.data.requestedDate ||
      intake.data.requestedTime ||
      intake.data.ambiguousTime ||
      intake.data.customerName,
  );
  const unrecognizedField =
    detection.intent === 'unknown' &&
    !hasRecognizedBookingData &&
    pendingBeforeMerge
      ? pendingBeforeMerge
      : undefined;

  return finishBookingTurn(
    conversation,
    mergedData,
    business,
    message,
    now,
    unrecognizedField,
  );
}

async function handleConfirmationTurn(
  conversation: Conversation,
  intake: ReservationIntake,
  business: ConfiguracionNegocio,
  reservations: ReservationRepository,
  message: string,
  now: Date,
): Promise<FlowReply> {
  const detection = intake.analysis.detection;
  const normalized = detection.normalized;

  if (isExplicitConfirmation(normalized)) {
    const schedule = validateReservationSchedule(
      business,
      conversation.data,
      now,
    );

    if (schedule.status !== 'valid') {
      return finishBookingTurn(
        conversation,
        { ...conversation.data },
        business,
        message,
        now,
      );
    }

    conversation.data = {
      ...conversation.data,
      startsAt: schedule.slot.startsAt,
      endsAt: schedule.slot.endsAt,
      occupiedEndsAt: schedule.slot.occupiedEndsAt,
    };

    if (conversation.state === 'awaiting-final-confirmation') {
      return confirmBooking(conversation, business, reservations, message, now);
    }

    return requestFinalConfirmation(
      conversation,
      business,
      message,
      now,
    );
  }

  if (detection.intent === 'reject-appointment') {
    return askWhatToDoAfterRejection(conversation, message, now);
  }

  const lastQuestion = normalizeIntent(getLastBotQuestion(conversation) ?? '');
  const expectsField = /que dato deseas cambiar/u.test(lastQuestion);
  const change = getReservationChangeMapping(
    normalized,
    intake.data,
    CHANGE_INTENTS.has(detection.intent),
    expectsField,
  );

  if (change.fields.length > 0) {
    const changedData = applyReservationChanges(
      conversation.data,
      intake.data,
      change.fields,
    );

    return finishBookingTurn(conversation, changedData, business, message, now);
  }

  if (change.asksForField || detection.intent === 'reschedule-appointment') {
    return askForChangeField(conversation, message, now);
  }

  return handleUnexpectedConfirmation(
    conversation,
    detection.intent,
    business,
    message,
    now,
  );
}

function finishBookingTurn(
  conversation: Conversation,
  data: ReservationData,
  business: ConfiguracionNegocio,
  message: string,
  now: Date,
  unrecognizedField?: ReservationProgressField,
): FlowReply {
  const schedule = validateReservationSchedule(business, data, now);
  const scheduleRejectionReply =
    schedule.status === 'invalid'
      ? getScheduleRejectionReply(schedule, business, data)
      : undefined;

  if (schedule.status === 'valid') {
    data.startsAt = schedule.slot.startsAt;
    data.endsAt = schedule.slot.endsAt;
    data.occupiedEndsAt = schedule.slot.occupiedEndsAt;
  } else {
    delete data.startsAt;
    delete data.endsAt;
    delete data.occupiedEndsAt;
    if (schedule.status === 'invalid') {
      delete data[schedule.field];
    }
  }

  let nextField =
    schedule.status === 'invalid'
      ? schedule.field
      : getValidNextReservationField(data, business);
  let reply: string;

  if (schedule.status === 'invalid') {
    reply =
      scheduleRejectionReply ??
      getScheduleRejectionReply(schedule, business, data);
  } else if (nextField) {
    reply =
      unrecognizedField === nextField
        ? getUnrecognizedFieldReply(nextField, data, business)
        : getPromptForData(nextField, data, business);
  } else {
    const summary = buildReservationSummary(business, data);

    if (summary) {
      reply = formatReservationSummary(summary, business.timezone);
    } else {
      nextField = 'serviceId';
      reply = getFieldPrompt(nextField, business);
    }
  }

  conversation.data = data;
  conversation.state = getStateForField(nextField);
  conversation.intent = 'book-appointment';
  conversation.updatedAt = now;
  appendTurnMessages(conversation, message, reply, now);

  return { reply, nextField };
}

function cancelBooking(
  conversation: Conversation,
  message: string,
  now: Date,
): FlowReply {
  const reply =
    'La solicitud de reserva fue cancelada. No se creó ninguna cita.';

  conversation.data = {};
  conversation.state = 'cancelled';
  conversation.intent = 'cancel-appointment';
  conversation.updatedAt = now;
  appendTurnMessages(conversation, message, reply, now);

  return { reply, nextField: null };
}

// Crea la reserva definitiva (idempotente por conversación). Aún no hay evento
// externo; el contexto espera un breve agradecimiento antes de cerrarse.
async function confirmBooking(
  conversation: Conversation,
  business: ConfiguracionNegocio,
  reservations: ReservationRepository,
  message: string,
  now: Date,
): Promise<FlowReply> {
  const summary = buildReservationSummary(business, conversation.data);
  if (!summary) {
    return finishBookingTurn(
      conversation,
      { ...conversation.data },
      business,
      message,
      now,
    );
  }

  const reservation = await reservations.create({
    id: `reservation:${conversation.id}`,
    businessId: conversation.businessId,
    contactId: conversation.contactId,
    whatsappId: conversation.whatsappId,
    customerPhone: conversation.customerPhone,
    customerName: summary.customerName,
    serviceId: summary.service.id,
    startsAt: conversation.data.startsAt ?? summary.startsAt,
    endsAt: conversation.data.endsAt ?? summary.endsAt,
    status: 'confirmed',
    createdAt: now,
    updatedAt: now,
  });
  const reply = formatConfirmedReservationReply(
    {
      ...summary,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
    },
    business.timezone,
  );

  conversation.state = 'awaiting-acknowledgment';
  conversation.intent = 'confirm-appointment';
  conversation.updatedAt = now;
  conversation.expiresAt = new Date(
    now.getTime() + POST_CONFIRMATION_ACK_TIMEOUT_MS,
  );
  appendTurnMessages(conversation, message, reply, now);

  return { reply, nextField: null };
}

function requestFinalConfirmation(
  conversation: Conversation,
  business: ConfiguracionNegocio,
  message: string,
  now: Date,
): FlowReply {
  const summary = buildReservationSummary(business, conversation.data);
  if (!summary) {
    return finishBookingTurn(
      conversation,
      { ...conversation.data },
      business,
      message,
      now,
    );
  }

  const reply = formatFinalConfirmationPrompt(summary, business.timezone);
  conversation.state = 'awaiting-final-confirmation';
  conversation.intent = 'confirm-appointment';
  conversation.updatedAt = now;
  appendTurnMessages(conversation, message, reply, now);

  return { reply, nextField: null };
}

function askForChangeField(
  conversation: Conversation,
  message: string,
  now: Date,
): FlowReply {
  const reply =
    '¿Qué dato deseas cambiar? Puedes indicarme la fecha, la hora, el servicio o el nombre.';

  conversation.state = 'awaiting-confirmation';
  conversation.intent = 'reschedule-appointment';
  conversation.updatedAt = now;
  appendTurnMessages(conversation, message, reply, now);

  return { reply, nextField: null };
}

function askWhatToDoAfterRejection(
  conversation: Conversation,
  message: string,
  now: Date,
): FlowReply {
  const reply =
    'De acuerdo, no confirmaré la cita todavía. ¿Qué deseas hacer: cambiar algún dato o cancelar esta solicitud?';

  conversation.state = 'awaiting-confirmation';
  conversation.intent = 'reject-appointment';
  conversation.updatedAt = now;
  appendTurnMessages(conversation, message, reply, now);

  return { reply, nextField: null };
}

function handleUnexpectedConfirmation(
  conversation: Conversation,
  intent: ConversationIntent,
  business: ConfiguracionNegocio,
  message: string,
  now: Date,
): FlowReply {
  const summary =
    conversation.state === 'awaiting-final-confirmation'
      ? buildReservationSummary(business, conversation.data)
      : undefined;
  const reply = summary
    ? [
        'No entendí tu respuesta. La cita todavía no está confirmada.',
        '',
        formatFinalConfirmationPrompt(summary, business.timezone),
      ].join('\n')
    : getUnexpectedConfirmationReply(intent);

  conversation.intent = intent;
  conversation.updatedAt = now;
  appendTurnMessages(conversation, message, reply, now);

  return { reply, nextField: null };
}
