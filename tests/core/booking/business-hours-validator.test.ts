import { describe, expect, it } from 'vitest';
import type { ConfiguracionNegocio, Service } from '../../../src/core/types.js';
import { validateBusinessHours } from '../../../src/core/booking/business-hours-validator.js';
import { combineDateAndTime } from '../../../src/core/time/business-time.js';

const dateOnly = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const service: Service = {
  id: 'service-1',
  businessId: 'business-1',
  name: 'Consulta',
  price: 10,
  durationMinutes: 60,
  active: true,
};

const business: ConfiguracionNegocio = {
  businessId: 'business-1',
  name: 'Negocio',
  timezone: 'America/Bogota',
  whatsappNumber: '+573000000000',
  googleCalendarId: 'calendar-1',
  services: [service],
  businessHours: {
    monday: [
      { opensAt: '08:00', closesAt: '12:00' },
      { opensAt: '14:00', closesAt: '18:00' },
    ],
    tuesday: [{ opensAt: '09:00', closesAt: '17:00' }],
  },
  bookingPolicy: {
    minimumNoticeMinutes: 60,
    maxDaysAhead: 10,
  },
};

const startsAt = (date: string, time: string): Date =>
  combineDateAndTime(dateOnly(date), time, business.timezone)!;

const validate = (
  date: string,
  time: string,
  durationMinutes = 60,
  now = new Date('2026-10-18T12:00:00.000-05:00'),
) =>
  validateBusinessHours(business, {
    startsAt: startsAt(date, time),
    durationMinutes,
    now,
  });

describe('validateBusinessHours', () => {
  it('acepta una reserva contenida en una franja', () => {
    expect(validate('2026-10-19', '10:00')).toMatchObject({ valid: true });
  });

  it('acepta una reserva que termina exactamente al cierre', () => {
    expect(validate('2026-10-19', '17:00')).toMatchObject({ valid: true });
  });

  it('rechaza una reserva que empieza al cierre o cruza el cierre', () => {
    expect(validate('2026-10-19', '18:00')).toMatchObject({
      valid: false,
      reason: 'outside-hours',
    });
    expect(validate('2026-10-19', '17:30')).toMatchObject({
      valid: false,
      reason: 'outside-hours',
    });
  });

  it('rechaza una reserva dentro de una pausa y acepta la segunda franja', () => {
    expect(validate('2026-10-19', '12:00')).toMatchObject({
      valid: false,
      reason: 'outside-hours',
    });
    expect(validate('2026-10-19', '14:00')).toMatchObject({ valid: true });
  });

  it('rechaza un día cerrado', () => {
    expect(validate('2026-10-21', '10:00')).toMatchObject({
      valid: false,
      reason: 'closed-day',
    });
  });

  it('rechaza un cierre excepcional', () => {
    const result = validateBusinessHours(
      { ...business, closures: [{ date: '2026-10-19', reason: 'festivo' }] },
      {
        startsAt: startsAt('2026-10-19', '10:00'),
        durationMinutes: 60,
        now: new Date('2026-10-18T12:00:00.000-05:00'),
      },
    );
    expect(result).toMatchObject({ valid: false, reason: 'exceptional-closure' });
  });

  it('acepta exactamente el límite de anticipación mínima', () => {
    const now = new Date('2026-10-19T13:00:00.000Z');
    expect(validate('2026-10-19', '09:00', 60, now)).toMatchObject({
      valid: true,
    });
  });

  it('rechaza un minuto antes de la anticipación mínima', () => {
    const now = new Date('2026-10-19T13:01:00.000Z');
    expect(validate('2026-10-19', '09:00', 60, now)).toMatchObject({
      valid: false,
      reason: 'insufficient-notice',
    });
  });

  it('rechaza una fecha fuera del horizonte usando la política existente', () => {
    const result = validate(
      '2026-10-30',
      '10:00',
      60,
      new Date('2026-10-19T12:00:00.000-05:00'),
    );
    expect(result).toMatchObject({ valid: false, reason: 'out-of-window' });
  });

  it.each([
    ['duración cero', 0],
    ['duración negativa', -1],
    ['duración no finita', Number.NaN],
  ])('rechaza %s', (_label, durationMinutes) => {
    expect(validate('2026-10-19', '10:00', durationMinutes)).toMatchObject({
      valid: false,
      reason: 'invalid-service-duration',
    });
  });

  it('rechaza horarios ausentes, inválidos y superpuestos', () => {
    expect(
      validateBusinessHours(
        { ...business, businessHours: undefined },
        { startsAt: startsAt('2026-10-19', '10:00'), durationMinutes: 60 },
      ),
    ).toMatchObject({ valid: false, reason: 'invalid-configuration' });

    expect(
      validateBusinessHours(
        {
          ...business,
          businessHours: {
            monday: [{ opensAt: '18:00', closesAt: '08:00' }],
          },
        },
        { startsAt: startsAt('2026-10-19', '10:00'), durationMinutes: 60 },
      ),
    ).toMatchObject({ valid: false, reason: 'invalid-configuration' });
  });

  it('devuelve el final calculado del servicio', () => {
    const result = validate('2026-10-19', '10:00');

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.endsAt.getTime() - result.value.startsAt.getTime()).toBe(
        60 * 60_000,
      );
    }
  });
});
