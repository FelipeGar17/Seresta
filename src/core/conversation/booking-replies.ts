import type {
  ConfiguracionNegocio,
  ConversationIntent,
  ReservationData,
} from '../types.js';
import {
  DEFAULT_APPOINTMENT_INTERVAL_MINUTES,
  formatMinutesAsTime,
  getDayScheduleSegments,
  getAppointmentIntervalMinutes,
} from '../booking/appointment-schedule.js';
import {
  getBusinessDateOnly,
  getLocalTimeMinutes,
  getWeekdayOfDateOnly,
} from '../time/business-time.js';
import { MAX_BOOKING_DAYS_AHEAD } from '../booking/booking-date-policy.js';
import {
  formatBusinessDate,
  formatBusinessTime,
  formatCalendarDate,
} from '../time/business-time.js';
import {
  formatDuration,
  formatPrice,
  type ReservationSummary,
} from '../booking/reservation-summary.js';
import type { ReservationProgressField } from './reservation-progress.js';
import type { ReservationScheduleResult } from './reservation-schedule.js';
import {
  MAX_NUMBERED_OPTIONS,
  OPTION_SELECTION_INSTRUCTION,
} from './offered-options.js';

// Textos que el flujo de reserva le muestra al cliente.
const WEEKDAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;

const formatBusinessHours = (
  business: ConfiguracionNegocio,
  date: Date | undefined,
): string | undefined => {
  if (!date || Number.isNaN(date.getTime())) return undefined;
  const dateOnly = getBusinessDateOnly(date, business.timezone);
  const weekday = getWeekdayOfDateOnly(dateOnly);
  const segments = getDayScheduleSegments(business.businessHours, weekday);
  if (!segments || segments.length === 0) return undefined;

  const intervals = segments
    .map(
      (segment) =>
        `${formatMinutesAsTime(segment.opensAt)}–${formatMinutesAsTime(segment.closesAt)}`,
    )
    .join(' y ');

  return `El ${WEEKDAY_NAMES[dateOnly.getUTCDay()]} atendemos de ${intervals}.`;
};

const getNextStepForSchedule = (
  issue: InvalidReservationSchedule,
  business: ConfiguracionNegocio,
): string | undefined => {
  if (issue.alternatives?.length) {
    const options = issue.alternatives
      .map((start) => formatBusinessTime(start, business.timezone))
      .join(', ');
    return `Los horarios libres más cercanos son: ${options}; elige uno y volveré a comprobarlo.`;
  }

  if (issue.reason === 'outside-hours') {
    const hours = formatBusinessHours(business, issue.requestedStartsAt);
    return hours
      ? `${hours} Indícame otra hora dentro de esos tramos.`
      : 'Indícame otra hora dentro del horario de atención.';
  }

  if (issue.reason === 'misaligned-start') {
    const intervalMinutes =
      getAppointmentIntervalMinutes(business) ??
      DEFAULT_APPOINTMENT_INTERVAL_MINUTES;
    const hours = formatBusinessHours(business, issue.requestedStartsAt);
    return [
      `Los inicios se hacen en bloques de ${intervalMinutes} minutos desde la apertura de cada tramo.`,
      hours,
      'Dime otra hora y la validaré.',
    ].filter(Boolean).join(' ');
  }

  if (issue.reason === 'closed-day') {
    return 'Dime otra fecha en la que el negocio atienda.';
  }

  return undefined;
};

export const formatConfirmedReservationReply = (
  summary: ReservationSummary,
  timeZone: string,
): string =>
  [
    `✅ ¡Gracias por confirmar, ${summary.customerName}! Tu cita quedó confirmada:`,
    '',
    ...formatReservationDetails(summary, timeZone),
    '',
    '⚠️ Una vez confirmada, no se puede modificar; solo puedes cancelarla.',
    'Para cancelar: escribe *cancelar mi cita*.',
  ].join('\n');

