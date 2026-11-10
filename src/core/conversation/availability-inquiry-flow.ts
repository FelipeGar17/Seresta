import type {
  ConfiguracionNegocio,
  Conversation,
  ReservationData,
} from '../types.js';
import type { ReservationIntake } from '../booking/reservation-intake.js';
import { resolveServiceMatch } from '../booking/service-resolution.js';
import {
  formatBusinessTime,
  formatBusinessTime24,
  formatCalendarDate,
} from '../time/business-time.js';
import type { ReservationCalendar } from '../reservations/reservation-calendar.js';
import type { ReservationRepository } from '../reservations/reservation-repository.js';
import {
  getAvailabilityReply,
  getPromptForData,
  getScheduleRejectionReply,
  getSelectableServices,
} from './booking-replies.js';
import { validateScheduleWithCalendar } from './booking-flow.js';
import { mergeReservationData } from './reservation-progress.js';
import {
  appendTurnMessages,
  type FlowReply,
} from './turn-utils.js';
import {
  clearOfferedOptions,
  MAX_NUMBERED_OPTIONS,
  OPTION_SELECTION_INSTRUCTION,
  resolveOfferedOption,
  setOfferedOptions,
} from './offered-options.js';

const NO_RESERVATION_NOTE =
  'Para reservar, escribe *agendar*. Aún no he creado ninguna cita.';

const createServicePrompt = (business: ConfiguracionNegocio): string => {
  const services = getSelectableServices(business);

  return [
    '✂️ ¿Para qué servicio quieres consultar la disponibilidad?',
    ...(services.length > 0
      ? [
          '',
          'Disponibles:',
          ...services.map(
            (service, index) => `${index + 1}. ${service.name}`,
          ),
          '',
          OPTION_SELECTION_INSTRUCTION,
        ]
      : []),
    '',
    'ℹ️ Para revisar la disponibilidad, necesito saber el servicio; cada uno tiene una duración distinta.',
    '',
    'También puedes escribir el nombre del servicio.',
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
  const normalized = intake.analysis.detection.normalized;
  const selectedService = resolveOfferedOption(
    conversation,
    normalized,
    'service',
  );
  if (selectedService) {
    incomingData.serviceId = selectedService;
  }
  const selectedTime = resolveOfferedOption(conversation, normalized, 'time');
  if (selectedTime) {
    incomingData.requestedTime = formatBusinessTime24(
      new Date(selectedTime),
      business.timezone,
    );
  }
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
    const candidates = serviceResolution.candidates.slice(
      0,
      MAX_NUMBERED_OPTIONS,
    );
    const reply = [
      '🔎 Hay varios servicios que coinciden. ¿Cuál quieres consultar?',
      ...candidates.map(
        (service, index) => `${index + 1}. ${service.name}`,
      ),
      '',
      OPTION_SELECTION_INSTRUCTION,
    ].join('\n');
    const result = finishInquiryTurn(
      conversation,
      data,
      message,
      reply,
      'serviceId',
      business,
      now,
    );
    setOfferedOptions(
      conversation,
      'service',
      candidates.map((service) => service.id),
    );
    return result;
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
      business,
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
      business,
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
      business,
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
      business,
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
      `😕 No encuentro horarios disponibles para ${service.name} el ${formatCalendarDate(data.requestedDate)}.`,
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
      business,
      now,
    );
  }

  const availability = getAvailabilityReply(
    schedule.availableStarts,
    business,
    data.requestedTimeOfDay,
  );
  const reply = [availability.reply, '', NO_RESERVATION_NOTE].join('\n');
  const result = finishInquiryTurn(
    conversation,
    data,
    message,
    reply,
    'requestedTime',
    business,
    now,
  );
  setOfferedOptions(
    conversation,
    'time',
    availability.options.map((start) => start.toISOString()),
  );
  return result;
}

const finishInquiryTurn = (
  conversation: Conversation,
  data: ReservationData,
  message: string,
  reply: string,
  nextField: FlowReply['nextField'],
  business: ConfiguracionNegocio,
  now: Date,
): FlowReply => {
  conversation.data = data;
  conversation.intent = 'check-availability';
  conversation.state = 'checking-availability';
  conversation.updatedAt = now;

  if (nextField === 'serviceId') {
    setOfferedOptions(
      conversation,
      'service',
      getSelectableServices(business).map((service) => service.id),
    );
  } else {
    clearOfferedOptions(conversation);
  }

  appendTurnMessages(conversation, message, reply, now);

  return { reply, nextField };
};
