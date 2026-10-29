import { describe, expect, it } from 'vitest';
import type {
  ConfiguracionNegocio,
  Service,
} from '../../../src/core/types.js';
import {
  validateAppointmentAvailability,
  type AppointmentAvailabilityInput,
} from '../../../src/core/booking/appointment-availability.js';
import { buildReservationSummary } from '../../../src/core/booking/reservation-summary.js';
import {
  combineDateAndTime,
  getBusinessDateOnly,
} from '../../../src/core/time/business-time.js';

const dateOnly = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const service = (
  durationMinutes = 45,
  id = 'service-1',
): Service => ({
  id,
  businessId: 'business-1',
  name: 'Servicio',
  price: 10,
  durationMinutes,
  active: true,
});

const business = (
  intervalMinutes = 30,
  overrides: Partial<ConfiguracionNegocio> = {},
): ConfiguracionNegocio => ({
  businessId: 'business-1',
  name: 'Negocio',
  timezone: 'America/Bogota',
  whatsappNumber: '+573000000000',
  googleCalendarId: 'calendar-1',
  services: [service()],
  businessHours: {
    monday: [{ opensAt: '15:00', closesAt: '18:00' }],
  },
  bookingPolicy: {
    appointmentIntervalMinutes: intervalMinutes,
  },
  ...overrides,
});

const now = new Date('2026-10-18T12:00:00.000-05:00');

const at = (
  date: string,
  time: string,
  config = business(),
): Date => combineDateAndTime(dateOnly(date), time, config.timezone)!;

const validate = (
  startsAt: Date,
  durationMinutes: number,
  config = business(),
  input: Omit<AppointmentAvailabilityInput, 'startsAt' | 'durationMinutes'> = {},
) =>
  validateAppointmentAvailability(config, {
    startsAt,
    durationMinutes,
    now,
    ...input,
  });