const formatReservationDetails = (
  summary: ReservationSummary,
  timeZone: string,
): string[] => [
  `• ✂️ Servicio: ${summary.service.name}`,
  `• 📅 Fecha: ${formatBusinessDate(summary.startsAt, timeZone)}`,
  `• 🕒 Hora: ${formatBusinessTime(summary.startsAt, timeZone)}`,
  `• 👤 Nombre: ${summary.customerName}`,
  `• ⏱️ Duración: ${formatDuration(summary.service.durationMinutes)}`,
  `• 💰 Precio: ${formatPrice(summary.service.price)}`,
];

export const formatFinalConfirmationPrompt = (
  summary: ReservationSummary,
  timeZone: string,
): string =>
  [
    '📝 *Verifica por última vez los datos de tu cita*',
    '',
    ...formatReservationDetails(summary, timeZone),
    '',
    '⚠️ Una vez confirmada, no se podrá modificar; solo podrás cancelarla.',
    '',
    '¿La confirmamos? Responde *Sí, confirmar*, *Cambiar algún dato* o *Cancelar*.',
  ].join('\n');

export const CONFIRMATION_OPTIONS =
  'Responde *Sí, confirmar*, *Cambiar algún dato* o *Cancelar*.';

// Catálogo activo en el mismo orden que la lista numerada del prompt.
export const getSelectableServices = (
  business?: ConfiguracionNegocio,
): ConfiguracionNegocio['services'] =>
  business?.services
    .filter((service) => service.active)
    .slice(0, MAX_NUMBERED_OPTIONS) ?? [];

export const getFieldPrompt = (
  field: ReservationProgressField,
  business?: ConfiguracionNegocio,
): string => {
  if (field === 'serviceId') {
    const services = getSelectableServices(business);
    return [
      '✂️ ¿Qué servicio deseas agendar?',
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
      'También puedes escribir el nombre del servicio o preguntar «¿qué servicios tienen?» para ver precios.',
    ].join('\n');
  }
  if (field === 'requestedDate') {
    return '📅 ¿Para qué fecha deseas la cita? Ej.: mañana o viernes.';
  }
  if (field === 'requestedTime') {
    return '🕒 ¿A qué hora deseas la cita? Ej.: 3 pm o 15:00.';
  }
  return '👤 ¿A nombre de quién agendamos la cita? Puedes responder solo con tu nombre.';
};

export const getUnrecognizedFieldReply = (
  field: ReservationProgressField,
  data: ReservationData,
  business: ConfiguracionNegocio,
): string => {
  const explain =
    field === 'serviceId'
      ? 'Me falta identificar el servicio exacto.'
      : field === 'requestedDate'
        ? 'Me falta una fecha válida para la cita.'
        : field === 'requestedTime'
          ? data.ambiguousTime
            ? 'Entendí la hora, pero falta aclarar si es mañana o tarde.'
            : 'Me falta una hora válida para la cita.'
          : 'Me falta el nombre para registrar la cita.';

  const serviceName = data.serviceId
    ? business.services.find((service) => service.id === data.serviceId)?.name
    : undefined;
  const knownData = [
    data.serviceId
      ? `✂️ Servicio: ya registrado${serviceName ? ` (${serviceName})` : ''}`
      : undefined,
    data.requestedDate
      ? `📅 Fecha: ${formatCalendarDate(data.requestedDate)}`
      : undefined,
    data.requestedTime ? `🕒 Hora: ${data.requestedTime}` : undefined,
    data.customerName ? `👤 Nombre: ${data.customerName}` : undefined,
  ].filter((value): value is string => value !== undefined);

  return [
    '😅 No logré reconocer ese dato.',
    explain,
    ...(knownData.length > 0
      ? [`✅ Conservo estos datos válidos: ${knownData.join(' · ')}`]
      : []),
    getPromptForData(field, data, business),
  ].join('\n');
};

const getTimeClarificationPrompt = (
  ambiguousTime: NonNullable<ReservationData['ambiguousTime']>,
): string => {
  const minutes =
    ambiguousTime.minute > 0
      ? `:${String(ambiguousTime.minute).padStart(2, '0')}`
      : '';
  return `¿Las ${ambiguousTime.hour}${minutes} son de la mañana o de la tarde?`;
};

