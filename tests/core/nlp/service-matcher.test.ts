import { describe, expect, it } from 'vitest';
import type { ServiceCatalogEntry } from '../../../src/core/types.js';
import {
  matchService,
  normalizeServiceName,
} from '../../../src/core/nlp/service-matcher.js';

const catalog: ServiceCatalogEntry[] = [
  { id: 'srv-1', name: 'Corte de cabello' },
  { id: 'srv-2', name: 'Arreglo de barba', aliases: ['perfilado'] },
  { id: 'srv-3', name: 'Coloración', aliases: ['tinte', 'pintura de pelo'] },
];

describe('normalizeServiceName', () => {
  it('ignora mayúsculas, tildes y espacios innecesarios', () => {
    expect(normalizeServiceName('  Corte   de  CABELLO ')).toBe(
      'corte de cabello',
    );
    expect(normalizeServiceName('Perfilado')).toBe('perfilado');
  });

  it('conserva la ñ de forma consistente', () => {
    expect(normalizeServiceName('Diseño de uñas')).toBe(
      normalizeServiceName('diseño de uñas'),
    );
  });
});

describe('matchService', () => {
  it('encuentra un servicio por su nombre exacto', () => {
    expect(matchService('quiero un corte de cabello', catalog)).toEqual({
      status: 'matched',
      service: catalog[0],
    });
  });

  it('encuentra un servicio ignorando mayúsculas y tildes', () => {
    expect(matchService('Quiero un CORTE DE CABELLO', catalog)).toEqual({
      status: 'matched',
      service: catalog[0],
    });
  });

  it('encuentra un servicio por un alias configurado', () => {
    expect(matchService('quiero un perfilado', catalog)).toEqual({
      status: 'matched',
      service: catalog[1],
    });
  });

  it('no encuentra servicios que no están en el catálogo', () => {
    expect(matchService('quiero una manicure', catalog)).toEqual({
      status: 'not-found',
    });
  });

  it('devuelve not-found con un catálogo vacío', () => {
    expect(matchService('quiero un corte', [])).toEqual({ status: 'not-found' });
  });

  it('no confunde un servicio con una palabra dentro de otra', () => {
    expect(matchService('quiero cortarse las uñas', catalog)).toEqual({
      status: 'not-found',
    });
  });

  it('no elige cuando dos servicios coinciden con la misma especificidad', () => {
    const ambiguousCatalog: ServiceCatalogEntry[] = [
      { id: 'a', name: 'Corte' },
      { id: 'b', name: 'Corte', aliases: ['tijera'] },
    ];

    expect(matchService('quiero un corte', ambiguousCatalog)).toEqual({
      status: 'ambiguous',
      candidates: ambiguousCatalog,
    });
  });

  it('prefiere la coincidencia más específica sobre la más corta', () => {
    const specificCatalog: ServiceCatalogEntry[] = [
      { id: 'a', name: 'Corte' },
      { id: 'b', name: 'Corte de cabello' },
    ];

    expect(matchService('quiero un corte de cabello', specificCatalog)).toEqual({
      status: 'matched',
      service: specificCatalog[1],
    });
  });

  it('reconoce un servicio compuesto aunque se agregue un modificador antes de «y»', () => {
    const comboCatalog: ServiceCatalogEntry[] = [
      { id: 'haircut', name: 'Corte de cabello' },
      { id: 'combo', name: 'Corte y barba' },
      { id: 'beard', name: 'Arreglo de barba' },
    ];

    expect(
      matchService('Cuánto vale el corte de cabello y barba', comboCatalog),
    ).toEqual({
      status: 'matched',
      service: comboCatalog[1],
    });
  });

  it('reporta como ambiguas las coincidencias con la misma longitud', () => {
    const tiedCatalog: ServiceCatalogEntry[] = [
      { id: 'a', name: 'Corte de pelo' },
      { id: 'b', name: 'Lavado', aliases: ['corte de pelo'] },
    ];

    expect(matchService('quiero un corte de pelo', tiedCatalog)).toEqual({
      status: 'ambiguous',
      candidates: tiedCatalog,
    });
  });

  it('resuelve un servicio por un alias configurado', () => {
    expect(matchService('quiero una pintura de pelo', catalog)).toEqual({
      status: 'matched',
      service: catalog[2],
    });
  });

  it('interpreta variaciones comunes como cabello/pelo', () => {
    expect(matchService('quiero un corte de pelo', catalog)).toEqual({
      status: 'matched',
      service: catalog[0],
    });
  });

  it('prefiere el servicio combinado cuando el cliente pide corte de pelo y barba', () => {
    const comboCatalog: ServiceCatalogEntry[] = [
      { id: 'cut', name: 'Corte de cabello', aliases: ['corte'] },
      { id: 'combo', name: 'Corte y barba' },
      { id: 'beard', name: 'Arreglo de barba', aliases: ['barba'] },
    ];

    expect(matchService('quiero un corte de pelo y barba', comboCatalog)).toEqual({
      status: 'matched',
      service: comboCatalog[1],
    });
  });
});
