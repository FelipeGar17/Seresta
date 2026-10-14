import { describe, expect, it } from 'vitest';
import { detectIntent } from '../../../src/core/nlp/intent-detector.js';

describe('detectIntent', () => {
  it.each([
    ['Hola, buenos días', 'greeting'],
    ['Quiero sacar una cita', 'book-appointment'],
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
});
