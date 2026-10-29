import { describe, expect, it } from 'vitest';
import { detectIntentDetailed } from '../../../src/core/nlp/intent-detector.js';
import { extractEntities } from '../../../src/core/nlp/entity-extractor.js';

describe('auditoría del flujo — regresiones NLP', () => {
  it.each(['no cancelar', 'no cancelar la cita, cambia la hora a las 4 pm'])(
    '«%s» no es una cancelación',
    (message) => {
      const detection = detectIntentDetailed(message);
      expect(detection.intent).not.toBe('cancel-appointment');
      expect(detection.negatedIntents).toContain('cancel-appointment');
    },
  );

  it.each(['cancelar', 'quiero cancelar mi cita', 'cancelar la reserva'])(
    '«%s» sigue siendo una cancelación',
    (message) => {
      expect(detectIntentDetailed(message).intent).toBe('cancel-appointment');
    },
  );

  it.each([
    ['cambia el nombre a Pedro', 'Pedro'],
    ['cambiar el nombre por Ana María', 'Ana María'],
    ['corrige el nombre de Pedro', 'Pedro'],
  ])('«%s» extrae el nombre «%s»', (message, name) => {
    expect(extractEntities(message).customerName).toBe(name);
  });

  it.each(['cambia el nombre', 'cambiar nombre', 'cambia la hora a las 4 pm'])(
    '«%s» no inventa un nombre',
    (message) => {
      expect(extractEntities(message).customerName).toBeUndefined();
    },
  );
});
