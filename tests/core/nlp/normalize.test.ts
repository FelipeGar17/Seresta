import { describe, expect, it } from 'vitest';
import {
  normalizeForExtraction,
  normalizeIntent,
  normalizeText,
  splitEmojis,
} from '../../../src/core/nlp/normalize.js';

describe('normalizeText', () => {
  it('convierte mayúsculas y tildes a un texto simple', () => {
    expect(normalizeIntent('¡QUIÉRO una CÍTA!')).toBe('quiero una cita');
  });

  it('reduce espacios y elimina signos innecesarios', () => {
    expect(normalizeIntent('  ¿Qué   servicios ofrecen?  ')).toBe(
      'que servicios ofrecen',
    );
  });

  it('conserva letras, números y el contenido de mensajes', () => {
    expect(normalizeText('Cita #2: salón 24')).toBe('cita 2 salon 24');
  });

  it('devuelve una cadena vacía para un mensaje sin contenido útil', () => {
    expect(normalizeIntent('!!!   ???')).toBe('');
  });

  it('conserva la ñ en intención y extracción', () => {
    expect(normalizeIntent('Muñoz pidió año')).toBe('muñoz pidio año');
    expect(normalizeForExtraction('Muñoz 15/03 a las 3:00')).toBe(
      'Muñoz 15/03 a las 3:00',
    );
  });

  it('expande abreviaturas solo para intención', () => {
    expect(normalizeIntent('xfa agendar xq necesito cita')).toBe(
      'por favor agendar porque necesito cita',
    );
    expect(normalizeForExtraction('cita x/15')).toBe('cita x/15');
  });

  it('separa emojis del texto', () => {
    expect(splitEmojis('cita mañana 🙏')).toEqual({
      text: 'cita mañana',
      emojis: ['🙏'],
    });
  });
});
