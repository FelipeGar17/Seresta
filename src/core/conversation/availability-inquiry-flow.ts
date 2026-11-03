import type {
  ConfiguracionNegocio,
  Conversation,
  ReservationData,
} from '../types.js';
import type { ReservationIntake } from '../booking/reservation-intake.js';
import { resolveServiceMatch } from '../booking/service-resolution.js';
import {
  formatBusinessDate,
  formatBusinessTime,
} from '../time/business-time.js';
import type { ReservationCalendar } from '../reservations/reservation-calendar.js';
import type { ReservationRepository } from '../reservations/reservation-repository.js';
import {
  getAvailabilityPeriodReply,
  getPromptForData,
  getScheduleRejectionReply,
} from './booking-replies.js';
import { validateScheduleWithCalendar } from './booking-flow.js';
import { mergeReservationData } from './reservation-progress.js';
import {
  appendTurnMessages,
  type FlowReply,
} from './turn-utils.js';

const NO_RESERVATION_NOTE =
  'Para reservar, escribe *agendar*. Aún no he creado ninguna cita.';

const createServicePrompt = (business: ConfiguracionNegocio): string => {
  const services = business.services
    .filter((service) => service.active)
    .map((service) => `• ${service.name}`);

  return [
    '✂️ ¿Para qué servicio quieres consultar la disponibilidad?',
    ...(services.length > 0 ? ['', 'Disponibles:', ...services] : []),
    '',
    'ℹ️ Para revisar la disponibilidad, necesito saber el servicio; cada uno tiene una duración distinta.',
    '',
    'Escribe el nombre del servicio.',
  ].join('\n');
};

export const getAvailabilityInquiryResumePrompt = (
  data: ReservationData,
  business: ConfiguracionNegocio,
): FlowReply => {
  if (!data.serviceId) {
    return {
      reply: createServicePrompt(business),
      nextField: 'serviceId',
    };
  }

  if (!data.requestedDate) {
    return {
      reply: '📅 ¿Para qué fecha quieres revisar? Ej.: mañana o viernes.',
      nextField: 'requestedDate',
    };
  }

  if (data.ambiguousTime) {
    return {
      reply: getPromptForData('requestedTime', data, business),
      nextField: 'requestedTime',
    };
  }

  return {
    reply: `Dime otra fecha para revisar o escribe *agendar* si quieres iniciar una reserva. Aún no he creado ninguna cita.`,
    nextField: null,
  };
};

export interface AvailabilityInquiryInput {
  conversation: Conversation;
  intake: ReservationIntake;
  business: ConfiguracionNegocio;
  reservations: ReservationRepository;
  calendar: ReservationCalendar;
  message: string;
  now: Date;
}

