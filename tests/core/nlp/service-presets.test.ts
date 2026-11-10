import { describe, expect, it } from 'vitest';
import {
  findRelatedServicePresets,
  SERVICE_PRESETS,
  suggestAliasesForServiceName,
} from '../../../src/core/nlp/service-presets.js';

describe('service presets', () => {
  it('incluye presets para barbería, peluquería, maquillaje, spa y uñas', () => {
    const domains = new Set(SERVICE_PRESETS.map((preset) => preset.domain));
    expect(domains).toEqual(
      new Set(['barberia', 'peluqueria', 'maquillaje', 'spa', 'unas']),
    );
  });

  it('sugiere alias útiles para servicios configurados con nombres comunes', () => {
    expect(suggestAliasesForServiceName('Corte y barba')).toEqual(
      expect.arrayContaining(['corte de pelo y barba', 'combo corte y barba']),
    );
    expect(suggestAliasesForServiceName('Manicura')).toEqual(
      expect.arrayContaining(['manicure']),
    );
    expect(suggestAliasesForServiceName('Limpieza facial')).toEqual(
      expect.arrayContaining(['facial']),
    );
  });

  it('encuentra presets relacionados por dominio', () => {
    const makeup = findRelatedServicePresets('Maquillaje social', ['maquillaje']);
    expect(makeup.length).toBeGreaterThan(0);
    expect(makeup.every((preset) => preset.domain === 'maquillaje')).toBe(true);
  });
});
