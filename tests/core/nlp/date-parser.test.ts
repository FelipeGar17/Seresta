import { describe, expect, it } from 'vitest';
import { parseRelativeDate } from '../../../src/core/nlp/date-parser.js';

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

  it('moves to the following week when the named weekday is today', () => {
    expect(parseRelativeDate('miércoles', { now })).toEqual(
      new Date('2026-10-21T00:00:00.000Z'),
    );
  });
});
