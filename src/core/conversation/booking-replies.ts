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
  getWeekdayOfDateOnly,
} from '../time/business-time.js';
import { MAX_BOOKING_DAYS_AHEAD } from '../booking/booking-date-policy.js';
import { formatBusinessDate, formatBusinessTime } from '../time/business-time.js';
import {
  formatDuration,
  formatPrice,
  type ReservationSummary,
} from '../booking/reservation-summary.js';
import type { ReservationProgressField } from './reservation-progress.js';
import type { ReservationScheduleResult } from './reservation-schedule.js';

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
    `¡Gracias por confirmar, ${summary.customerName}! Tu cita quedó confirmada:`,
    '',
    ...formatReservationDetails(summary, timeZone),
    '',
    'Una vez confirmada, no se puede modificar; solo puedes cancelarla.',
    'Si necesitas cancelarla, escribe «cancelar mi cita».',
    '',
    'Para cerrar la conversación, puedes responder «gracias», «allá estaré» o «listo».',
  ].join('\n');

const formatReservationDetails = (
  summary: ReservationSummary,
  timeZone: string,
): string[] => [
  `• Servicio: ${summary.service.name}`,
  `• Fecha: ${formatBusinessDate(summary.startsAt, timeZone)}`,
  `• Hora: ${formatBusinessTime(summary.startsAt, timeZone)}`,
  `• Nombre: ${summary.customerName}`,
  `• Duración: ${formatDuration(summary.service.durationMinutes)}`,
  `• Precio: ${formatPrice(summary.service.price)}`,
];

export const formatFinalConfirmationPrompt = (
  summary: ReservationSummary,
  timeZone: string,
): string =>
  [
    '*Verifica por última vez los datos de tu cita*',
    '',
    ...formatReservationDetails(summary, timeZone),
    '',
    'Antes de confirmarla: una vez creada no se podrá modificar; solo podrás cancelarla.',
    '',
    '¿Confirmas que agendemos esta cita?',
    'Responde *Sí, confirmar*, *Cambiar algún dato* o *Cancelar*.',
  ].join('\n');

export const CONFIRMATION_OPTIONS = [
  'Responde:',
  '• *Sí, confirmar*',
  '• *Cambiar algún dato*',
  '• *Cancelar*',
].join('\n');

export const getFieldPrompt = (
  field: ReservationProgressField,
  business?: ConfiguracionNegocio,
): string => {
  if (field === 'serviceId') {
    const services =
      business?.services
        .filter((service) => service.active)
        .map((service) => `• ${service.name}`) ?? [];
    return [
      '¿Qué servicio deseas agendar?',
      ...(services.length > 0
        ? ['', 'Puedes elegir uno de estos servicios:', ...services]
        : []),
      '',
      'Escribe el nombre del servicio. Si quieres ver opciones o precios, pregunta «¿qué servicios tienen?» o «¿cuánto cuesta?».',
    ].join('\n');
  }
  if (field === 'requestedDate') {
    return '¿Para qué fecha deseas la cita? Por ejemplo: mañana o el viernes.';
  }
  if (field === 'requestedTime') {
    return '¿A qué hora deseas la cita? Puedes decir, por ejemplo, 3 pm o 15:00.';
  }
  return '¿A nombre de quién agendamos la cita? Puedes responder solo con tu nombre.';
};

export const getUnrecognizedFieldReply = (
  field: ReservationProgressField,
  data: ReservationData,
  business: ConfiguracionNegocio,
): string =>
  [
    'No logré reconocer ese dato en tu mensaje.',
    getPromptForData(field, data, business),
  ].join('\n');

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
  return [
    reason,
    ...(nextStep ? [nextStep] : []),
    '',
    getFieldPrompt(issue.field, business),
  ].join('\n');
};

export const getUnexpectedConfirmationReply = (
  intent: ConversationIntent,
): string => {
  if (intent === 'thanks') {
    return [
      'Con gusto. Tu solicitud de reserva sigue pendiente y no se ha creado ninguna cita.',
      '',
      CONFIRMATION_OPTIONS,
    ].join('\n');
  }

  if (intent === 'greeting') {
    return [
      'Hola. Tu solicitud de reserva sigue pendiente de confirmación y no se ha creado ninguna cita.',
      '',
      CONFIRMATION_OPTIONS,
    ].join('\n');
  }

  return [
    'No interpreté tu mensaje como una confirmación. La solicitud sigue pendiente y no se ha creado ninguna cita.',
    '',
    CONFIRMATION_OPTIONS,
  ].join('\n');
};
