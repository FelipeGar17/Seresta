import { describe, expect, it } from 'vitest';
import {
  parseRelativeDate,
  matchDatePhrase,
} from '../../../src/core/nlp/date-parser.js';

// 2026-10-14 en America/Bogota (miércoles).
const now = new Date('2026-10-15T02:00:00.000Z');

describe('parseRelativeDate', () => {
  it('resolves today and tomorrow in the business timezone', () => {
    expect(parseRelativeDate('hoy', { now })).toEqual(
      new Date('2026-10-14T00:00:00.000Z'),
    );
    expect(parseRelativeDate('mañana', { now })).toEqual(
      new Date('2026-10-15T00:00:00.000Z'),
    );
  });

  it('resolves the next named weekday', () => {
    expect(parseRelativeDate('el próximo viernes', { now })).toEqual(
      new Date('2026-10-16T00:00:00.000Z'),
    );
  });

  it('returns undefined when there is no relative date', () => {
    expect(parseRelativeDate('en la mañana', { now })).toBeUndefined();
  });

  it('does not resolve morning time-of-day phrases as tomorrow', () => {
    expect(parseRelativeDate('por la mañana', { now })).toBeUndefined();
    expect(parseRelativeDate('de la mañana', { now })).toBeUndefined();
    expect(parseRelativeDate('en la mañana', { now })).toBeUndefined();
  });

  it('does not match "hoy" inside other words', () => {
    expect(parseRelativeDate('ahoy', { now })).toBeUndefined();
    expect(parseRelativeDate('shoy', { now })).toBeUndefined();
  });

  it('still resolves a standalone tomorrow after a morning phrase', () => {
    expect(parseRelativeDate('mañana en la mañana', { now })).toEqual(
      new Date('2026-10-15T00:00:00.000Z'),
    );
  });

  it('resolves "pasado mañana" as two days ahead', () => {
    expect(parseRelativeDate('pasado mañana', { now })).toEqual(
      new Date('2026-10-16T00:00:00.000Z'),
    );
  });

  it('resolves a weekday without "próximo"', () => {
    expect(parseRelativeDate('el lunes', { now })).toEqual(
      new Date('2026-10-19T00:00:00.000Z'),
    );
  });

  it('resolves a weekday written without an article', () => {
    expect(parseRelativeDate('lunes', { now })).toEqual(
      new Date('2026-10-19T00:00:00.000Z'),
    );
    expect(parseRelativeDate('para lunes', { now })).toEqual(
      new Date('2026-10-19T00:00:00.000Z'),
    );
  });

  it('resolves today when the named weekday is today', () => {
    expect(parseRelativeDate('miércoles', { now })).toEqual(
      new Date('2026-10-14T00:00:00.000Z'),
    );
    expect(parseRelativeDate('el miércoles', { now })).toEqual(
      new Date('2026-10-14T00:00:00.000Z'),
    );
  });

  it('keeps today in the business timezone when UTC has already crossed midnight', () => {
    const lateThursdayInBogota = new Date('2026-10-30T04:00:00.000Z');

    expect(
      parseRelativeDate('el jueves', {
        now: lateThursdayInBogota,
        timeZone: 'America/Bogota',
      }),
    ).toEqual(new Date('2026-10-29T00:00:00.000Z'));
  });

  it('moves to the following week only when "próximo" is explicit', () => {
    expect(parseRelativeDate('el próximo miércoles', { now })).toEqual(
      new Date('2026-10-21T00:00:00.000Z'),
    );
    expect(parseRelativeDate('el próximo viernes', { now })).toEqual(
      new Date('2026-10-16T00:00:00.000Z'),
    );
  });

  it('does not resolve recurring weekdays as a single date', () => {
    expect(parseRelativeDate('los martes', { now })).toBeUndefined();
    expect(parseRelativeDate('cada martes', { now })).toBeUndefined();
    expect(parseRelativeDate('todos los martes', { now })).toBeUndefined();
    expect(parseRelativeDate('estos martes', { now })).toBeUndefined();
  });

  it('uses the business timezone to decide which day is today', () => {
    // 2026-10-15T02:00:00Z es 2026-10-14 en Bogota y 2026-10-15 en UTC.
    expect(
      parseRelativeDate('hoy', { now, timeZone: 'America/Bogota' }),
    ).toEqual(new Date('2026-10-14T00:00:00.000Z'));
    expect(parseRelativeDate('hoy', { now, timeZone: 'UTC' })).toEqual(
      new Date('2026-10-15T00:00:00.000Z'),
    );
  });

  it('resolves a Spanish calendar date to its next occurrence when year is omitted', () => {
    const octoberNow = new Date('2026-10-29T15:00:00.000Z');

    expect(
      parseRelativeDate('6 de noviembre', { now: octoberNow }),
    ).toEqual(new Date('2026-11-06T00:00:00.000Z'));
    expect(parseRelativeDate('6 de noviembre de 2026', { now })).toEqual(
      new Date('2026-11-06T00:00:00.000Z'),
    );
  });

  it('parses numeric dates in day/month/year order and rejects invalid dates', () => {
    expect(parseRelativeDate('27/11/2026', { now })).toEqual(
      new Date('2026-11-27T00:00:00.000Z'),
    );
    expect(parseRelativeDate('31/02/2026', { now })).toBeUndefined();
  });
});

describe('matchDatePhrase', () => {
  it('classifies a single date', () => {
    expect(matchDatePhrase('mañana')).toEqual({
      kind: 'single',
      type: 'tomorrow',
      phrase: 'manana',
      isNextWeek: false,
    });
  });

  it('classifies a weekday and detects "próximo"', () => {
    expect(matchDatePhrase('el próximo lunes')).toEqual({
      kind: 'single',
      type: 'weekday',
      phrase: 'el proximo lunes',
      weekday: 'monday',
      isNextWeek: true,
    });
  });

  it('classifies a recurrence', () => {
    expect(matchDatePhrase('los martes')).toEqual({
      kind: 'recurring',
      phrase: 'los martes',
      weekday: 'tuesday',
      frequency: 'weekly',
    });
  });

  it('does not confuse "los servicios" with a weekday', () => {
    expect(matchDatePhrase('quiero conocer los servicios')).toBeUndefined();
  });

  it('returns undefined for messages without a date', () => {
    expect(matchDatePhrase('quiero una cita')).toBeUndefined();
  });

  it('classifies numeric and Spanish month dates', () => {
    expect(matchDatePhrase('el 27/11/2026')).toMatchObject({
      kind: 'single',
      type: 'calendar-date',
      day: 27,
      month: 11,
      year: 2026,
    });
    expect(matchDatePhrase('6 de noviembre')).toMatchObject({
      kind: 'single',
      type: 'calendar-date',
      day: 6,
      month: 11,
    });
  });
});
