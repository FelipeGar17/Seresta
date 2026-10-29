import { describe, expect, it } from 'vitest';
import type { ConfiguracionNegocio } from '../../../src/core/types.js';
import {
  DEFAULT_APPOINTMENT_INTERVAL_MINUTES,
  doTimeIntervalsOverlap,
  getAppointmentIntervalMinutes,
  getAppointmentOccupancy,
  getBlockCount,
  getScheduleStartTimes,
  isStartAlignedWithSegment,
} from '../../../src/core/booking/appointment-schedule.js';
import {
  combineDateAndTime,
  getBusinessDateOnly,
} from '../../../src/core/time/business-time.js';

const dateOnly = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const business = (
  intervalMinutes = 30,
  opensAt = '09:00',
  closesAt = '18:00',
): ConfiguracionNegocio => ({
  businessId: 'business-1',
  name: 'Negocio',
  timezone: 'America/Bogota',
  whatsappNumber: '+573000000000',
  googleCalendarId: 'calendar-1',
  services: [],
  businessHours: {
    monday: [{ opensAt, closesAt }],
  },
  bookingPolicy: {
    appointmentIntervalMinutes: intervalMinutes,
  },
});

const at = (
  date: string,
  time: string,
  config = business(),
): Date => combineDateAndTime(dateOnly(date), time, config.timezone)!;

describe('intervalo de agenda', () => {
  it('usa 30 minutos cuando la política no lo declara', () => {
    const config = business();
    delete config.bookingPolicy;

    expect(DEFAULT_APPOINTMENT_INTERVAL_MINUTES).toBe(30);
    expect(getAppointmentIntervalMinutes(config)).toBe(30);
  });

  it('calcula los bloques ocupados sin cambiar la duración real', () => {
    const cases = [
      [30, 1, '15:30', '15:30'],
      [45, 2, '15:45', '16:00'],
      [60, 2, '16:00', '16:00'],
      [75, 3, '16:15', '16:30'],
    ] as const;

    for (const [duration, blocks, realEnd, occupiedEnd] of cases) {
      const startsAt = at('2026-10-19', '15:00');
      const occupancy = getAppointmentOccupancy(startsAt, duration, 30)!;

      expect(occupancy.blockCount, `${duration} minutos`).toBe(blocks);
      expect(occupancy.endsAt.toISOString()).toBe(
        at('2026-10-19', realEnd).toISOString(),
      );
      expect(occupancy.occupiedEndsAt.toISOString()).toBe(
        at('2026-10-19', occupiedEnd).toISOString(),
      );
    }
  });

  it('rechaza duraciones e intervalos inválidos', () => {
    expect(getBlockCount(0, 30)).toBeUndefined();
    expect(getBlockCount(30, 0)).toBeUndefined();
    expect(getAppointmentOccupancy(new Date('invalid'), 30, 30)).toBeUndefined();
  });

  it('detecta solapamientos solo cuando los intervalos se cruzan', () => {
    const first = {
      startsAt: at('2026-10-19', '15:00'),
      endsAt: at('2026-10-19', '15:30'),
    };
    const touching = {
      startsAt: at('2026-10-19', '15:30'),
      endsAt: at('2026-10-19', '16:00'),
    };
    const overlapping = {
      startsAt: at('2026-10-19', '15:15'),
      endsAt: at('2026-10-19', '15:45'),
    };

    expect(doTimeIntervalsOverlap(first, touching)).toBe(false);
    expect(doTimeIntervalsOverlap(first, overlapping)).toBe(true);
  });
});

describe('alineación con la apertura del negocio', () => {
  it('toma la apertura como origen, no la medianoche', () => {
    const config = business(30, '09:10', '12:00');

    expect(
      isStartAlignedWithSegment(9 * 60 + 10, { opensAt: 9 * 60 + 10, closesAt: 12 * 60 }, 30),
    ).toBe(true);
    expect(
      isStartAlignedWithSegment(9 * 60 + 40, { opensAt: 9 * 60 + 10, closesAt: 12 * 60 }, 30),
    ).toBe(true);
    expect(
      isStartAlignedWithSegment(9 * 60, { opensAt: 9 * 60 + 10, closesAt: 12 * 60 }, 30),
    ).toBe(false);
    expect(
      isStartAlignedWithSegment(10 * 60, { opensAt: 9 * 60 + 10, closesAt: 12 * 60 }, 30),
    ).toBe(false);

    expect(
      getScheduleStartTimes(config, dateOnly('2026-10-19'), 30).map((date) =>
        date.toISOString(),
      ),
    ).toEqual([
      at('2026-10-19', '09:10', config).toISOString(),
      at('2026-10-19', '09:40', config).toISOString(),
      at('2026-10-19', '10:10', config).toISOString(),
      at('2026-10-19', '10:40', config).toISOString(),
      at('2026-10-19', '11:10', config).toISOString(),
    ]);
  });

  it('genera inicios compatibles con 15 y 60 minutos', () => {
    const quarterHour = business(15, '09:00', '10:00');
    const hourly = business(60, '09:00', '11:00');

    expect(
      getScheduleStartTimes(quarterHour, dateOnly('2026-10-19'), 30).map(
        (date) => date.toISOString(),
      ),
    ).toEqual([
      at('2026-10-19', '09:00', quarterHour).toISOString(),
      at('2026-10-19', '09:15', quarterHour).toISOString(),
      at('2026-10-19', '09:30', quarterHour).toISOString(),
    ]);

    expect(
      getScheduleStartTimes(hourly, dateOnly('2026-10-19'), 60).map((date) =>
        date.toISOString(),
      ),
    ).toEqual([
      at('2026-10-19', '09:00', hourly).toISOString(),
      at('2026-10-19', '10:00', hourly).toISOString(),
    ]);
  });

  it('convierte las horas locales de Bogotá al instante UTC correcto', () => {
    const config = business(30, '15:00', '16:00');
    const [startsAt] = getScheduleStartTimes(
      config,
      dateOnly('2026-10-19'),
      30,
    );

    expect(startsAt.toISOString()).toBe('2026-10-19T20:00:00.000Z');
    expect(getBusinessDateOnly(startsAt, config.timezone)).toEqual(
      dateOnly('2026-10-19'),
    );
  });

  it('ancla cada franja a su propia apertura y respeta descansos', () => {
    const config: ConfiguracionNegocio = {
      ...business(30),
      businessHours: {
        monday: [
          { opensAt: '08:00', closesAt: '12:00' },
          { opensAt: '15:10', closesAt: '18:00' },
        ],
      },
    };

    expect(
      getScheduleStartTimes(config, dateOnly('2026-10-19'), 30).map((date) =>
        date.toISOString(),
      ),
    ).toEqual([
      '08:00',
      '08:30',
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '15:10',
      '15:40',
      '16:10',
      '16:40',
      '17:10',
    ].map((time) => at('2026-10-19', time, config).toISOString()));
  });
});
