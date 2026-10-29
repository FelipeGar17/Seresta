import { describe, expect, it } from 'vitest';
import {
  extractEntities,
  resolveAmbiguousTime,
} from '../../../src/core/nlp/entity-extractor.js';

const now = new Date('2026-10-15T15:00:00.000Z');

describe('horas ambiguas', () => {
  it.each([
    ['a las 4', 4, 0],
    ['a las 4:30', 4, 30],
    ['para las 4', 4, 0],
    ['mañana a las 4', 4, 0],
    ['a las cuatro', 4, 0],
    ['las 4', 4, 0],
    ['4:30', 4, 30],
    ['a las 12', 12, 0],
  ])(
    '«%s» es una hora ambigua y no una hora definitiva',
    (message, hour, minute) => {
      const entities = extractEntities(message, { now });
      expect(entities.time).toBeUndefined();
      expect(entities.ambiguousTime).toEqual({ hour, minute });
    },
  );

  it.each([
    ['a las 4 pm', '16:00'],
    ['a las 4 p. m.', '16:00'],
    ['a las 4 am', '04:00'],
    ['a las 4 de la tarde', '16:00'],
    ['a las 4 en la tarde', '16:00'],
    ['a las 4 de la mañana', '04:00'],
    ['a las 4 por la mañana', '04:00'],
    ['a las 7 de la noche', '19:00'],
    ['a las cuatro de la tarde', '16:00'],
    ['16:00', '16:00'],
    ['a las 16:30', '16:30'],
    ['a las 04:00', '04:00'],
  ])('«%s» no es ambigua: %s', (message, time) => {
    const entities = extractEntities(message, { now });
    expect(entities.time).toBe(time);
    expect(entities.ambiguousTime).toBeUndefined();
  });

  it.each(['quiero un corte', 'mañana', 'el 15/03', 'somos 4', 'a las 25'])(
    '«%s» no produce hora ni hora ambigua',
    (message) => {
      const entities = extractEntities(message, { now });
      expect(entities.time).toBeUndefined();
      expect(entities.ambiguousTime).toBeUndefined();
    },
  );

  it.each([
    ['de la tarde', 'afternoon'],
    ['en la tarde', 'afternoon'],
    ['la tarde', 'afternoon'],
    ['tarde', 'afternoon'],
    ['pm', 'afternoon'],
    ['p.m.', 'afternoon'],
    ['de la mañana', 'morning'],
    ['la mañana', 'morning'],
    ['am', 'morning'],
    ['de la noche', 'evening'],
  ])('la aclaración «%s» se reconoce como periodo %s', (message, period) => {
    expect(extractEntities(message, { now }).timeOfDay).toBe(period);
  });

  it('«mañana» a secas sigue siendo una fecha y no un periodo', () => {
    const entities = extractEntities('mañana', { now });
    expect(entities.timeOfDay).toBeUndefined();
    expect(entities.date).toEqual(new Date('2026-10-16T00:00:00.000Z'));
  });

  it.each([
    [{ hour: 4, minute: 0 }, 'afternoon', '16:00'],
    [{ hour: 4, minute: 30 }, 'morning', '04:30'],
    [{ hour: 7, minute: 0 }, 'evening', '19:00'],
    [{ hour: 12, minute: 0 }, 'afternoon', '12:00'],
  ] as const)('resolveAmbiguousTime(%j, %s) = %s', (ambiguous, period, time) => {
    expect(resolveAmbiguousTime(ambiguous, period)).toBe(time);
  });

  it('resolveAmbiguousTime no inventa un periodo', () => {
    expect(resolveAmbiguousTime({ hour: 4, minute: 0 }, undefined)).toBe(
      undefined,
    );
  });
});
