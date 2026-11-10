import { describe, expect, it } from 'vitest';
import type { ServiceCatalogEntry } from '../../../src/core/types.js';
import {
  detectIntent,
  detectIntentDetailed,
} from '../../../src/core/nlp/intent-detector.js';

// Catálogo de ejemplo: el motor no conoce estos nombres de antemano.
const CATALOG: ServiceCatalogEntry[] = [
  { id: 'srv-corte', name: 'Corte de cabello', aliases: ['corte'] },
  { id: 'srv-barba', name: 'Arreglo de barba' },
  { id: 'srv-color', name: 'Coloración' },
];

describe('detectIntent', () => {
  it.each([
    ['Hola, buenos días', 'greeting'],
    ['Quiero sacar una cita', 'book-appointment'],
    ['Quiero iniciar una reserva', 'book-appointment'],
    ['Quisiera hacer una reserva para mañana', 'book-appointment'],
    ['Quiero un corte mañana', 'book-appointment'],
    ['¿Qué servicios ofrecen?', 'list-services'],
    ['¿Tienen corte de pelo?', 'list-services'],
    ['¿Cuánto cuesta el corte?', 'check-prices'],
    ['¿Qué horarios tienen disponibles?', 'check-availability'],
    ['¿Tienes disponibilidad para mañana?', 'check-availability'],
    ['Tienes servicio para mañana', 'check-availability'],
    ['Quiero cancelar mi cita', 'cancel-appointment'],
    ['Necesito cambiar la cita', 'reschedule-appointment'],
    ['Quiero modificar mi cita antes de confirmarla', 'reschedule-appointment'],
    ['¿Me puede decir qué cita tengo?', 'check-appointment'],
    ['Sí, acepto la reserva', 'confirm-appointment'],
    ['Sí, la confirmo', 'confirm-appointment'],
    ['La confirmo', 'confirm-appointment'],
    ['No quiero confirmar', 'reject-appointment'],
    ['No la confirmo', 'reject-appointment'],
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

  it('uses state context to interpret isolated affirmatives and negatives', () => {
    expect(
      detectIntent('sí', { shortReplyContext: 'booking-confirmation' }),
    ).toBe('confirm-appointment');
    expect(
      detectIntent('no', { shortReplyContext: 'booking-confirmation' }),
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
    expect(detectIntent('No quiero iniciar una reserva')).not.toBe(
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

  it('does not interpret "no la confirmo" as an affirmative confirmation', () => {
    const detection = detectIntentDetailed('No la confirmo');
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

describe('detectIntent — catálogo de servicios', () => {
  it('detects a booking request from a configured service', () => {
    expect(
      detectIntent('Quiero un arreglo de barba', { services: CATALOG }),
    ).toBe('book-appointment');
    expect(
      detectIntent('Necesito un corte mañana', { services: CATALOG }),
    ).toBe('book-appointment');
  });

  it('detects service inquiries from the catalog', () => {
    expect(
      detectIntent('¿Tienen arreglo de barba?', { services: CATALOG }),
    ).toBe('list-services');
    expect(
      detectIntent('¿Manejan coloración?', { services: CATALOG }),
    ).toBe('list-services');
  });

  it('detects price inquiries from the catalog', () => {
    expect(
      detectIntent('¿Cuánto cuesta el arreglo de barba?', { services: CATALOG }),
    ).toBe('check-prices');
    expect(
      detectIntent('¿Qué precio tiene la coloración?', { services: CATALOG }),
    ).toBe('check-prices');
  });

  it('does not assume that any mention of a service is a booking', () => {
    expect(
      detectIntent('¿Cuánto cuesta el corte?', { services: CATALOG }),
    ).toBe('check-prices');
    expect(
      detectIntent('Quiero saber cuánto cuesta un corte', { services: CATALOG }),
    ).toBe('check-prices');
  });

  it('does not know services that are not in the catalog', () => {
    const detection = detectIntentDetailed('Quiero un corte', {
      services: [{ id: 'srv-color', name: 'Coloración' }],
    });
    // La intención es genérica (el cliente pide algo), pero el motor no
    // reconoce "corte" como servicio del catálogo: eso lo resuelve el
    // matcher, no el detector.
    expect(detection.intent).toBe('book-appointment');
    expect(
      detection.frames.every((frame) => !frame.catalogBacked),
    ).toBe(true);
  });

  it('reports the frame that supported the interpretation', () => {
    const detection = detectIntentDetailed('Quiero un arreglo de barba', {
      services: CATALOG,
    });
    expect(detection.intent).toBe('book-appointment');
    expect(detection.frames.map((frame) => frame.phrase)).toContain(
      'quiero un arreglo de barba',
    );
    expect(
      detection.frames.some((frame) => frame.catalogBacked),
    ).toBe(true);
  });

  it('keeps a price inquiry as the main intent in a mixed message', () => {
    const detection = detectIntentDetailed(
      'Quiero un arreglo de barba y saber cuánto cuesta',
      { services: CATALOG },
    );
    expect(detection.intent).toBe('check-prices');
    expect(detection.intents).toContain('book-appointment');
  });

  it('does not repeat an intention detected by several frames', () => {
    const detection = detectIntentDetailed(
      'Quiero un arreglo de barba y saber cuánto cuesta',
      { services: CATALOG },
    );
    expect(detection.intents).toEqual(['check-prices', 'book-appointment']);
  });

  it('keeps working with an empty catalog', () => {
    expect(detectIntent('Quiero un corte', { services: [] })).toBe(
      'book-appointment',
    );
  });

  it('negates a frame mentioned in negative form', () => {
    const detection = detectIntentDetailed('No quiero un corte', {
      services: CATALOG,
    });
    expect(detection.intent).not.toBe('book-appointment');
    expect(detection.negatedIntents).toContain('book-appointment');
  });
});

describe('detectIntent — Fase 6: consulta de catálogo frente a reserva', () => {
  it.each([
    ['¿Qué servicios ofrecen?', 'list-services'],
    ['¿Qué cortes hacen?', 'list-services'],
    ['¿Qué servicios tienen disponibles?', 'list-services'],
    ['¿Tienen corte de cabello?', 'list-services'],
    ['qué hacen', 'list-services'],
    ['¿Cuánto cuesta el corte de cabello?', 'check-prices'],
    ['¿Cuánto cuesta el corte?', 'check-prices'],
    ['cuanto vale la coloración', 'check-prices'],
    ['cuánto sale el corte', 'check-prices'],
    ['cuánto me cobran por la coloración', 'check-prices'],
    ['precio del corte', 'check-prices'],
    ['qué precios manejan', 'check-prices'],
    ['Quiero reservar un corte de cabello', 'book-appointment'],
    ['Quiero agendar una cita', 'book-appointment'],
    ['necesito un corte', 'book-appointment'],
  ])('%j → %s con catálogo', (message, expected) => {
    expect(detectIntent(message, { services: CATALOG })).toBe(expected);
  });

  it('no trata "servicios disponibles" como consulta de disponibilidad', () => {
    const detection = detectIntentDetailed('¿Qué servicios tienen disponibles?', {
      services: CATALOG,
    });

    expect(detection.intent).toBe('list-services');
    expect(detection.intents).not.toContain('check-availability');
  });

  it('mantiene check-availability para preguntas de horario', () => {
    expect(
      detectIntent('¿Tienen disponibilidad mañana?', { services: CATALOG }),
    ).toBe('check-availability');
  });
});

describe('detectIntent — ampliación de vocabulario y excepciones', () => {
  it.each([
    ['Agéndame para mañana', 'book-appointment'],
    ['Resérveme un espacio', 'book-appointment'],
    ['Quisiera programar una cita', 'book-appointment'],
    ['Me gustaría agendar', 'book-appointment'],
    ['Para agendar, por favor', 'book-appointment'],
    ['Me da una cita para el viernes', 'book-appointment'],
    ['Quiero que me reserven una hora', 'book-appointment'],
  ] as const)('interprets booking phrasing "%s" as %s', (message, expected) => {
    expect(detectIntent(message)).toBe(expected);
  });

  it.each([
    ['¿Hay citas disponibles mañana?', 'check-availability'],
    ['Tienen agenda abierta hoy', 'check-availability'],
    ['¿Qué días trabajan?', 'check-availability'],
    ['¿Atienden mañana?', 'check-availability'],
    ['Cuál es el horario de atención', 'check-availability'],
    ['¿Tienen turnos disponibles?', 'check-availability'],
  ] as const)('interprets availability phrasing "%s" as %s', (message, expected) => {
    expect(detectIntent(message)).toBe(expected);
  });

  it.each([
    ['Quiero ver el catálogo de servicios', 'list-services'],
    ['Me muestra los servicios', 'list-services'],
    ['¿Con qué servicios cuentan?', 'list-services'],
  ] as const)('interprets service phrasing "%s" as %s', (message, expected) => {
    expect(detectIntent(message)).toBe(expected);
  });

  it.each([
    ['Ya no quiero la cita', 'cancel-appointment'],
    ['Quiero anular mi cita', 'cancel-appointment'],
    ['Ya no voy a ir a la cita', 'cancel-appointment'],
    ['Por favor cancelen mi cita', 'cancel-appointment'],
  ] as const)('interprets cancellation phrasing "%s" as %s', (message, expected) => {
    expect(detectIntent(message)).toBe(expected);
  });

  it.each([
    ['Quisiera reagendar mi cita', 'reschedule-appointment'],
    ['Me pueden cambiar la cita para otro día', 'reschedule-appointment'],
    ['Reprogramarla para otra hora', 'reschedule-appointment'],
    ['Quiero mover mi turno', 'reschedule-appointment'],
  ] as const)('interprets reschedule phrasing "%s" as %s', (message, expected) => {
    expect(detectIntent(message)).toBe(expected);
  });

  it('keeps expanded negations from activating the positive intent', () => {
    expect(detectIntent('No deseo hacer una cita')).not.toBe('book-appointment');
    expect(detectIntent('No quiero programar una cita')).not.toBe(
      'book-appointment',
    );
    expect(detectIntent('No deseo aplazar mi cita')).not.toBe(
      'reschedule-appointment',
    );
    expect(detectIntent('No quiero borrar mi cita')).not.toBe(
      'cancel-appointment',
    );
  });

  it('preserves multi-intent detection with expanded phrases', () => {
    const detection = detectIntentDetailed(
      'Quisiera reagendar mi cita y saber el precio',
    );
    expect(detection.intent).toBe('reschedule-appointment');
    expect(detection.intents).toContain('check-prices');
  });

  it('does not treat ambiguous short affirmatives as booking without context', () => {
    expect(detectIntent('de una')).toBe('unknown');
  });
});

describe('detectIntent — sin catálogo', () => {
  it('falls back to generic patterns when there is no catalog', () => {
    expect(detectIntent('Quiero un corte mañana')).toBe('book-appointment');
    expect(detectIntent('¿Hacen cortes de pelo?')).toBe('list-services');
    expect(detectIntent('¿Tienen corte de pelo?')).toBe('list-services');
  });

  it('does not fire the generic booking frame without an article', () => {
    expect(detectIntent('Necesito información')).toBe('unknown');
    expect(detectIntent('Quiero saber los servicios')).toBe('list-services');
  });

  it('does not treat functional words as a service', () => {
    expect(detectIntent('Quiero un presupuesto')).toBe('unknown');
    expect(detectIntent('Quiero un horario')).not.toBe('book-appointment');
  });

  it('negates a generic frame', () => {
    const detection = detectIntentDetailed('No quiero un corte');
    expect(detection.intent).not.toBe('book-appointment');
    expect(detection.negatedIntents).toContain('book-appointment');
  });

  it('reports a generic booking as a secondary intent', () => {
    const detection = detectIntentDetailed(
      'Quiero un corte y saber cuánto cuesta',
    );
    expect(detection.intent).toBe('check-prices');
    expect(detection.intents).toContain('book-appointment');
  });
});