export async function handleAvailabilityInquiry(
  input: AvailabilityInquiryInput,
): Promise<FlowReply> {
  const {
    conversation,
    intake,
    business,
    reservations,
    calendar,
    message,
    now,
  } = input;
  const isContinuation = conversation.state === 'checking-availability';
  const incomingData: ReservationData = {
    ...(intake.data.serviceId ? { serviceId: intake.data.serviceId } : {}),
    ...(intake.data.requestedDate
      ? { requestedDate: intake.data.requestedDate }
      : {}),
    ...(intake.data.requestedTime
      ? { requestedTime: intake.data.requestedTime }
      : {}),
    ...(intake.data.requestedTimeOfDay
      ? { requestedTimeOfDay: intake.data.requestedTimeOfDay }
      : {}),
    ...(intake.data.ambiguousTime
      ? { ambiguousTime: intake.data.ambiguousTime }
      : {}),
  };
  const data = mergeReservationData(
    isContinuation ? conversation.data : {},
    incomingData,
  );
  delete data.customerName;
  delete data.startsAt;
  delete data.endsAt;
  delete data.occupiedEndsAt;

  const serviceMatch = intake.analysis.entities.serviceMatch;
  const serviceResolution = serviceMatch
    ? resolveServiceMatch(serviceMatch, business)
    : undefined;

  if (serviceResolution?.status === 'ambiguous') {
    delete data.serviceId;
    const reply = [
      '🔎 Hay varios servicios que coinciden. ¿Cuál quieres consultar?',
      ...serviceResolution.candidates.map(
        (service) => `• ${service.name}`,
      ),
    ].join('\n');
    return finishInquiryTurn(
      conversation,
      data,
      message,
      reply,
      'serviceId',
      now,
    );
  }

  if (
    serviceMatch &&
    serviceResolution?.status !== 'resolved' &&
    serviceResolution?.status !== 'not-found'
  ) {
    delete data.serviceId;
    if (
      serviceResolution?.status === 'invalid-catalog-entry' ||
      serviceResolution?.status === 'foreign-service'
    ) {
      throw new Error(
        'La coincidencia del servicio no pertenece al catálogo válido del negocio.',
      );
    }

    const reason = 'Ese servicio no está disponible actualmente.';
    const reply = `${reason}\n\n${createServicePrompt(business)}`;
    return finishInquiryTurn(
      conversation,
      data,
      message,
      reply,
      'serviceId',
      now,
    );
  }

  if (!data.serviceId || !data.requestedDate || data.ambiguousTime) {
    const prompt = getAvailabilityInquiryResumePrompt(data, business);
    return finishInquiryTurn(
      conversation,
      data,
      message,
      prompt.reply,
      prompt.nextField,
      now,
    );
  }

  const schedule = await validateScheduleWithCalendar(
    business,
    data,
    now,
    reservations,
    calendar,
    `availability:${conversation.id}`,
  );

  if (schedule.status === 'invalid') {
    const reply = [
      getScheduleRejectionReply(schedule, business, data),
      '',
      NO_RESERVATION_NOTE,
    ].join('\n');
    return finishInquiryTurn(
      conversation,
      data,
      message,
      reply,
      schedule.field,
      now,
    );
  }

  if (schedule.status === 'valid') {
    const reply = [
      `✅ Sí, ${formatBusinessTime(schedule.slot.startsAt, business.timezone)} está disponible para ${schedule.service.name}.`,
      '',
      NO_RESERVATION_NOTE,
    ].join('\n');
    return finishInquiryTurn(
      conversation,
      data,
      message,
      reply,
      null,
      now,
    );
  }

  if (schedule.availableStarts === undefined) {
    throw new Error(
      'La consulta de disponibilidad no devolvió horarios para una fecha válida.',
    );
  }

  if (schedule.availableStarts.length === 0) {
    const service = business.services.find(
      (candidate) => candidate.id === data.serviceId,
    );
    if (!service) {
      throw new Error(
        'No se encontró el servicio activo usado en la consulta de disponibilidad.',
      );
    }

    const reply = [
      `😕 No encuentro horarios disponibles para ${service.name} el ${formatBusinessDate(data.requestedDate, business.timezone)}.`,
      'Prueba otra fecha y la reviso.',
      '',
      NO_RESERVATION_NOTE,
    ].join('\n');
    return finishInquiryTurn(
      conversation,
      data,
      message,
      reply,
      'requestedDate',
      now,
    );
  }

  const reply = [
    getAvailabilityPeriodReply(
      schedule.availableStarts,
      business,
      data.requestedTimeOfDay,
    ),
    '',
    NO_RESERVATION_NOTE,
  ].join('\n');
  return finishInquiryTurn(
    conversation,
    data,
    message,
    reply,
    'requestedTime',
    now,
  );
}

const finishInquiryTurn = (
  conversation: Conversation,
  data: ReservationData,
  message: string,
  reply: string,
  nextField: FlowReply['nextField'],
  now: Date,
): FlowReply => {
  conversation.data = data;
  conversation.intent = 'check-availability';
  conversation.state = 'checking-availability';
  conversation.updatedAt = now;
  appendTurnMessages(conversation, message, reply, now);

  return { reply, nextField };
};
