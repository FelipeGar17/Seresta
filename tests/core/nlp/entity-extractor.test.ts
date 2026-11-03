import { describe, expect, it } from 'vitest';
import type { ServiceCatalogEntry } from '../../../src/core/types.js';
import {
  extractBareCustomerName,
  extractEntities,
} from '../../../src/core/nlp/entity-extractor.js';

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

  it.each([
    ['Quiero cita para el 6 de noviembre a las 3 pm', '2026-11-06T00:00:00.000Z'],
    ['Quiero cita para el 27/11/2026 a las 3 pm', '2026-11-27T00:00:00.000Z'],
  ])('extracts date and time together from "%s"', (message, date) => {
    expect(extractEntities(message, { now })).toMatchObject({
      date: new Date(date),
      time: '15:00',
    });
  });

  it('extracts Spanish afternoon and morning period expressions', () => {
    expect(
      extractEntities('Mañana a las 3 de la tarde', { now }),
    ).toMatchObject({
      relativeDate: 'manana',
      date: new Date('2026-10-16T00:00:00.000Z'),
      time: '15:00',
      timeOfDay: 'afternoon',
    });
    expect(extractEntities('Cita a las 3:30 de la tarde', { now })).toMatchObject(
      {
        time: '15:30',
      },
    );
    expect(extractEntities('Cita a las 12 de la mañana', { now })).toMatchObject(
      {
        time: '00:00',
      },
    );
  });

  it.each([
    ['Dame el turno de las tres de la tarde', '15:00'],
    ['tres pm', '15:00'],
    ['3 pm', '15:00'],
    ['a la una de la mañana', '01:00'],
    ['a las doce de la mañana', '00:00'],
  ])('extracts spoken or numeric time from "%s"', (message, time) => {
    expect(extractEntities(message, { now })).toMatchObject({ time });
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
    const entities = extractEntities('Quiero cita el 15/03 a las 3:00 🙏');
    expect(entities.time).toBeUndefined();
    expect(entities.ambiguousTime).toEqual({ hour: 3, minute: 0 });
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

  it.each([
    ['Me llamo Andrés', 'Andrés'],
    ['mi nombre es carlos', 'Carlos'],
    ['Soy María José', 'María José'],
    ['mi nombre es carlos y quiero agendar un corte de pelo mañana a las 3 pm', 'Carlos'],
    ['Quiero un corte mañana a las 3 de la tarde, me llamo Carlos', 'Carlos'],
    ['me llamo Sara y tengo una pregunta', 'Sara'],
    ['me llamo Ana y mi cita es para el jueves', 'Ana'],
  ])('extrae el nombre explícito de %j', (message, expected) => {
    expect(extractEntities(message, { now, services }).customerName).toBe(
      expected,
    );
  });

  it('extrae el nombre sin perder servicio, fecha y hora del mismo mensaje', () => {
    const entities = extractEntities(
      'mi nombre es carlos y quiero agendar un corte de cabello mañana a las 3 pm',
      { now, services },
    );

    expect(entities.customerName).toBe('Carlos');
    expect(entities.serviceMatch).toEqual({
      status: 'matched',
      service: services[0],
    });
    expect(entities.relativeDate).toBe('manana');
    expect(entities.time).toBe('15:00');
  });

  it('extrae saludo + nombre + intención + fecha + hora en un mensaje reordenado', () => {
    const entities = extractEntities(
      'Hola, me llamo Sara y quiero agendar una cita para mañana a las 3 pm',
      { now, services },
    );

    expect(entities.customerName).toBe('Sara');
    expect(entities.relativeDate).toBe('manana');
    expect(entities.date).toEqual(new Date('2026-10-16T00:00:00.000Z'));
    expect(entities.time).toBe('15:00');
  });

  it.each([
    ['Quiero agendar a nombre de Sara', 'Sara'],
    ['agéndalo a nombre de sara, gracias', 'Sara'],
    ['a nombre de gracias', undefined],
  ])('extrae "a nombre de" solo como prefijo explícito: %j', (message, expected) => {
    expect(extractEntities(message, { now, services }).customerName).toBe(
      expected,
    );
  });

  it.each([
    ['quiero cambiar la fecha de mañana para el jueves', '2026-10-15'],
    ['quiero cambiar la fecha para el jueves', '2026-10-15'],
    ['cambia la fecha del viernes al jueves', '2026-10-15'],
    ['cambiar la fecha de hoy para pasado mañana', '2026-10-17'],
    ['para el jueves', '2026-10-15'],
  ])('usa la fecha de destino en %j', (message, expectedDate) => {
    expect(extractEntities(message, { now }).date).toEqual(
      new Date(`${expectedDate}T00:00:00.000Z`),
    );
  });

  it.each([
    ['quiero cita mañana', '2026-10-16'],
    ['quiero cita de mañana', '2026-10-16'],
    ['el jueves', '2026-10-15'],
  ])('mantiene una sola fecha sin destino en %j', (message, expectedDate) => {
    expect(extractEntities(message, { now }).date).toEqual(
      new Date(`${expectedDate}T00:00:00.000Z`),
    );
  });

  it.each([
    'Carlos',
    'de Carlos',
    'soy hoy',
    'me llamo gracias',
    'Hola',
  ])('no inventa un nombre explícito en %j', (message) => {
    expect(extractEntities(message, { now, services }).customerName).toBe(
      undefined,
    );
  });

  it.each([
    ['carlos', 'Carlos'],
    ['de carlos', 'Carlos'],
    ['De Carlos Ruiz', 'Carlos Ruiz'],
    ['de Sara', 'Sara'],
    ['de Sara, gracias', 'Sara'],
    ['de Sara gracias', 'Sara'],
    ['a nombre de Sara', 'Sara'],
    ['a nombre de sara, por favor', 'Sara'],
    ['es Sara', 'Sara'],
    ['Sara', 'Sara'],
    ['sara por favor', 'Sara'],
    ['gracias, de Sara', 'Sara'],
    ['gracias', undefined],
    ['muchas gracias', undefined],
    ['por favor', undefined],
    ['jueves', undefined],
    ['a nombre de gracias', undefined],
    ['Andrés', 'Andrés'],
    ['sí', undefined],
    ['mañana', undefined],
    ['25:00', undefined],
  ])('interpreta %j como respuesta de nombre: %j', (message, expected) => {
    expect(extractBareCustomerName(message)).toBe(expected);
  });
});