// Mientras haya una hora ambigua se pide el periodo en lugar de la hora.
export const getPromptForData = (
  field: ReservationProgressField,
  data: ReservationData,
  business: ConfiguracionNegocio,
): string =>
  field === 'requestedTime' && data.ambiguousTime
    ? getTimeClarificationPrompt(data.ambiguousTime)
    : getFieldPrompt(field, business);

type TimePeriod = NonNullable<ReservationData['requestedTimeOfDay']>;

const TIME_PERIODS: readonly TimePeriod[] = [
  'morning',
  'afternoon',
  'evening',
];

const TIME_PERIOD_LABELS: Record<TimePeriod, string> = {
  morning: 'la mañana',
  afternoon: 'la tarde',
  evening: 'la noche',
};

const getTimePeriod = (
  start: Date,
  business: ConfiguracionNegocio,
): TimePeriod => {
  const minutes = getLocalTimeMinutes(start, business.timezone);
  if (minutes < 12 * 60) return 'morning';
  if (minutes < 18 * 60) return 'afternoon';
  return 'evening';
};

const formatPeriodList = (periods: readonly TimePeriod[]): string => {
  const labels = periods.map((period) => TIME_PERIOD_LABELS[period]);
  if (labels.length < 2) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
};

const PERIOD_DISPLAY_NAMES: Record<TimePeriod, string> = {
  morning: '🌅 Mañana',
  afternoon: '🌤️ Tarde',
  evening: '🌙 Noche',
};

const formatNumberedPeriodOptions = (
  starts: readonly Date[],
  business: ConfiguracionNegocio,
): string[] => {
  const lines: string[] = [];
  let number = 0;

  for (const period of TIME_PERIODS) {
    const periodStarts = starts.filter(
      (start) => getTimePeriod(start, business) === period,
    );
    if (periodStarts.length === 0) continue;

    lines.push(PERIOD_DISPLAY_NAMES[period]);
    for (const start of periodStarts) {
      number += 1;
      lines.push(`${number}. ${formatBusinessTime(start, business.timezone)}`);
    }
  }

  return lines;
};

export interface AvailabilityOptionsReply {
  reply: string;
  // Instantes ofrecidos, en el mismo orden que los números del texto.
  options: Date[];
}

export const getAvailabilityReply = (
  availableStarts: readonly Date[],
  business: ConfiguracionNegocio,
  requestedPeriod?: TimePeriod,
): AvailabilityOptionsReply => {
  const periodsWithAvailability = TIME_PERIODS.filter((period) =>
    availableStarts.some(
      (start) => getTimePeriod(start, business) === period,
    ),
  );

  const withOptions = (
    headerLines: readonly string[],
    starts: readonly Date[],
  ): AvailabilityOptionsReply => {
    const options = starts.slice(0, MAX_NUMBERED_OPTIONS);
    const remaining =
      starts.length > MAX_NUMBERED_OPTIONS
        ? [
            '…y más horarios disponibles; dime una hora concreta o el periodo que prefieras.',
          ]
        : [];

    return {
      reply: [
        ...headerLines,
        ...formatNumberedPeriodOptions(options, business),
        ...remaining,
        `🕒 ${OPTION_SELECTION_INSTRUCTION}`,
      ].join('\n'),
      options,
    };
  };

  if (requestedPeriod) {
    const requestedStarts = availableStarts.filter(
      (start) => getTimePeriod(start, business) === requestedPeriod,
    );

    if (requestedStarts.length > 0) {
      return withOptions(
        [`✅ Hay disponibilidad en ${TIME_PERIOD_LABELS[requestedPeriod]}:`],
        requestedStarts,
      );
    }

    const otherPeriods = periodsWithAvailability.filter(
      (period) => period !== requestedPeriod,
    );
    if (otherPeriods.length === 0) {
      return {
        reply: `No encontré horarios disponibles para ese día. ${getFieldPrompt('requestedDate', business)}`,
        options: [],
      };
    }

    return withOptions(
      [
        `⚠️ No hay disponibilidad en ${TIME_PERIOD_LABELS[requestedPeriod]}.`,
        `Sí hay en ${formatPeriodList(otherPeriods)}:`,
      ],
      availableStarts.filter((start) =>
        otherPeriods.includes(getTimePeriod(start, business)),
      ),
    );
  }

  return withOptions(
    [
      `✅ Encontré disponibilidad en ${formatPeriodList(periodsWithAvailability)}:`,
    ],
    availableStarts,
  );
};

