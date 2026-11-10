import { describe, expect, it } from 'vitest';
import {
  SPELLING_RULES,
  correctSpelling,
} from '../../../src/core/nlp/spelling-corrector.js';
import { analyzeMessageWithCatalog } from '../../../src/core/nlp/message-analysis.js';

describe('correctSpelling', () => {
  it.each([
    ['dame el turno de laas 3 pm', 'dame el turno de las 3 pm'],
    ['kiero un corte', 'quiero un corte'],
    ['Kiero un corte', 'Quiero un corte'],
    ['KIERO un corte', 'QUIERO un corte'],
    ['kiero cambiar la hora a laas 9:45pm', 'quiero cambiar la hora a las 9:45pm'],
    ['ajendame una cita', 'agendarme una cita'],
    ['kansele mi cita', 'cancele mi cita'],
    ['tienen disponibel manana', 'tienen disponible manana'],
    ['porfabor agendar', 'por favor agendar'],
  ])('corrige "%s"', (input, expected) => {
    const result = correctSpelling(input);
    expect(result.text).toBe(expected);
    expect(result.original).toBe(input);
    expect(result.applied.length).toBeGreaterThan(0);
  });

  it.each([
    'quiero un corte mañana a las 3 pm',
    'me llamo Laasya',
    'el kierokeno',
    'agendar mi cita',
    'disponible hoy',
    '',
  ])('no modifica "%s"', (input) => {
    const result = correctSpelling(input);
    expect(result.text).toBe(input);
    expect(result.applied).toEqual([]);
  });

  it('informa cada corrección aplicada', () => {
    expect(correctSpelling('kiero laas 3').applied).toEqual([
      { ruleId: 'kiero-quiero', from: 'kiero', to: 'quiero' },
      { ruleId: 'double-vowel-las', from: 'laas', to: 'las' },
    ]);
  });

  it('no repite formas erróneas entre reglas y las escribe en minúsculas', () => {
    const words = SPELLING_RULES.flatMap((rule) => rule.wrong);
    expect(new Set(words).size).toBe(words.length);
    for (const rule of SPELLING_RULES) {
      expect(rule.wrong.every((w) => w === w.toLowerCase())).toBe(true);
      expect(rule.wrong).not.toContain(rule.right);
    }
  });
});

describe('analyzeMessageWithCatalog con corrección ortográfica', () => {
  it('detecta la intención y la hora tras corregir', () => {
    const analysis = analyzeMessageWithCatalog('kiero agendar a laas 3 pm', undefined);
    expect(analysis.detection.intent).toBe('book-appointment');
    expect(analysis.entities.time).toBe('15:00');
    expect(analysis.spelling.applied).toHaveLength(2);
  });

  it('detecta la intención tras corregir errores comunes', () => {
    expect(
      analyzeMessageWithCatalog('ajendame una cita', undefined).detection.intent,
    ).toBe('book-appointment');
    expect(
      analyzeMessageWithCatalog('kansele mi cita', undefined).detection.intent,
    ).toBe('cancel-appointment');
  });
});
