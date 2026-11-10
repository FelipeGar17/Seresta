import { describe, expect, it } from 'vitest';
import type {
  ConfiguracionNegocio,
  Service,
} from '../../../src/core/types.js';
import { parseBusinessConfig } from '../../../src/config/load-config.js';
import {
  analyzeMessage,
  analyzeMessageWithCatalog,
} from '../../../src/core/nlp/message-analysis.js';

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
  timezone = 'America/Bogota',
): ConfiguracionNegocio =>
  parseBusinessConfig({
    businessId: 'business-1',
    nombre: 'Barbería',
    zonaHoraria: timezone,
    whatsappNumero: '+573000000000',
    calendarId: 'calendar-1',
    servicios: services.map((service) => ({
      id: service.id,
      businessId: service.businessId,
      nombre: service.name,
      descripcion: service.description,
      aliases: service.aliases,
      precio: service.price,
      duracionMinutos: service.durationMinutes,
      activo: service.active,
    })),
    horariosAtencion: {
      monday: [{ abreA: '08:00', cierraA: '18:00' }],
    },
  });

describe('analyzeMessage', () => {
  it('deriva el catálogo y lo comparte entre detector y extractor', () => {
    const service = createService();
    const analysis = analyzeMessage(
      'Quiero un corte de cabello mañana',
      createBusiness([service]),
    );

    expect(analysis.catalog).toHaveLength(1);
    expect(analysis.catalog[0]).toMatchObject({
      id: 'srv-corte',
      name: 'Corte de cabello',
    });
    expect(analysis.catalog[0]?.aliases).toEqual(expect.arrayContaining(['corte']));
    expect(analysis.detection.intent).toBe('book-appointment');
    expect(
      analysis.detection.frames.some((frame) => frame.catalogBacked),
    ).toBe(true);

    expect(analysis.entities.serviceMatch?.status).toBe('matched');
    if (analysis.entities.serviceMatch?.status !== 'matched') {
      throw new Error('Se esperaba una coincidencia de servicio');
    }
    // El extractor recibió exactamente la misma entrada del catálogo.
    expect(analysis.entities.serviceMatch.service).toBe(analysis.catalog[0]);
  });

  it('reconoce un servicio activo por nombre y por alias', () => {
    const business = createBusiness([createService()]);

    for (const message of [
      'Quiero un corte de cabello',
      'Quiero un corte',
    ]) {
      const analysis = analyzeMessage(message, business);

      expect(analysis.entities.serviceMatch?.status).toBe('matched');
      if (analysis.entities.serviceMatch?.status !== 'matched') {
        throw new Error('Se esperaba una coincidencia de servicio');
      }
      expect(analysis.entities.serviceMatch.service.id).toBe('srv-corte');
    }
  });

  it('no incluye servicios inactivos ni los resuelve', () => {
    const active = createService();
    const inactive = createService({
      id: 'srv-peinado',
      name: 'Peinado',
      aliases: undefined,
      active: false,
    });
    const analysis = analyzeMessage(
      'Quiero un peinado',
      createBusiness([active, inactive]),
    );

    expect(analysis.catalog.map((entry) => entry.id)).toEqual(['srv-corte']);
    expect(analysis.entities.serviceMatch).toEqual({ status: 'not-found' });
  });

  it('mantiene el comportamiento sin catálogo operativo', () => {
    const inactive = createService({
      id: 'srv-peinado',
      name: 'Peinado',
      aliases: undefined,
      active: false,
    });
    const analysis = analyzeMessage(
      'Quiero un corte mañana',
      createBusiness([inactive]),
    );

    expect(analysis.catalog).toEqual([]);
    // Sin catálogo el extractor no inventa una resolución.
    expect(analysis.entities.serviceMatch).toBeUndefined();
    // Los marcos genéricos siguen funcionando.
    expect(analysis.detection.intent).toBe('book-appointment');
  });

  it('usa la zona horaria del negocio para resolver fechas relativas', () => {
    const business = createBusiness([createService()], 'UTC');
    const now = new Date('2026-10-23T02:00:00.000Z');
    const analysis = analyzeMessage('Quiero un corte hoy', business, { now });

    expect(analysis.entities.date).toEqual(
      new Date(Date.UTC(2026, 9, 23)),
    );
  });

  it('no altera la detección de intenciones que no dependen del catálogo', () => {
    const analysis = analyzeMessage(
      'Quiero cancelar mi cita',
      createBusiness([createService()]),
    );

    expect(analysis.detection.intent).toBe('cancel-appointment');
  });

  it('permite reutilizar un catálogo explícito en modo diagnóstico', () => {
    const analysis = analyzeMessageWithCatalog('Quiero un corte', [
      { id: 'srv-externo', name: 'Corte', aliases: ['corte'] },
    ]);

    expect(analysis.entities.serviceMatch?.status).toBe('matched');
    if (analysis.entities.serviceMatch?.status !== 'matched') {
      throw new Error('Se esperaba una coincidencia de servicio');
    }
    expect(analysis.entities.serviceMatch.service.id).toBe('srv-externo');
  });

  it('rechaza una configuración construida manualmente en la entrada productiva', () => {
    expect(() =>
      analyzeMessage(
        'Quiero un corte',
        {
          ...createServiceBusinessFixture(),
        },
      ),
    ).toThrow(/loadBusinessConfig|parseBusinessConfig/);
  });
});

const createServiceBusinessFixture = (): ConfiguracionNegocio => ({
  businessId: 'business-1',
  name: 'Barbería',
  timezone: 'America/Bogota',
  whatsappNumber: '+573000000000',
  googleCalendarId: 'calendar-1',
  services: [createService()],
  businessHours: {
    monday: [{ opensAt: '08:00', closesAt: '18:00' }],
  },
});
