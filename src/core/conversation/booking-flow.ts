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
import {
  addDays,
  combineDateAndTime,
  formatBusinessTime24,
  getBusinessDateOnly,
  getDateOnly,
  getLocalTimeMinutes,
  parseTimeToMinutes,
} from '../time/business-time.js';
import {
  getAvailableAppointmentStartTimes,
} from '../booking/appointment-availability.js';
import type { ExistingAppointment } from '../booking/appointment-schedule.js';
import type { ReservationCalendar } from '../reservations/reservation-calendar.js';
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
  getAvailabilityReply,
  getFieldPrompt,
  getPromptForData,
  getScheduleRejectionReply,
  getSelectableServices,
  getUnrecognizedFieldReply,
  getUnexpectedConfirmationReply,
} from './booking-replies.js';
import {
  getNextReservationField,
  mergeReservationData,
  type ReservationProgressField,
} from './reservation-progress.js';
import {
  validateReservationSchedule,
  type ReservationScheduleResult,
} from './reservation-schedule.js';
import { POST_CONFIRMATION_ACK_TIMEOUT_MS } from './post-confirmation-flow.js';
import {
  appendTurnMessages,
  getLastBotQuestion,
  type FlowReply,
} from './turn-utils.js';
import {
  clearOfferedOptions,
  resolveOfferedOption,
  setOfferedOptions,
} from './offered-options.js';

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

const CHANGE_IN_CONFIRMATION_PATTERN =
  /\b(?:cambiar|cambia|cambio|cambie|modificar|modifica|corregir|corrige|ajustar|ajusta|reprogramar|reprograma|mover|mueve|muevo|mejor)\b/u;

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
  intentOverride?: ConversationIntent;
  business: ConfiguracionNegocio;
  reservations: ReservationRepository;
  calendar: ReservationCalendar;
  message: string;
  now: Date;
}

export async function handleBookingFlow(
  input: BookingFlowInput,
): Promise<FlowReply> {
  const {
    conversation,
    intake,
    business,
    reservations,
    calendar,
    intentOverride,
    message,
    now,
  } = input;
  const detection = intake.analysis.detection;
  const intent = intentOverride ?? detection.intent;

  if (
    intent === 'cancel-appointment' ||
    (intent === 'goodbye' &&
      /^(salir|quiero salir|salir de la reserva)$/u.test(detection.normalized))
  ) {
    return cancelBooking(conversation, message, now);
  }

  // Una lista numerada recién ofrecida se resuelve por posición. Solo aplica
  // en el paso que la mostró y cuando el último mensaje del bot la contiene.
  const selectedService =
    conversation.state === 'collecting-service'
      ? resolveOfferedOption(conversation, detection.normalized, 'service')
      : undefined;
  if (selectedService) {
    clearOfferedOptions(conversation);
    return finishBookingTurn(
      conversation,
      mergeReservationData(conversation.data, { serviceId: selectedService }),
      business,
      message,
      now,
      reservations,
      calendar,
    );
  }

  const selectedTime =
    conversation.state === 'collecting-time'
      ? resolveOfferedOption(conversation, detection.normalized, 'time')
      : undefined;
  if (selectedTime) {
    clearOfferedOptions(conversation);
    return finishBookingTurn(
      conversation,
      mergeReservationData(conversation.data, {
        requestedTime: formatBusinessTime24(
          new Date(selectedTime),
          business.timezone,
        ),
      }),
      business,
      message,
      now,
      reservations,
      calendar,
    );
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
      calendar,
      message,
      now,
    );
  }

  const canApplyReservationData =
    intent === 'book-appointment' ||
    intent === 'unknown' ||
    intent === 'reschedule-appointment' ||
    intent === 'check-availability';
  const negatedChange =
    detection.negatedIntents.includes('reschedule-appointment');
  const pendingBeforeMerge = getNextReservationField(conversation.data);
  const requestedChange = getReservationChangeMapping(
    detection.normalized,
    intake.data,
    CHANGE_INTENTS.has(intent),
    false,
    negatedChange,
  );
  const hasUnspecifiedChange = requestedChange.fields.some((field) => {
    if (field === 'serviceId') return !intake.data.serviceId;
    if (field === 'requestedDate') return !intake.data.requestedDate;
    if (field === 'requestedTime') {
      return (
        !intake.data.requestedTime &&
        !intake.data.ambiguousTime &&
        !intake.data.requestedTimeOfDay
      );
    }
    return !intake.data.customerName;
  });
  if (hasUnspecifiedChange) {
    const changedData = applyReservationChanges(
      conversation.data,
      intake.data,
      requestedChange.fields,
    );
    return finishBookingTurn(
      conversation,
      changedData,
      business,
      message,
      now,
      reservations,
      calendar,
    );
  }

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
    (intent === 'unknown' || intent === 'thanks')
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
      intake.data.requestedTimeOfDay ||
      intake.data.customerName,
  );
  const unrecognizedField =
    intent !== 'book-appointment' &&
    intent !== 'reschedule-appointment' &&
    intent !== 'check-availability' &&
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
    reservations,
    calendar,
    unrecognizedField,
  );
}

