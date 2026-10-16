import { describe, expect, it } from 'vitest';
import {
  detectIntent,
  detectIntentDetailed,
} from '../../../src/core/nlp/intent-detector.js';

describe('detectIntent', () => {
  it.each([
    ['Hola, buenos días', 'greeting'],
    ['Quiero sacar una cita', 'book-appointment'],
    ['Quiero un corte mañana', 'book-appointment'],
    ['¿Qué servicios ofrecen?', 'list-services'],
    ['¿Tienen corte de pelo?', 'list-services'],
    ['¿Cuánto cuesta el corte?', 'check-prices'],
    ['¿Qué horarios tienen disponibles?', 'check-availability'],
    ['Quiero cancelar mi cita', 'cancel-appointment'],
    ['Necesito cambiar la cita', 'reschedule-appointment'],
    ['Quiero modificar mi cita antes de confirmarla', 'reschedule-appointment'],
    ['¿Me puede decir qué cita tengo?', 'check-appointment'],
    ['Sí, acepto la reserva', 'confirm-appointment'],
    ['No quiero confirmar', 'reject-appointment'],
    ['¿Me pueden ayudar?', 'help'],
    ['Gracias, hasta luego', 'goodbye'],
  ] as const)('interprets "%s" as %s', (message, expectedIntent) => {
    expect(detectIntent(message)).toBe(expectedIntent);
  });

  it('prioritizes cancellation over the generic appointment words', () => {
    expect(detectIntent('Quiero cancelar mi cita')).toBe('cancel-appointment');
  });

  it('returns unknown when there is not enough evidence', () => {
    expect(detectIntent('Necesito información')).toBe('unknown');
    expect(detectIntent('Sí, perfecto')).toBe('unknown');
    expect(detectIntent('')).toBe('unknown');
  });

  it('does not match short words inside larger words', () => {
    expect(detectIntent('siempre estoy ocupado')).toBe('unknown');
    expect(detectIntent('sistema de citas')).toBe('unknown');
  });

  it('does not cancel when the message explicitly negates cancellation', () => {
    expect(detectIntent('No quiero cancelar mi cita')).not.toBe(
      'cancel-appointment',
    );
  });

  it('uses context to interpret an isolated affirmative or negative', () => {
    expect(
      detectIntent('sí', { lastBotQuestion: '¿Confirmas esta cita?' }),
    ).toBe('confirm-appointment');
    expect(
      detectIntent('no', { lastBotQuestion: '¿Confirmas esta cita?' }),
    ).toBe('reject-appointment');
  });

  it('returns normalized text, score and matched phrases for diagnostics', () => {
    expect(detectIntentDetailed('¡Quiero agendar una cita!')).toMatchObject({
      intent: 'book-appointment',
      score: 1,
      matched: ['agendar'],
      normalized: 'quiero agendar una cita',
    });
  });
});
