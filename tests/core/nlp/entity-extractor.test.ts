import { describe, expect, it } from 'vitest';
import type { ServiceCatalogEntry } from '../../../src/core/types.js';
import { extractEntities } from '../../../src/core/nlp/entity-extractor.js';

const now = new Date('2026-10-15T15:00:00.000Z');

const services: ServiceCatalogEntry[] = [
  { id: 'srv-1', name: 'Corte de cabello', aliases: ['corte de pelo'] },
  { id: 'srv-2', name: 'Manicure' },
  { id: 'srv-3', name: 'Cortes de pelo' },
];

describe('extractEntities', () => {
  it('extracts service, date, morning range and keeps them separate', () => {
    expect(
      extractEntities('Quisiera reservar un corte de cabello mañana en la mañana', {
        now,
        services,
      }),
    ).toEqual({
      serviceMatch: { status: 'matched', service: services[0] },
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
      serviceMatch: undefined,
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

  it('does not resolve a service without a catalog', () => {
    expect(extractEntities('Quiero un corte de cabello', { now })).toMatchObject({
      serviceMatch: undefined,
    });
  });

  it('reports a service that is not in the catalog', () => {
    expect(
      extractEntities('Quiero una manicure', { now, services: [] }),
    ).toMatchObject({
      serviceMatch: { status: 'not-found' },
    });
  });

  it('resolves the service from the business catalog', () => {
    expect(
      extractEntities('¿Tienen servicio de manicure?', { now, services }),
    ).toMatchObject({
      serviceMatch: { status: 'matched', service: services[1] },
    });
  });

  it('resolves a service through a configured alias', () => {
    expect(
      extractEntities('Quiero un corte de pelo', { now, services }),
    ).toMatchObject({
      serviceMatch: { status: 'matched', service: services[0] },
    });
  });

  it('does not choose a service when several match equally', () => {
    const ambiguous: ServiceCatalogEntry[] = [
      { id: 'a', name: 'Servicio A' },
      { id: 'b', name: 'Servicio B', aliases: ['servicio a'] },
    ];

    expect(
      extractEntities('quiero el servicio a', { now, services: ambiguous }),
    ).toMatchObject({
      serviceMatch: { status: 'ambiguous', candidates: ambiguous },
    });
  });

  it('does not infer a date from morning time-of-day phrases', () => {
    expect(
      extractEntities('Quiero una cita en la mañana', { now }),
    ).toMatchObject({
      relativeDate: undefined,
      date: undefined,
      timeOfDay: 'morning',
    });
    expect(
      extractEntities('Quiero una cita por la mañana', { now }),
    ).toMatchObject({
      relativeDate: undefined,
      date: undefined,
      timeOfDay: 'morning',
    });
    expect(
      extractEntities('Quiero una cita de la mañana', { now }),
    ).toMatchObject({
      relativeDate: undefined,
      date: undefined,
      timeOfDay: 'morning',
    });
  });

  it('converts midnight and noon correctly', () => {
    expect(extractEntities('Cita a las 12 a.m.', { now })).toMatchObject({
      time: '00:00',
    });
    expect(extractEntities('Cita a las 12 a. m.', { now })).toMatchObject({
      time: '00:00',
    });
    expect(extractEntities('Cita a las 12 p.m.', { now })).toMatchObject({
      time: '12:00',
    });
    expect(extractEntities('Cita a las 12 p. m.', { now })).toMatchObject({
      time: '12:00',
    });
  });

  it('extracts 24-hour times', () => {
    expect(extractEntities('Cita a las 17:30', { now })).toMatchObject({
      time: '17:30',
    });
    expect(extractEntities('Cita a las 07:05', { now })).toMatchObject({
      time: '07:05',
    });
  });

  it('rejects out-of-range times', () => {
    expect(extractEntities('Cita a las 3:75', { now })).toMatchObject({
      time: undefined,
    });
    expect(extractEntities('Cita a las 13 p.m.', { now })).toMatchObject({
      time: undefined,
    });
    expect(extractEntities('Cita a las 25:00', { now })).toMatchObject({
      time: undefined,
    });
  });

  it('does not infer a time from a bare hour without meridiem', () => {
    expect(extractEntities('Quiero una cita a las 3', { now })).toMatchObject({
      time: undefined,
    });
  });

  it('extracts service, date and time together', () => {
    expect(
      extractEntities('Quiero un corte de cabello mañana a las 3 p.m.', {
        now,
        services,
      }),
    ).toEqual({
      serviceMatch: { status: 'matched', service: services[0] },
      relativeDate: 'manana',
      date: new Date('2026-10-16T00:00:00.000Z'),
      time: '15:00',
      timeOfDay: undefined,
    });
  });

  it('resolves "pasado mañana" as two days ahead', () => {
    expect(
      extractEntities('Quiero una cita pasado mañana', { now }),
    ).toMatchObject({
      relativeDate: 'pasado manana',
      date: new Date('2026-10-17T00:00:00.000Z'),
    });
  });

  it('extracts a weekday without "próximo"', () => {
    expect(extractEntities('Quiero una cita el lunes', { now })).toMatchObject({
      relativeDate: 'el lunes',
      date: new Date('2026-10-19T00:00:00.000Z'),
    });
    expect(
      extractEntities('Quiero una cita el viernes a las 17:30', { now }),
    ).toMatchObject({
      relativeDate: 'el viernes',
      date: new Date('2026-10-16T00:00:00.000Z'),
      time: '17:30',
    });
  });

  it('resolves standalone today and tomorrow', () => {
    expect(extractEntities('Quiero una cita para hoy', { now })).toMatchObject(
      {
        relativeDate: 'hoy',
        date: new Date('2026-10-15T00:00:00.000Z'),
      },
    );
    expect(
      extractEntities('Quiero una cita para mañana', { now }),
    ).toMatchObject({
      relativeDate: 'manana',
      date: new Date('2026-10-16T00:00:00.000Z'),
    });
  });

  it('does not match "hoy" inside other words', () => {
    expect(extractEntities('Quiero cita ahoy', { now })).toMatchObject({
      relativeDate: undefined,
      date: undefined,
    });
  });

  it('extracts a weekday written without an article', () => {
    expect(extractEntities('Quiero una cita para lunes', { now })).toMatchObject({
      relativeDate: 'lunes',
      date: new Date('2026-10-19T00:00:00.000Z'),
    });
  });

  it('extracts the explicit "próximo" week', () => {
    expect(
      extractEntities('Quiero una cita el próximo lunes', { now }),
    ).toMatchObject({
      relativeDate: 'el proximo lunes',
      date: new Date('2026-10-19T00:00:00.000Z'),
    });
  });

  it('reports a recurring weekday without turning it into a single date', () => {
    expect(extractEntities('Quiero cita los martes', { now })).toMatchObject({
      relativeDate: undefined,
      date: undefined,
      recurrence: { frequency: 'weekly', weekday: 'tuesday' },
    });
    expect(extractEntities('Quiero cita cada martes', { now })).toMatchObject({
      relativeDate: undefined,
      date: undefined,
      recurrence: { frequency: 'weekly', weekday: 'tuesday' },
    });
  });
});