async function handleConfirmationTurn(
  conversation: Conversation,
  intake: ReservationIntake,
  business: ConfiguracionNegocio,
  reservations: ReservationRepository,
  calendar: ReservationCalendar,
  message: string,
  now: Date,
): Promise<FlowReply> {
  const detection = intake.analysis.detection;
  const normalized = detection.normalized;

  if (isExplicitConfirmation(normalized)) {
    if (conversation.state === 'awaiting-final-confirmation') {
      return confirmBooking(
        conversation,
        business,
        reservations,
        calendar,
        message,
        now,
      );
    }

    const schedule = await validateScheduleWithCalendar(
      business,
      conversation.data,
      now,
      reservations,
      calendar,
      `reservation:${conversation.id}`,
    );

    if (schedule.status !== 'valid') {
      return finishBookingTurn(
        conversation,
        { ...conversation.data },
        business,
        message,
        now,
        reservations,
        calendar,
        undefined,
        schedule,
      );
    }

    conversation.data = {
      ...conversation.data,
      startsAt: schedule.slot.startsAt,
      endsAt: schedule.slot.endsAt,
      occupiedEndsAt: schedule.slot.occupiedEndsAt,
    };

    return requestFinalConfirmation(
      conversation,
      business,
      message,
      now,
      reservations,
      calendar,
    );
  }

  const lastQuestion = normalizeIntent(getLastBotQuestion(conversation) ?? '');
  const expectsField = /que dato deseas cambiar/u.test(lastQuestion);
  const hasChangeLanguage = CHANGE_IN_CONFIRMATION_PATTERN.test(normalized);
  const acceptsIncomingData =
    !detection.negatedIntents.includes('reschedule-appointment') &&
    (CHANGE_INTENTS.has(detection.intent) ||
      ((detection.intent === 'reject-appointment' ||
        detection.intent === 'confirm-appointment') &&
        hasChangeLanguage));
  const change = getReservationChangeMapping(
    normalized,
    intake.data,
    acceptsIncomingData,
    expectsField,
    detection.negatedIntents.includes('reschedule-appointment'),
  );

  if (change.fields.length > 0) {
    const changedData = applyReservationChanges(
      conversation.data,
      intake.data,
      change.fields,
    );

    return finishBookingTurn(
      conversation,
      changedData,
      business,
      message,
      now,
      reservations,
      calendar,
    );
  }

  if (detection.intent === 'reject-appointment') {
    return askWhatToDoAfterRejection(conversation, message, now);
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
  reservations: ReservationRepository,
  calendar: ReservationCalendar,
  unrecognizedField?: ReservationProgressField,
  scheduleOverride?: ReservationScheduleResult,
): Promise<FlowReply> {
  return finishBookingTurnWithSchedule(
    conversation,
    data,
    business,
    message,
    now,
    reservations,
    calendar,
    unrecognizedField,
    scheduleOverride,
  );
}

export async function validateScheduleWithCalendar(
  business: ConfiguracionNegocio,
  data: ReservationData,
  now: Date,
  reservations: ReservationRepository,
  calendar: ReservationCalendar,
  excludeReservationId: string,
): Promise<ReservationScheduleResult> {
  const localSchedule = validateReservationSchedule(business, data, now);
  if (localSchedule.status === 'invalid') return localSchedule;
  if (!data.serviceId || !data.requestedDate || data.ambiguousTime) {
    return localSchedule;
  }

  const serviceResult = validateService(business, data.serviceId);
  if (!serviceResult.valid) {
    return {
      status: 'invalid',
      field: 'serviceId',
      reason: serviceResult.reason,
    };
  }

  const businessDate = getDateOnly(data.requestedDate);
  const existingAppointments = await getExistingAppointmentsForDate(
    business,
    businessDate,
    reservations,
    calendar,
    excludeReservationId,
  );

  if (localSchedule.status === 'incomplete') {
    return {
      ...localSchedule,
      availableStarts: getAvailableAppointmentStartTimes(business, {
        dateOnly: businessDate,
        durationMinutes: serviceResult.value.durationMinutes,
        now,
        existingAppointments,
      }),
    };
  }

  return validateReservationSchedule(
    business,
    data,
    now,
    existingAppointments,
  );
}

async function getExistingAppointmentsForDate(
  business: ConfiguracionNegocio,
  businessDate: Date,
  reservations: ReservationRepository,
  calendar: ReservationCalendar,
  excludeReservationId: string,
): Promise<ExistingAppointment[]> {
  const nextBusinessDate = addDays(businessDate, 1);
  const from = combineDateAndTime(businessDate, '00:00', business.timezone);
  const to = combineDateAndTime(nextBusinessDate, '00:00', business.timezone);
  if (!from || !to) {
    throw new Error('No se pudo calcular el día de agenda del negocio.');
  }

  const [calendarAppointments, localReservations] = await Promise.all([
    calendar.listBusyAppointments(
      business,
      from,
      to,
      excludeReservationId,
    ),
    reservations.listBlockingAppointments(business.businessId, from, to),
  ]);
  return [
    ...calendarAppointments,
    ...localReservations
      .filter((reservation) => reservation.id !== excludeReservationId)
      .map((reservation) => ({
        startsAt: reservation.startsAt,
        endsAt: reservation.endsAt,
        durationMinutes:
          (reservation.endsAt.getTime() - reservation.startsAt.getTime()) /
          60_000,
      })),
  ];
}

async function finishBookingTurnWithSchedule(
  conversation: Conversation,
  data: ReservationData,
  business: ConfiguracionNegocio,
  message: string,
  now: Date,
  reservations: ReservationRepository,
  calendar: ReservationCalendar,
  unrecognizedField?: ReservationProgressField,
  scheduleOverride?: ReservationScheduleResult,
): Promise<FlowReply> {
  const schedule =
    scheduleOverride ??
    (await validateScheduleWithCalendar(
      business,
      data,
      now,
      reservations,
      calendar,
      `reservation:${conversation.id}`,
    ));
  const noAvailableStarts =
    schedule.status === 'incomplete' &&
    schedule.availableStarts !== undefined &&
    schedule.availableStarts.length === 0;
  if (noAvailableStarts) {
    delete data.requestedDate;
    delete data.requestedTimeOfDay;
  }
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
  let offeredTimeStarts: Date[] | undefined;

  if (schedule.status === 'invalid') {
    reply =
      scheduleRejectionReply ??
      getScheduleRejectionReply(schedule, business, data);
  } else if (noAvailableStarts) {
    reply = [
      'No encontré horarios disponibles para esa fecha y ese servicio.',
      '',
      getFieldPrompt('requestedDate', business),
    ].join('\n');
  } else if (
    schedule.status === 'incomplete' &&
    schedule.availableStarts &&
    nextField === 'requestedTime'
  ) {
    const requestedPeriod = data.requestedTimeOfDay;
    if (
      requestedPeriod &&
      !schedule.availableStarts.some((start) => {
        const minutes = getLocalTimeMinutes(start, business.timezone);
        return (
          (requestedPeriod === 'morning' && minutes < 12 * 60) ||
          (requestedPeriod === 'afternoon' &&
            minutes >= 12 * 60 &&
            minutes < 18 * 60) ||
          (requestedPeriod === 'evening' && minutes >= 18 * 60)
        );
      })
    ) {
      delete data.requestedTimeOfDay;
    }
    const availability = getAvailabilityReply(
      schedule.availableStarts,
      business,
      requestedPeriod,
    );
    reply = availability.reply;
    offeredTimeStarts = availability.options;
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

  if (nextField === 'serviceId') {
    setOfferedOptions(
      conversation,
      'service',
      getSelectableServices(business).map((service) => service.id),
    );
  } else if (offeredTimeStarts) {
    setOfferedOptions(
      conversation,
      'time',
      offeredTimeStarts.map((start) => start.toISOString()),
    );
  } else {
    clearOfferedOptions(conversation);
  }

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
  clearOfferedOptions(conversation);
  appendTurnMessages(conversation, message, reply, now);

  return { reply, nextField: null };
}

// Crea primero una reserva provisional y solo confirma tras crear el evento
// externo. El ID determinístico de Calendar permite reintentar sin duplicarlo.
async function confirmBooking(
  conversation: Conversation,
  business: ConfiguracionNegocio,
  reservations: ReservationRepository,
  calendar: ReservationCalendar,
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
      reservations,
      calendar,
    );
  }

  const schedule = await validateScheduleWithCalendar(
    business,
    conversation.data,
    now,
    reservations,
    calendar,
    `reservation:${conversation.id}`,
  );
  if (schedule.status !== 'valid') {
    return finishBookingTurn(
      conversation,
      { ...conversation.data },
      business,
      message,
      now,
      reservations,
      calendar,
      undefined,
      schedule,
    );
  }

  const pendingReservation = {
    id: `reservation:${conversation.id}`,
    businessId: conversation.businessId,
    contactId: conversation.contactId,
    whatsappId: conversation.whatsappId,
    customerPhone: conversation.customerPhone,
    customerName: summary.customerName,
    serviceId: summary.service.id,
    startsAt: schedule.slot.startsAt,
    endsAt: schedule.slot.endsAt,
    status: 'pending' as const,
    createdAt: now,
    updatedAt: now,
  };
  let reserved = await reservations.createPendingIfAvailable(
    pendingReservation,
  );
  if (!reserved) {
    const latestSchedule = await validateScheduleWithCalendar(
      business,
      conversation.data,
      now,
      reservations,
      calendar,
      pendingReservation.id,
    );
    if (latestSchedule.status !== 'valid') {
      return finishBookingTurn(
        conversation,
        { ...conversation.data },
        business,
        message,
        now,
        reservations,
        calendar,
        undefined,
        latestSchedule,
      );
    }

    reserved = await reservations.createPendingIfAvailable(pendingReservation);
    if (!reserved) {
      throw new Error(
        'El horario fue reservado por otra solicitud durante la confirmación.',
      );
    }
  }

  const storedReservation = await reservations.getById(pendingReservation.id);
  if (!storedReservation) {
    throw new Error(
      `La reserva "${pendingReservation.id}" no quedó persistida.`,
    );
  }
  const googleCalendarEventId = await calendar.createReservationEvent(
    business,
    storedReservation,
  );
  const reservation = {
    ...storedReservation,
    status: 'confirmed' as const,
    googleCalendarEventId,
    updatedAt: now,
  };
  await reservations.update(reservation);
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
  clearOfferedOptions(conversation);
  appendTurnMessages(conversation, message, reply, now);

  return { reply, nextField: null };
}

async function requestFinalConfirmation(
  conversation: Conversation,
  business: ConfiguracionNegocio,
  message: string,
  now: Date,
  reservations: ReservationRepository,
  calendar: ReservationCalendar,
): Promise<FlowReply> {
  const summary = buildReservationSummary(business, conversation.data);
  if (!summary) {
    return finishBookingTurn(
      conversation,
      { ...conversation.data },
      business,
      message,
      now,
      reservations,
      calendar,
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
