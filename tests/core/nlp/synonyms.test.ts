import { describe, expect, it } from 'vitest';
import type { ConversationIntent } from '../../../src/core/types.js';
import { detectIntent } from '../../../src/core/nlp/intent-detector.js';
import { normalizeIntent } from '../../../src/core/nlp/normalize.js';
import {
  intentNegations,
  intentSynonyms,
} from '../../../src/core/nlp/synonyms.js';

describe('integridad de synonyms.ts', () => {
  it('cada regla de negación corresponde a una regla de sinónimos', () => {
    for (const rule of Object.keys(intentNegations)) {
      expect(Object.keys(intentSynonyms), rule).toContain(rule);
    }
  });

  it.each(Object.entries(intentSynonyms))(
    'la regla «%s» no repite frases normalizadas',
    (_rule, phrases) => {
      const normalized = phrases.map(normalizeIntent);
      const duplicated = normalized.filter(
        (phrase, index) => normalized.indexOf(phrase) !== index,
      );
      expect(duplicated).toEqual([]);
    },
  );

  it.each(Object.entries(intentSynonyms))(
    'las frases de «%s» ya están normalizadas',
    (_rule, phrases) => {
      for (const phrase of phrases) {
        expect(phrase).toBe(normalizeIntent(phrase));
      }
    },
  );
});

describe('expresiones coloquiales colombianas', () => {
  it.each<[string, ConversationIntent]>([
    ['hola parce', 'greeting'],
    ['quihubo', 'greeting'],
    ['chao parce', 'goodbye'],
    ['que le vaya bien', 'goodbye'],
    ['gracias parce', 'thanks'],
    ['muy amable', 'thanks'],
    ['dios le pague', 'thanks'],
    ['me regala una cita para mañana', 'book-appointment'],
    ['me separa una cita porfa', 'book-appointment'],
    ['necesito un turno', 'book-appointment'],
    ['me puede agendar', 'book-appointment'],
    ['cuánto me sale', 'check-prices'],
    ['a cómo me sale', 'check-prices'],
    ['hay campito para hoy', 'check-availability'],
    ['a qué hora cierran', 'check-availability'],
    ['qué horario manejan', 'check-availability'],
    ['me toca cancelar', 'cancel-appointment'],
    ['cancélame la cita', 'cancel-appointment'],
    ['me la puede cambiar', 'reschedule-appointment'],
    ['me corre la cita', 'reschedule-appointment'],
    ['confírmeme la cita', 'confirm-appointment'],
  ])('«%s» → %s', (message, expected) => {
    expect(detectIntent(message)).toBe(expected);
  });

  it.each([
    'no me la cancele',
    'no me cambie la cita',
    'no me la corra',
  ])('la negación «%s» no activa cancelar ni reprogramar', (message) => {
    expect(detectIntent(message)).not.toBe('cancel-appointment');
    expect(detectIntent(message)).not.toBe('reschedule-appointment');
  });
});

describe('«sí» y «no» dependen del contexto del bot', () => {
  it.each([
    'sí',
    'dale',
    'de una',
    'listo',
    'perfecto',
    'claro que sí',
    'por supuesto',
    'sí señor',
  ])('«%s» confirma cuando el bot pidió confirmación', (message) => {
    expect(
      detectIntent(message, { lastBotQuestion: '¿Confirmas esta cita?' }),
    ).toBe('confirm-appointment');
  });

  it.each(['no', 'no señor', 'no gracias'])(
    '«%s» rechaza cuando el bot pidió confirmación',
    (message) => {
      expect(
        detectIntent(message, { lastBotQuestion: '¿Confirmas esta cita?' }),
      ).toBe('reject-appointment');
    },
  );

  it.each(['sí', 'de una', 'listo', 'perfecto', 'no'])(
    '«%s» sin contexto no confirma ni rechaza',
    (message) => {
      expect(detectIntent(message)).not.toBe('confirm-appointment');
      expect(detectIntent(message)).not.toBe('reject-appointment');
    },
  );

  it('«sí» tras una pregunta que no es de confirmación no confirma', () => {
    expect(
      detectIntent('sí', { lastBotQuestion: '¿Qué servicio deseas?' }),
    ).not.toBe('confirm-appointment');
  });

  it('el contexto exige la palabra completa, no una subcadena', () => {
    expect(
      detectIntent('sí', { lastBotQuestion: '¿Reconfirmamos el nombre?' }),
    ).not.toBe('confirm-appointment');
  });

  it.each(['no me sirve', 'no me queda'])(
    '«%s» ya no se trata como rechazo de la cita',
    (message) => {
      expect(detectIntent(message)).not.toBe('reject-appointment');
    },
  );
});