describe('disponibilidad con intervalo y bloques', () => {
  it('acepta un inicio alineado y calcula su ocupación', () => {
    const result = validate(at('2026-10-19', '15:00'), 30);

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    expect(result.value.startsAt.toISOString()).toBe(
      '2026-10-19T20:00:00.000Z',
    );
    expect(result.value.endsAt.toISOString()).toBe(
      '2026-10-19T20:30:00.000Z',
    );
    expect(result.value.occupiedEndsAt.toISOString()).toBe(
      '2026-10-19T20:30:00.000Z',
    );
    expect(result.value.blockCount).toBe(1);
    expect(result.value.intervalMinutes).toBe(30);
    expect(
      getBusinessDateOnly(result.value.startsAt, 'America/Bogota'),
    ).toEqual(dateOnly('2026-10-19'));
  });

  it('rechaza un inicio no alineado sin redondearlo', () => {
    const result = validate(at('2026-10-19', '15:45'), 30);

    expect(result).toMatchObject({
      valid: false,
      reason: 'misaligned-start',
    });
    expect(result.alternatives).toBeUndefined();
  });

  it.each([
    [30, 1, '15:30', '15:30'],
    [45, 2, '15:45', '16:00'],
    [60, 2, '16:00', '16:00'],
    [75, 3, '16:15', '16:30'],
  ])(
    'un servicio de %i minutos ocupa %i bloques de 30 minutos',
    (duration, blockCount, realEnd, occupiedEnd) => {
      const result = validate(at('2026-10-19', '15:00'), duration);

      expect(result.valid).toBe(true);
      if (!result.valid) return;

      expect(result.value.blockCount).toBe(blockCount);
      expect(result.value.endsAt.toISOString()).toBe(
        at('2026-10-19', realEnd).toISOString(),
      );
      expect(result.value.occupiedEndsAt.toISOString()).toBe(
        at('2026-10-19', occupiedEnd).toISOString(),
      );
    },
  );

  it('permite citas consecutivas en el límite exacto', () => {
    const result = validate(
      at('2026-10-19', '15:30'),
      30,
      business(),
      {
        existingAppointments: [
          { startsAt: at('2026-10-19', '15:00'), durationMinutes: 30 },
        ],
      },
    );

    expect(result).toMatchObject({ valid: true });
  });

  it('bloquea el inicio dentro del bloque parcial de 45 minutos', () => {
    const existingAppointments = [
      { startsAt: at('2026-10-19', '15:00'), durationMinutes: 45 },
    ];

    expect(
      validate(at('2026-10-19', '15:30'), 30, business(), {
        existingAppointments,
      }),
    ).toMatchObject({
      valid: false,
      reason: 'overlaps-existing-appointment',
    });

    expect(
      validate(at('2026-10-19', '16:00'), 30, business(), {
        existingAppointments,
      }),
    ).toMatchObject({ valid: true });
  });

  it('un servicio de 75 minutos bloquea hasta el siguiente bloque completo', () => {
    const existingAppointments = [
      { startsAt: at('2026-10-19', '15:00'), durationMinutes: 75 },
    ];

    expect(
      validate(at('2026-10-19', '16:00'), 30, business(), {
        existingAppointments,
      }),
    ).toMatchObject({
      valid: false,
      reason: 'overlaps-existing-appointment',
    });

    expect(
      validate(at('2026-10-19', '16:30'), 30, business(), {
        existingAppointments,
      }),
    ).toMatchObject({ valid: true });
  });

  it('rechaza una cita que invade un descanso o supera el cierre', () => {
    const config = business(30, {
      businessHours: {
        monday: [
          { opensAt: '08:00', closesAt: '12:00' },
          { opensAt: '14:00', closesAt: '18:00' },
        ],
      },
    });

    expect(validate(at('2026-10-19', '11:30', config), 45, config)).toMatchObject({
      valid: false,
      reason: 'outside-hours',
    });
    expect(validate(at('2026-10-19', '13:30', config), 30, config)).toMatchObject({
      valid: false,
      reason: 'outside-hours',
    });
    expect(validate(at('2026-10-19', '17:30', config), 60, config)).toMatchObject({
      valid: false,
      reason: 'outside-hours',
    });
    expect(validate(at('2026-10-19', '17:00', config), 60, config)).toMatchObject({
      valid: true,
    });
  });

  it('compatibiliza intervalos de 15 y 60 minutos', () => {
    const quarterHour = business(15);
    const hourly = business(60);

    expect(
      validate(at('2026-10-19', '15:15', quarterHour), 30, quarterHour),
    ).toMatchObject({ valid: true });
    expect(
      validate(at('2026-10-19', '15:20', quarterHour), 30, quarterHour),
    ).toMatchObject({ valid: false, reason: 'misaligned-start' });

    expect(
      validate(at('2026-10-19', '15:00', hourly), 60, hourly),
    ).toMatchObject({ valid: true });
    expect(
      validate(at('2026-10-19', '15:30', hourly), 30, hourly),
    ).toMatchObject({ valid: false, reason: 'misaligned-start' });
    expect(
      validate(at('2026-10-19', '16:00', hourly), 60, hourly),
    ).toMatchObject({ valid: true });
  });

  it('ancla el intervalo a la apertura real de cada negocio', () => {
    const config = business(30, {
      businessHours: {
        monday: [{ opensAt: '09:10', closesAt: '12:00' }],
      },
    });

    expect(
      validate(at('2026-10-19', '09:10', config), 30, config),
    ).toMatchObject({ valid: true });
    expect(
      validate(at('2026-10-19', '09:40', config), 30, config),
    ).toMatchObject({ valid: true });
    expect(
      validate(at('2026-10-19', '10:00', config), 30, config),
    ).toMatchObject({ valid: false, reason: 'misaligned-start' });
  });

  it('respeta anticipación mínima y horizonte máximo', () => {
    const config = business(30, {
      bookingPolicy: {
        appointmentIntervalMinutes: 30,
        minimumNoticeMinutes: 60,
        maxDaysAhead: 1,
      },
    });

    expect(
      validateAppointmentAvailability(config, {
        startsAt: at('2026-10-19', '15:00', config),
        durationMinutes: 30,
        now: new Date('2026-10-19T20:00:00.000Z'),
      }),
    ).toMatchObject({
      valid: false,
      reason: 'insufficient-notice',
    });

    expect(
      validateAppointmentAvailability(config, {
        startsAt: at('2026-10-21', '15:00', config),
        durationMinutes: 30,
        now: new Date('2026-10-19T15:00:00.000Z'),
      }),
    ).toMatchObject({
      valid: false,
      reason: 'out-of-window',
    });
  });

  it('ofrece alternativas solo con datos de disponibilidad conocidos', () => {
    const config = business();
    const existingAppointments = [
      { startsAt: at('2026-10-19', '15:00', config), durationMinutes: 30 },
      { startsAt: at('2026-10-19', '15:30', config), durationMinutes: 30 },
    ];

    const result = validate(
      at('2026-10-19', '15:45', config),
      30,
      config,
      { existingAppointments, maxAlternatives: 3 },
    );

    expect(result).toMatchObject({
      valid: false,
      reason: 'misaligned-start',
    });
    expect(result.alternatives?.map((date) => date.toISOString())).toEqual([
      at('2026-10-19', '16:00', config).toISOString(),
      at('2026-10-19', '16:30', config).toISOString(),
      at('2026-10-19', '17:00', config).toISOString(),
    ]);

    expect(
      validate(
        at('2026-10-19', '15:45', config),
        30,
        config,
      ).alternatives,
    ).toBeUndefined();
  });

  it('ofrece alternativas tras rechazar un solapamiento', () => {
    const config = business();
    const result = validate(
      at('2026-10-19', '15:30', config),
      30,
      config,
      {
        existingAppointments: [
          {
            startsAt: at('2026-10-19', '15:00', config),
            durationMinutes: 45,
          },
        ],
      },
    );

    expect(result).toMatchObject({
      valid: false,
      reason: 'overlaps-existing-appointment',
    });
    expect(result.alternatives?.[0].toISOString()).toBe(
      at('2026-10-19', '16:00', config).toISOString(),
    );
  });

  it('no altera el resumen canónico ni el final real del servicio', () => {
    const config = business(30, { services: [service(45)] });
    const summary = buildReservationSummary(config, {
      serviceId: 'service-1',
      requestedDate: dateOnly('2026-10-19'),
      requestedTime: '15:00',
      customerName: 'Ana',
    });

    const availability = validate(
      at('2026-10-19', '15:00', config),
      45,
      config,
    );

    expect(summary?.endsAt.toISOString()).toBe(
      '2026-10-19T20:45:00.000Z',
    );
    expect(availability.valid).toBe(true);
    if (availability.valid) {
      expect(availability.value.endsAt.toISOString()).toBe(
        '2026-10-19T20:45:00.000Z',
      );
      expect(availability.value.occupiedEndsAt.toISOString()).toBe(
        '2026-10-19T21:00:00.000Z',
      );
    }
  });
});
