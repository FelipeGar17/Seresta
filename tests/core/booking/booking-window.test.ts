import { describe, expect, it } from 'vitest';
import {
  checkBookingDate,
  checkBookingInstant,
  isBookingDateAllowed,
  isBookingInstantAllowed,
  MAX_BOOKING_DAYS_AHEAD,
} from '../../../src/core/booking/booking-date-policy.js';
import { parseRelativeDate } from '../../../src/core/nlp/date-parser.js';
import {
  combineDateAndTime,
  getBusinessDateOnly,
} from '../../../src/core/time/business-time.js';

// Mediodía del miércoles 2026-10-14 en America/Bogota.
const now = new Date('2026-10-14T12:00:00.000-05:00');

const WEEKDAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
];

describe('coherencia entre el parser de fechas y la política de reservas', () => {
  it('toda fecha de un día de la semana cae dentro de la ventana de reserva', () => {
    for (const weekday of WEEKDAY_NAMES) {
      const date = parseRelativeDate(`el ${weekday}`, { now });

      expect(date, weekday).toBeDefined();
      expect(isBookingDateAllowed(date!, { now }), weekday).toBe(true);
    }
  });

  it('la ventana por defecto cubre seis días más el día de hoy', () => {
    expect(MAX_BOOKING_DAYS_AHEAD).toBe(6);
    expect(isBookingDateAllowed(new Date('2026-10-20T00:00:00.000Z'), { now })).toBe(
      true,
    );
    expect(isBookingDateAllowed(new Date('2026-10-21T00:00:00.000Z'), { now })).toBe(
      false,
    );
  });

  it('"el próximo <día>" pedido el mismo día queda fuera de la ventana', () => {
    // Es el único caso que el parser puede producir fuera de la ventana:
    // el validador deberá explicarle al cliente que no se puede reservar.
    const date = parseRelativeDate('el próximo miércoles', { now });

    expect(date).toEqual(new Date('2026-10-21T00:00:00.000Z'));
    expect(isBookingDateAllowed(date!, { now })).toBe(false);
  });

  it('la ventana puede ampliarse por configuración del negocio', () => {
    const date = parseRelativeDate('el próximo miércoles', { now });

    expect(isBookingDateAllowed(date!, { now, maxDaysAhead: 7 })).toBe(true);
  });
});

describe('construcción del instante de la cita', () => {
  it('la fecha del parser y la hora del negocio forman el día correcto', () => {
    const date = parseRelativeDate('mañana', { now })!;
    const startsAt = combineDateAndTime(date, '15:00', 'America/Bogota')!;

    expect(startsAt.toISOString()).toBe('2026-10-15T20:00:00.000Z');
    expect(getBusinessDateOnly(startsAt, 'America/Bogota')).toEqual(date);
  });

  it('la hora de cierre del día anterior no salta al día siguiente', () => {
    const date = parseRelativeDate('hoy', { now })!;
    const startsAt = combineDateAndTime(date, '23:00', 'America/Bogota')!;

    expect(startsAt.toISOString()).toBe('2026-10-15T04:00:00.000Z');
    expect(getBusinessDateOnly(startsAt, 'America/Bogota')).toEqual(date);
  });
});

describe('motivos de rechazo de la política de fechas', () => {
  it('explica que la fecha ya pasó', () => {
    expect(
      checkBookingDate(new Date('2026-10-13T00:00:00.000Z'), { now }),
    ).toEqual({
      valid: false,
      reason: 'past-date',
      value: new Date('2026-10-13T00:00:00.000Z'),
    });
  });

  it('explica que la fecha está fuera de la ventana', () => {
    const result = checkBookingDate(new Date('2026-10-21T00:00:00.000Z'), {
      now,
    });

    expect(result.valid).toBe(false);
    expect(result).toMatchObject({ reason: 'out-of-window' });
  });

  it('rechaza una fecha inválida', () => {
    expect(
      checkBookingDate(new Date('invalida'), { now }),
    ).toEqual({ valid: false, reason: 'invalid-date' });
  });

  it('rechaza una ventana mal configurada', () => {
    expect(
      checkBookingDate(new Date('2026-10-14T00:00:00.000Z'), {
        now,
        maxDaysAhead: -1,
      }),
    ).toEqual({ valid: false, reason: 'invalid-configuration' });
  });

  it('el "próximo <mismo día>" se puede explicar al cliente', () => {
    const date = parseRelativeDate('el próximo miércoles', { now })!;

    expect(checkBookingDate(date, { now })).toMatchObject({
      valid: false,
      reason: 'out-of-window',
    });
  });
});

describe('la política acepta instantes sin confundirlos con fechas', () => {
  it('un instante se compara con el día local del negocio', () => {
    // 19/10 21:00 en Bogotá: el día UTC es 20/10, el día del negocio 19/10.
    const instant = new Date('2026-10-20T02:00:00.000Z');
    const reference = new Date('2026-10-13T12:00:00.000-05:00');

    expect(checkBookingInstant(instant, { now: reference }).valid).toBe(true);
    expect(isBookingInstantAllowed(instant, { now: reference })).toBe(true);
  });

  it('un instante fuera de la ventana se rechaza', () => {
    // 21/10 07:00 en Bogotá: el día del negocio es 21/10 y la ventana
    // termina el 20/10.
    const instant = new Date('2026-10-21T12:00:00.000Z');

    expect(isBookingInstantAllowed(instant, { now })).toBe(false);
  });

  it('la cita construida por el motor pasa la comprobación', () => {
    const date = parseRelativeDate('mañana', { now })!;
    const startsAt = combineDateAndTime(date, '15:00', 'America/Bogota')!;

    expect(checkBookingInstant(startsAt, { now }).valid).toBe(true);
  });
});
