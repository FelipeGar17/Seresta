const DEFAULT_TIME_ZONE = 'America/Bogota';
const MAX_BOOKING_DAYS_AHEAD = 6;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface BookingDatePolicyOptions {
  now?: Date;
  timeZone?: string;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const getLocalCalendarDate = (date: Date, timeZone: string): CalendarDate => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
};

// Las fechas producidas por date-parser representan un día calendario a medianoche UTC.
const getDateOnlyParts = (date: Date): CalendarDate => ({
  year: date.getUTCFullYear(),
  month: date.getUTCMonth() + 1,
  day: date.getUTCDate(),
});

const toUtcDateOnly = ({ year, month, day }: CalendarDate): Date =>
  new Date(Date.UTC(year, month - 1, day));

const isValidDate = (date: Date): boolean => !Number.isNaN(date.getTime());

/**
 * Comprueba si una fecha de reserva está entre hoy y los próximos seis días.
 *
 * `requestedDate` se interpreta como fecha calendario, igual que las fechas
 * devueltas por parseRelativeDate; `now` se convierte al día local del negocio.
 */
export function isBookingDateAllowed(
  requestedDate: Date,
  options: BookingDatePolicyOptions = {},
): boolean {
  if (!isValidDate(requestedDate)) return false;

  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const now = options.now ?? new Date();

  if (!isValidDate(now)) return false;

  const today = toUtcDateOnly(getLocalCalendarDate(now, timeZone));
  const requested = toUtcDateOnly(getDateOnlyParts(requestedDate));
  const latestAllowed = new Date(
    today.getTime() + MAX_BOOKING_DAYS_AHEAD * MILLISECONDS_PER_DAY,
  );

  return requested >= today && requested <= latestAllowed;
}

export { DEFAULT_TIME_ZONE, MAX_BOOKING_DAYS_AHEAD };
