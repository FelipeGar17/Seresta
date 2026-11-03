import { describe, expect, it } from 'vitest';
import {
  analyzeMessageWithCatalog,
} from '../../../src/core/nlp/message-analysis.js';

const catalog = [
  { id: 'cut', name: 'Corte de cabello', aliases: ['corte'] },
];

const examples = [
  {
    label: 'positive explicit booking',
    message: 'Quiero agendar una cita',
    action: 'accept',
    intent: 'book-appointment',
  },
  {
    label: 'positive cancellation',
    message: 'Quiero cancelar mi cita',
    action: 'accept',
    intent: 'cancel-appointment',
  },
  {
    label: 'positive typo corrected before classification',
    message: 'Kiero agendar una cita',
    action: 'accept',
    intent: 'book-appointment',
  },
  {
    label: 'negative cancellation request',
    message: 'No quiero cancelar mi cita',
    action: 'offer-options',
    intent: 'unknown',
  },
  {
    label: 'negated cancellation with positive reschedule',
    message: 'No cancelar, mejor cambiar la hora a las 4 pm',
    action: 'accept',
    intent: 'reschedule-appointment',
  },
  {
    label: 'contradictory booking and cancellation',
    message: 'Quiero agendar una cita y cancelar mi cita',
    action: 'clarify',
    intent: 'unknown',
  },
  {
    label: 'compatible booking and price request',
    message: 'Quiero agendar una cita y saber cuánto cuesta el corte',
    action: 'accept',
    intent: 'book-appointment',
  },
  {
    label: 'unrecognized input offers options',
    message: 'blorf',
    action: 'offer-options',
    intent: 'unknown',
  },
] as const;

describe('intent policy — labeled regression set', () => {
  it.each(examples)('$label', ({ message, action, intent }) => {
    const analysis = analyzeMessageWithCatalog(message, catalog);

    expect(analysis.detection.decision.action).toBe(action);
    expect(analysis.detection.decision.effectiveIntent).toBe(intent);
  });

  it('meets the full labeled-set threshold without false acceptance of conflicts', () => {
    const results = examples.map(({ message, action }) => {
      const decision = analyzeMessageWithCatalog(
        message,
        catalog,
      ).detection.decision;
      return { expected: action, actual: decision.action };
    });
    const correct = results.filter(
      ({ expected, actual }) => expected === actual,
    ).length;
    const contradictoryActionCases = examples.filter(
      ({ action }) => action === 'clarify',
    );
    const falseAccepts = contradictoryActionCases.filter(({ message }) =>
      ['accept', 'offer-options'].includes(
        analyzeMessageWithCatalog(message, catalog).detection.decision.action,
      ),
    );

    expect(correct).toBe(examples.length);
    expect(falseAccepts).toHaveLength(0);
  });
});
