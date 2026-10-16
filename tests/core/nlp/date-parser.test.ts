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
});
