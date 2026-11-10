import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIME_ZONE,
  addDays,
  combineDateAndTime,
  formatBusinessDate,
  formatCalendarDate,
  getBusinessDateOnly,
  getDateOnly,
  getLocalCalendarDate,
  getTimeZoneOffsetMs,
  getWeekdayIndex,
  getWeekdayOfDateOnly,
  parseTimeToMinutes,
  toUtcDateOnly,
} from '../../../src/core/time/business-time.js';

const dateOnly = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

describe('getLocalCalendarDate', () => {
  it('returns the calendar day of the business timezone', () => {
    // 2026-10-16T02:00:00Z todavía es 2026-10-15 en Bogota.
    expect(
      getLocalCalendarDate(new Date('2026-10-16T02:00:00.000Z'), 'America/Bogota'),
    ).toEqual({ year: 2026, month: 10, day: 15 });
  });

  it('returns the same day in UTC', () => {
    expect(
      getLocalCalendarDate(new Date('2026-10-16T02:00:00.000Z'), 'UTC'),
    ).toEqual({ year: 2026, month: 10, day: 16 });
  });

  it('fails clearly with an invalid timezone', () => {
    expect(() =>
      getLocalCalendarDate(new Date(), 'No/Existe'),
    ).toThrowError(/Zona horaria inválida/);
  });
});

describe('getBusinessDateOnly', () => {
  it('reduces an instant to the midnight of its business day', () => {
    expect(
      getBusinessDateOnly(
        new Date('2026-10-16T02:00:00.000Z'),
        'America/Bogota',
      ),
    ).toEqual(dateOnly('2026-10-15'));
  });

  it('uses Bogota by default', () => {
    expect(getBusinessDateOnly(new Date('2026-10-16T02:00:00.000Z'))).toEqual(
      dateOnly('2026-10-15'),
    );
    expect(DEFAULT_TIME_ZONE).toBe('America/Bogota');
  });
});

describe('formatCalendarDate', () => {
  it('no desplaza la fecha calendario en zonas UTC negativas', () => {
    // Medianoche UTC del jueves 15; formatearla en Bogota daría miércoles 14.
    expect(formatCalendarDate(dateOnly('2026-10-15'))).toBe(
      'jueves, 15 de octubre de 2026',
    );
    expect(formatBusinessDate(dateOnly('2026-10-15'), 'America/Bogota')).toBe(
      'miércoles, 14 de octubre de 2026',
    );
  });
});

describe('date helpers', () => {
  it('converts a calendar date to its UTC midnight', () => {
    expect(toUtcDateOnly({ year: 2026, month: 10, day: 19 })).toEqual(
      dateOnly('2026-10-19'),
    );
  });

  it('reduces a date to the midnight of its UTC day', () => {
    expect(getDateOnly(new Date('2026-10-19T18:30:00.000Z'))).toEqual(
      dateOnly('2026-10-19'),
    );
  });

  it('adds calendar days', () => {
    expect(addDays(dateOnly('2026-10-19'), 1)).toEqual(dateOnly('2026-10-20'));
    expect(addDays(dateOnly('2026-10-19'), -1)).toEqual(dateOnly('2026-10-18'));
  });

  it('exposes the weekday of a calendar date', () => {
    expect(getWeekdayOfDateOnly(dateOnly('2026-10-19'))).toBe('monday');
    expect(getWeekdayOfDateOnly(dateOnly('2026-10-18'))).toBe('sunday');
    expect(getWeekdayIndex('monday')).toBe(1);
    expect(getWeekdayIndex('sunday')).toBe(0);
  });
});

describe('parseTimeToMinutes', () => {
  it('converts valid times', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('09:30')).toBe(570);
    expect(parseTimeToMinutes('15:00')).toBe(900);
    expect(parseTimeToMinutes('23:59')).toBe(1439);
  });

  it('rejects invalid times', () => {
    expect(parseTimeToMinutes('24:00')).toBeUndefined();
    expect(parseTimeToMinutes('12:60')).toBeUndefined();
    expect(parseTimeToMinutes('9:00')).toBeUndefined();
    expect(parseTimeToMinutes('noche')).toBeUndefined();
    expect(parseTimeToMinutes('')).toBeUndefined();
  });
});

describe('getTimeZoneOffsetMs', () => {
  it('reports the offset of Bogota', () => {
    expect(
      getTimeZoneOffsetMs(new Date('2026-10-16T12:00:00.000Z'), 'America/Bogota'),
    ).toBe(-5 * 60 * 60 * 1000);
  });

  it('reports no offset in UTC', () => {
    expect(
      getTimeZoneOffsetMs(new Date('2026-10-16T12:00:00.000Z'), 'UTC'),
    ).toBe(0);
  });
});

describe('combineDateAndTime', () => {
  it('builds the instant of a business wall-clock time', () => {
    expect(
      combineDateAndTime(
        dateOnly('2026-10-16'),
        '15:00',
        'America/Bogota',
      )?.toISOString(),
    ).toBe('2026-10-16T20:00:00.000Z');
  });

  it('handles midnight and the start of the day', () => {
    expect(
      combineDateAndTime(dateOnly('2026-10-16'), '00:00', 'America/Bogota')?.toISOString(),
    ).toBe('2026-10-16T05:00:00.000Z');
    expect(
      combineDateAndTime(dateOnly('2026-10-16'), '09:00', 'America/Bogota')?.toISOString(),
    ).toBe('2026-10-16T14:00:00.000Z');
  });

  it('uses Bogota by default', () => {
    expect(combineDateAndTime(dateOnly('2026-10-16'), '15:00')?.toISOString()).toBe(
      '2026-10-16T20:00:00.000Z',
    );
  });

  it('keeps the same business day when read back', () => {
    const startsAt = combineDateAndTime(
      dateOnly('2026-10-16'),
      '20:30',
      'America/Bogota',
    );

    expect(startsAt).toBeDefined();
    expect(getBusinessDateOnly(startsAt!, 'America/Bogota')).toEqual(
      dateOnly('2026-10-16'),
    );
  });

  it('returns undefined for an invalid time', () => {
    expect(
      combineDateAndTime(dateOnly('2026-10-16'), '25:00', 'America/Bogota'),
    ).toBeUndefined();
  });
});
