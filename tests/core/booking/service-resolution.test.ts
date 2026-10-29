import { describe, expect, it } from 'vitest';
import type {
  ConfiguracionNegocio,
  Service,
  ServiceCatalogEntry,
  ServiceMatch,
} from '../../../src/core/types.js';
import { resolveServiceMatch } from '../../../src/core/booking/service-resolution.js';

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

const createBusiness = (
  services: Service[],
): ConfiguracionNegocio => ({
  businessId: 'business-1',
  name: 'Barbería',
  timezone: 'America/Bogota',
  whatsappNumber: '+573000000000',
  googleCalendarId: 'calendar-1',
  services,
  businessHours: {
    monday: [{ opensAt: '08:00', closesAt: '18:00' }],
  },
});

const matched = (entry: ServiceCatalogEntry): ServiceMatch => ({
  status: 'matched',
  service: entry,
});

describe('resolveServiceMatch', () => {
  it('resuelve una coincidencia contra el Service canónico y conserva precio y duración', () => {
    const service = createService();
    const business = createBusiness([service]);
    const match = matched({
      id: 'srv-corte',
      name: 'Corte de cabello',
      aliases: ['corte'],
    });

    const result = resolveServiceMatch(match, business);

    expect(result).toEqual({ status: 'resolved', service });
    if (result.status !== 'resolved') throw new Error('Se esperaba resolved');
    expect(result.service.price).toBe(25_000);
    expect(result.service.durationMinutes).toBe(30);
  });

  it('rechaza un servicio inactivo', () => {
    const inactive = createService({ active: false });
    const business = createBusiness([inactive]);

    expect(
      resolveServiceMatch(
        matched({ id: 'srv-corte', name: 'Corte de cabello' }),
        business,
      ),
    ).toEqual({ status: 'inactive', service: inactive });
  });

  it('rechaza un servicio que pertenece a otro negocio', () => {
    const foreign = createService({ businessId: 'business-2' });
    const business = createBusiness([foreign]);

    expect(
      resolveServiceMatch(
        matched({ id: 'srv-corte', name: 'Corte de cabello' }),
        business,
      ),
    ).toEqual({ status: 'foreign-service', service: foreign });
  });

  it('no incluye candidatos inactivos en una ambigüedad', () => {
    const inactive = createService({ active: false });
    const business = createBusiness([inactive]);

    expect(
      resolveServiceMatch(
        {
          status: 'ambiguous',
          candidates: [
            { id: 'srv-corte', name: 'Corte de cabello', aliases: ['corte'] },
          ],
        },
        business,
      ),
    ).toEqual({ status: 'inactive', service: inactive });
  });

  it('rechaza una entrada de catálogo que no existe en la configuración', () => {
    const business = createBusiness([createService()]);

    expect(
      resolveServiceMatch(
        matched({ id: 'srv-inexistente', name: 'Fantasma' }),
        business,
      ),
    ).toEqual({
      status: 'invalid-catalog-entry',
      entryId: 'srv-inexistente',
    });
  });

  it('mantiene explícita la ambigüedad y no elige un candidato', () => {
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
    const business = createBusiness([first, second]);

    const result = resolveServiceMatch(
      {
        status: 'ambiguous',
        candidates: [
          { id: 'srv-corte', name: 'Corte de cabello', aliases: ['corte'] },
          { id: 'srv-corte-premium', name: 'Corte premium', aliases: ['corte'] },
        ],
      },
      business,
    );

    expect(result).toEqual({
      status: 'ambiguous',
      candidates: [first, second],
    });
  });

  it('propaga not-found sin inventar un servicio', () => {
    expect(
      resolveServiceMatch({ status: 'not-found' }, createBusiness([])),
    ).toEqual({ status: 'not-found' });
  });
});
