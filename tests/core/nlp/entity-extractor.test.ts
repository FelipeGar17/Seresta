import { describe, expect, it } from 'vitest';
import { extractEntities } from '../../../src/core/nlp/entity-extractor.js';

const now = new Date('2026-10-15T15:00:00.000Z');

describe('extractEntities', () => {
  it('extracts service, date, morning range and keeps them separate', () => {
    expect(
      extractEntities('Quisiera reservar un corte mañana en la mañana', { now }),
    ).toEqual({
      serviceName: 'corte',
      relativeDate: 'manana',
      date: new Date('2026-10-16T00:00:00.000Z'),
      time: undefined,
      timeOfDay: 'morning',
    });
  });

  it('extracts a date and an explicit afternoon time', () => {
    expect(extractEntities('Mañana a las 3 p. m.', { now })).toMatchObject({
      relativeDate: 'manana',
      date: new Date('2026-10-16T00:00:00.000Z'),
      time: '15:00',
    });
  });

  it('returns partial entities without inventing missing data', () => {
    expect(extractEntities('Quiero una cita')).toEqual({
      serviceName: undefined,
      relativeDate: undefined,
      date: undefined,
      time: undefined,
      timeOfDay: undefined,
    });
  });

  it('preserves extraction punctuation and ignores emojis', () => {
    expect(extractEntities('Quiero cita el 15/03 a las 3:00 🙏')).toMatchObject({
      time: '03:00',
    });
  });

  it('can reuse the normalized intent from the detector', () => {
    expect(
      extractEntities('Quiero una cita mañana', {
        now,
        normalizedIntent: 'quiero una cita manana',
      }).date,
    ).toEqual(new Date('2026-10-16T00:00:00.000Z'));
  });
});
