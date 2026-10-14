import { describe, expect, it } from 'vitest';
import { normalizeText } from '../../../src/core/nlp/normalize.js';

describe('normalizeText', () => {
  it('convierte mayúsculas y tildes a un texto simple', () => {
    expect(normalizeText('¡QUIÉRO una CÍTA!')).toBe('quiero una cita');
  });

  it('reduce espacios y elimina signos innecesarios', () => {
    expect(normalizeText('  ¿Qué   servicios ofrecen?  ')).toBe(
      'que servicios ofrecen',
    );
  });

  it('conserva letras, números y el contenido de mensajes', () => {
    expect(normalizeText('Cita #2: salón 24')).toBe('cita 2 salon 24');
  });

  it('devuelve una cadena vacía para un mensaje sin contenido útil', () => {
    expect(normalizeText('!!!   ???')).toBe('');
  });
});
