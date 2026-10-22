import { describe, expect, it } from 'vitest';
import type { ConfiguracionNegocio, Service } from '../../../src/core/types.js';
import { validateService } from '../../../src/core/booking/service-validator.js';

const createService = (
  overrides: Partial<Service> = {},
): Service => ({
  id: 'service-1',
  businessId: 'business-1',
  name: 'Corte de pelo',
  price: 20_000,
  durationMinutes: 30,
  active: true,
  ...overrides,
});

const business: ConfiguracionNegocio = {
  businessId: 'business-1',
  name: 'Barbería',
  timezone: 'America/Bogota',
  whatsappNumber: '+573000000000',
  googleCalendarId: 'calendar-1',
  services: [
    createService(),
    createService({
      id: 'service-2',
      name: 'Manicure',
      price: 0,
      durationMinutes: 45,
    }),
    createService({
      id: 'service-3',
      name: 'Peinado',
      active: false,
    }),
  ],
};

describe('validateService', () => {
  it('valida un servicio encontrado por identificador', () => {
    const result = validateService(business, 'service-1');

    expect(result).toEqual({
      valid: true,
      value: business.services[0],
    });
  });

  it('encuentra el servicio por nombre normalizado', () => {
    const result = validateService(business, '  CORTE DE PÉLO  ');

    expect(result).toEqual({
      valid: true,
      value: business.services[0],
    });
  });

  it('encuentra el servicio por alias normalizado', () => {
    const businessWithAlias: ConfiguracionNegocio = {
      ...business,
      services: [createService({ aliases: ['corte', 'peluquería'] })],
    };

    const result = validateService(businessWithAlias, 'PELUQUERÍA');

    expect(result).toEqual({
      valid: true,
      value: businessWithAlias.services[0],
    });
  });

  it('rechaza un servicio inexistente', () => {
    expect(validateService(business, 'Tinte')).toEqual({
      valid: false,
      reason: 'not-found',
    });
  });

  it('rechaza un nombre vacío como servicio inexistente', () => {
    expect(validateService(business, '   ')).toEqual({
      valid: false,
      reason: 'not-found',
    });
  });

  it('distingue un servicio inactivo', () => {
    const result = validateService(business, 'Peinado');

    expect(result).toEqual({
      valid: false,
      reason: 'inactive',
      value: business.services[2],
    });
  });

  it.each([
    ['duración cero', { durationMinutes: 0 }],
    ['duración negativa', { durationMinutes: -15 }],
    ['duración no finita', { durationMinutes: Number.NaN }],
    ['precio negativo', { price: -1 }],
    ['precio no finito', { price: Number.POSITIVE_INFINITY }],
  ])('rechaza configuración inválida: %s', (_description, overrides) => {
    const invalidBusiness = {
      ...business,
      services: [createService(overrides)],
    };

    const result = validateService(invalidBusiness, 'service-1');

    expect(result).toMatchObject({
      valid: false,
      reason: 'invalid-configuration',
      value: invalidBusiness.services[0],
    });
  });

  it('permite un precio cero para servicios gratuitos', () => {
    const result = validateService(business, 'Manicure');

    expect(result).toEqual({
      valid: true,
      value: business.services[1],
    });
  });
});
