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
      score: 2,
      matched: ['agendar una cita', 'quiero agendar'],
      normalized: 'quiero agendar una cita',
    });
  });
});

describe('detectIntent — agradecimientos', () => {
  it('recognizes gratitude as its own intent', () => {
    expect(detectIntent('Gracias')).toBe('thanks');
    expect(detectIntent('Muchas gracias')).toBe('thanks');
    expect(detectIntent('Mil gracias')).toBe('thanks');
    expect(detectIntent('No gracias')).toBe('thanks');
    expect(detectIntent('Sí, gracias')).toBe('thanks');
  });

  it('does not let gratitude displace the main intent', () => {
    expect(detectIntent('Quiero una cita para mañana, gracias')).toBe(
      'book-appointment',
    );
    expect(detectIntent('Quiero cancelar mi cita, gracias')).toBe(
      'cancel-appointment',
    );
    expect(detectIntent('¿Cuánto cuesta el corte? gracias')).toBe(
      'check-prices',
    );
    expect(detectIntent('Gracias, hasta luego')).toBe('goodbye');
  });

  it('interprets "no gracias" as rejection only with confirmation context', () => {
    expect(
      detectIntent('no gracias', { lastBotQuestion: '¿Confirmas esta cita?' }),
    ).toBe('reject-appointment');
    expect(
      detectIntent('sí gracias', { lastBotQuestion: '¿Confirmas esta cita?' }),
    ).toBe('confirm-appointment');
    expect(detectIntent('no gracias')).not.toBe('reject-appointment');
    expect(detectIntent('no gracias')).not.toBe('cancel-appointment');
  });
});

describe('detectIntent — negaciones', () => {
  it('reports negated intentions without treating them as orders', () => {
    const detection = detectIntentDetailed('No quiero cancelar una cita');
    expect(detection.intent).not.toBe('cancel-appointment');
    expect(detection.negated).toBe(true);
    expect(detection.negatedIntents).toContain('cancel-appointment');
  });

  it('keeps negations from activating other reservation intents', () => {
    expect(detectIntent('No quiero reservar una cita')).not.toBe(
      'book-appointment',
    );
    expect(detectIntent('No quiero cambiar mi cita')).not.toBe(
      'reschedule-appointment',
    );
    expect(detectIntent('No quiero rechazar la cita')).not.toBe(
      'reject-appointment',
    );
    expect(detectIntent('No me canceles por ahora')).not.toBe(
      'cancel-appointment',
    );
  });
});

describe('detectIntent — varios mensajes con intención mixta', () => {
  it('keeps booking as primary and reports the secondary intent', () => {
    const detection = detectIntentDetailed(
      'Quiero agendar una cita y saber el precio',
    );
    expect(detection.intent).toBe('book-appointment');
    expect(detection.intents).toEqual(['book-appointment', 'check-prices']);
  });

  it('keeps cancellation as primary when combined with other requests', () => {
    const detection = detectIntentDetailed(
      'Quiero cancelar mi cita y consultar los servicios',
    );
    expect(detection.intent).toBe('cancel-appointment');
    expect(detection.intents).toContain('list-services');
  });

  it('handles booking with date and price in one message', () => {
    const detection = detectIntentDetailed(
      'Quiero una cita para mañana y saber cuánto cuesta el corte',
    );
    expect(detection.intent).toBe('book-appointment');
    expect(detection.intents).toContain('check-prices');
  });
});

describe('detectIntent — consultas de servicios', () => {
  it.each([
    ['¿Tienen servicio de corte?'],
    ['¿Qué servicios tienen?'],
    ['¿Hacen cortes de pelo?'],
    ['¿Tienen servicio de manicure?'],
  ])('interprets "%s" as list-services', (message) => {
    expect(detectIntent(message)).toBe('list-services');
  });
});

describe('detectIntent — correcciones de reglas amplias y negaciones', () => {
  it('does not activate a negated price inquiry', () => {
    const detection = detectIntentDetailed('No quiero consultar los precios');
    expect(detection.intent).not.toBe('check-prices');
    expect(detection.negatedIntents).toContain('check-prices');
    expect(detectIntent('No me interesa el precio')).not.toBe('check-prices');
  });

  it('treats "gracias por la ayuda" as thanks, not help', () => {
    const detection = detectIntentDetailed('Muchas gracias por la ayuda');
    expect(detection.intent).toBe('thanks');
  });

  it('does not add check-appointment when cancelling "mi cita"', () => {
    const detection = detectIntentDetailed('Quiero cancelar mi cita gracias');
    expect(detection.intent).toBe('cancel-appointment');
    expect(detection.intents).not.toContain('check-appointment');

    const combined = detectIntentDetailed(
      'Quiero cancelar mi cita y consultar los precios',
    );
    expect(combined.intent).toBe('cancel-appointment');
    expect(combined.intents).toEqual(['cancel-appointment', 'check-prices']);
  });

  it('detects services and prices in the same message', () => {
    const detection = detectIntentDetailed(
      'Quiero saber qué servicios tienen y cuánto cuestan',
    );
    expect(detection.intents).toContain('list-services');
    expect(detection.intents).toContain('check-prices');
  });

  it('recognizes "hasta pronto" as goodbye', () => {
    expect(detectIntent('Hasta pronto')).toBe('goodbye');
  });

  it('interprets "no confirmo la cita" as rejection', () => {
    const detection = detectIntentDetailed('No confirmo la cita');
    expect(detection.intent).toBe('reject-appointment');
    expect(detection.negatedIntents).toContain('confirm-appointment');
  });

  it('keeps cancellation negated while accepting the reschedule request', () => {
    const detection = detectIntentDetailed(
      'No quiero cancelar mi cita, quiero reprogramarla',
    );
    expect(detection.intent).toBe('reschedule-appointment');
    expect(detection.negatedIntents).toContain('cancel-appointment');
  });

  it('recognizes pronoun-suffixed verbs in isolation', () => {
    expect(detectIntent('Quiero reprogramarla')).toBe('reschedule-appointment');
    expect(detectIntent('Puedes cancelarla')).toBe('cancel-appointment');
    expect(detectIntent('Quiero agendarla')).toBe('book-appointment');
  });

  it('still negates pronoun-suffixed verbs', () => {
    expect(detectIntent('No quiero cancelarla')).not.toBe(
      'cancel-appointment',
    );
    expect(detectIntent('No quiero reprogramarla')).not.toBe(
      'reschedule-appointment',
    );
    expect(detectIntentDetailed('No quiero cancelarla').negatedIntents).toContain(
      'cancel-appointment',
    );
  });
});