type InvalidReservationSchedule = Extract<
  ReservationScheduleResult,
  { status: 'invalid' }
>;

export const getScheduleRejectionReply = (
  issue: InvalidReservationSchedule,
  business: ConfiguracionNegocio,
  data: ReservationData,
): string => {
  const maxDaysAhead =
    business.bookingPolicy?.maxDaysAhead ?? MAX_BOOKING_DAYS_AHEAD;
  const requestedTime =
    issue.requestedStartsAt !== undefined
      ? formatBusinessTime(issue.requestedStartsAt, business.timezone)
      : data.requestedTime;
  let reason: string;

  switch (issue.reason) {
    case 'not-found':
    case 'inactive':
      reason = 'El servicio indicado ya no está disponible.';
      break;
    case 'invalid-service-duration':
      reason =
        'No puedo validar la duración del servicio elegido. Elige otro servicio.';
      break;
    case 'invalid-date':
      reason = 'La fecha indicada no es válida.';
      break;
    case 'invalid-time':
      reason = 'La hora indicada no es válida.';
      break;
    case 'past-date':
      reason = 'Esa fecha ya pasó.';
      break;
    case 'out-of-window':
      reason = `Solo puedo agendar dentro de los próximos ${maxDaysAhead} días.`;
      break;
    case 'closed-day':
      reason = 'El negocio no atiende ese día.';
      break;
    case 'exceptional-closure':
      reason = 'Ese día el negocio está cerrado por una excepción.';
      break;
    case 'outside-hours':
      reason =
        issue.service !== undefined
          ? `El servicio de ${issue.service.durationMinutes} minutos no cabe en el horario de atención para esa hora.`
          : 'Esa hora queda fuera del horario de atención.';
      break;
    case 'insufficient-notice':
      reason = 'Esa hora no cumple la anticipación mínima para reservar.';
      break;
    case 'past-time':
      reason =
        'Esa hora ya pasó para la fecha que elegiste. No moveré la cita a otro día automáticamente; indícame una hora futura o una nueva fecha y hora.';
      break;
    case 'misaligned-start':
      reason = [
        `La hora de las ${requestedTime ?? 'indicada'} no está alineada con los bloques de la agenda.`,
      ].join(' ');
      break;
    case 'overlaps-existing-appointment':
      reason = 'Ese horario ya está ocupado.';
      break;
    case 'invalid-existing-appointment':
      reason = 'No pude validar los horarios ya ocupados.';
      break;
    case 'invalid-configuration':
      reason =
        issue.field === 'serviceId'
          ? 'La configuración del servicio elegido no es válida.'
          : 'La agenda del negocio no está configurada correctamente y no puedo validar esta solicitud.';
      break;
  }

  const nextStep = getNextStepForSchedule(issue, business);
  const hasAlternatives = Boolean(issue.alternatives?.length);
  return [
    `⚠️ ${reason}`,
    ...(nextStep ? [`ℹ️ ${nextStep}`] : []),
    `👉 ${
      hasAlternatives
        ? 'Indícame cuál prefieres y volveré a comprobar que siga disponible.'
        : getFieldPrompt(issue.field, business)
    }`,
  ].join('\n');
};

export const getUnexpectedConfirmationReply = (
  intent: ConversationIntent,
): string => {
  if (intent === 'thanks') {
    return [
      '😊 Con gusto. Tu solicitud sigue pendiente; aún no se creó la cita.',
      '',
      CONFIRMATION_OPTIONS,
    ].join('\n');
  }

  if (intent === 'greeting') {
    return [
      '👋 Hola. Tu solicitud sigue pendiente; aún no se creó la cita.',
      '',
      CONFIRMATION_OPTIONS,
    ].join('\n');
  }

  return [
    '🤔 No entendí tu respuesta. La solicitud sigue pendiente; aún no se creó la cita.',
    '',
    CONFIRMATION_OPTIONS,
  ].join('\n');
};
