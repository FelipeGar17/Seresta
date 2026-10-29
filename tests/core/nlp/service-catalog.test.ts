import { describe, expect, it } from 'vitest';
import type { Service } from '../../../src/core/types.js';
import {
  buildServiceCatalog,
  toServiceCatalog,
} from '../../../src/core/nlp/service-catalog.js';
import { matchService } from '../../../src/core/nlp/service-matcher.js';

const createService = (overrides: Partial<Service> = {}): Service => ({
  id: 'srv-corte',
  businessId: 'business-1',
  name: 'Corte de cabello',
  aliases: ['corte'],
  price: 25_000,
  durationMinutes: 30,
  active: true,
  ...overrides,
});

describe('toServiceCatalog', () => {
  it('conserva el id, el nombre y los alias del servicio canónico', () => {
    const service = createService({
      aliases: ['corte', 'corte de pelo'],
    });

    expect(toServiceCatalog([service])).toEqual([
      {
        id: 'srv-corte',
        name: 'Corte de cabello',
        aliases: ['corte', 'corte de pelo'],
      },
    ]);
  });

  it('solo incluye servicios activos', () => {
    const active = createService();
    const inactive = createService({
      id: 'srv-inactivo',
      name: 'Peinado',
      aliases: ['peinado'],
      active: false,
    });

    const result = buildServiceCatalog([active, inactive]);

    expect(result.entries).toEqual([
      {
        id: 'srv-corte',
        name: 'Corte de cabello',
        aliases: ['corte'],
      },
    ]);
    expect(result.excluded).toEqual([
      { service: inactive, reason: 'inactive' },
    ]);
  });

  it('no resuelve por nombre ni alias un servicio inactivo', () => {
    const catalog = toServiceCatalog([
      createService({
        id: 'srv-inactivo',
        name: 'Peinado',
        aliases: ['peinado'],
        active: false,
      }),
    ]);

    expect(catalog).toEqual([]);
    expect(matchService('quiero un peinado', catalog)).toEqual({
      status: 'not-found',
    });
  });

  it('no produce entradas sin id utilizable', () => {
    const emptyId = createService({ id: '   ' });
    const missingId = createService({
      id: undefined as unknown as string,
      name: 'Manicure',
    });

    const result = buildServiceCatalog([emptyId, missingId]);

    expect(result.entries).toEqual([]);
    expect(result.excluded).toEqual([
      { service: emptyId, reason: 'missing-id' },
      { service: missingId, reason: 'missing-id' },
    ]);
  });

  it('garantiza que toda entrada operativa tenga id no vacío', () => {
    const catalog = toServiceCatalog([
      createService(),
      createService({
        id: '  srv-barba  ',
        name: 'Arreglo de barba',
        aliases: [],
      }),
    ]);

    for (const entry of catalog) {
      expect(entry.id.trim()).not.toBe('');
    }
  });
});

describe('contrato catálogo NLP ↔ servicio canónico', () => {
  it('reconoce un servicio activo por nombre y alias, y devuelve el id original', () => {
    const service = createService();
    const catalog = toServiceCatalog([service]);

    for (const message of [
      'quiero un corte de cabello',
      'quiero un corte',
    ]) {
      const match = matchService(message, catalog);

      expect(match.status).toBe('matched');
      if (match.status !== 'matched') throw new Error('Se esperaba matched');

      expect(match.service.id).toBe(service.id);
      expect(catalog.find((entry) => entry.id === match.service.id)).toEqual({
        id: service.id,
        name: service.name,
        aliases: service.aliases,
      });
    }
  });

  it('representa la ambigüedad de alias compartidos sin elegir un servicio', () => {
    const first = createService({
      id: 'srv-corte',
      name: 'Corte de cabello',
      aliases: ['corte'],
    });
    const second = createService({
      id: 'srv-corte-premium',
      name: 'Corte premium',
      aliases: ['corte'],
    });
    const catalog = toServiceCatalog([first, second]);

    const match = matchService('quiero un corte', catalog);

    expect(match.status).toBe('ambiguous');
    if (match.status !== 'ambiguous') throw new Error('Se esperaba ambiguous');

    expect(match.candidates.map((candidate) => candidate.id)).toEqual([
      'srv-corte',
      'srv-corte-premium',
    ]);
  });

  it('cada coincidencia del catálogo apunta a un servicio canónico existente', () => {
    const services = [
      createService(),
      createService({
        id: 'srv-barba',
        name: 'Arreglo de barba',
        aliases: ['perfilado'],
      }),
    ];
    const catalog = toServiceCatalog(services);

    for (const entry of catalog) {
      expect(services.some((service) => service.id === entry.id)).toBe(true);
    }
  });
});
