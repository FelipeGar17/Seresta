import { describe, expect, it } from 'vitest';
import {
  isBookingDateAllowed,
} from '../../../src/core/booking/booking-date-policy.js';

const dateOnly = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

describe('isBookingDateAllowed', () => {
  it('permite reservar para hoy según la fecha local del negocio', () => {
    const now = new Date('2026-10-15T23:30:00.000Z');

    expect(
      isBookingDateAllowed(dateOnly('2026-10-15'), {
        now,
        timeZone: 'America/Bogota',
      }),
    ).toBe(true);
  });

  it('permite reservar hasta seis días después de hoy', () => {
    expect(
      isBookingDateAllowed(dateOnly('2026-10-21'), {
        now: new Date('2026-10-15T22:00:00.000-05:00'),
      }),
    ).toBe(true);
  });

  it('rechaza una fecha siete días posterior a hoy', () => {
    expect(
      isBookingDateAllowed(dateOnly('2026-10-22'), {
        now: new Date('2026-10-15T22:00:00.000-05:00'),
      }),
    ).toBe(false);
  });

  it('rechaza una fecha anterior a hoy', () => {
    expect(
      isBookingDateAllowed(dateOnly('2026-10-14'), {
        now: new Date('2026-10-15T22:00:00.000-05:00'),
      }),
    ).toBe(false);
  });

  it('compara correctamente al cambiar de mes', () => {
    const now = new Date('2026-01-30T10:00:00.000-05:00');

    expect(isBookingDateAllowed(dateOnly('2026-02-05'), { now })).toBe(true);
    expect(isBookingDateAllowed(dateOnly('2026-02-06'), { now })).toBe(false);
  });

  it('usa el día local correcto cuando cambia la fecha UTC', () => {
    const now = new Date('2026-10-16T04:30:00.000Z');

    expect(isBookingDateAllowed(dateOnly('2026-10-15'), { now })).toBe(true);
    expect(isBookingDateAllowed(dateOnly('2026-10-16'), { now })).toBe(true);
  });

  it('rechaza fechas inválidas', () => {
    expect(
      isBookingDateAllowed(new Date('invalid'), {
        now: new Date('2026-10-15T22:00:00.000-05:00'),
      }),
    ).toBe(false);
  });
});
