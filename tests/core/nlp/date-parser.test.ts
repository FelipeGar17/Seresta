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
});
