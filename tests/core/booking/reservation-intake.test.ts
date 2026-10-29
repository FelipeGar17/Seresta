import { describe, expect, it } from 'vitest';
import type {
  ConfiguracionNegocio,
  Service,
} from '../../../src/core/types.js';
import {
  ConfigurationError,
  parseBusinessConfig,
} from '../../../src/config/load-config.js';
import { validateService } from '../../../src/core/booking/service-validator.js';
import { analyzeReservationMessage } from '../../../src/core/booking/reservation-intake.js';

const externalConfig = {
  businessId: 'business-1',
  nombre: 'Barbería',
  zonaHoraria: 'America/Bogota',
  whatsappNumero: '+573000000000',
  calendarId: 'calendar-1',
  servicios: [
    {
      id: 'cut-1',
      nombre: 'Corte de cabello',
      aliases: ['corte'],
      precio: 25_000,
      duracionMinutos: 30,
      activo: true,
    },
    {
      id: 'style-1',
      nombre: 'Peinado',
      precio: 15_000,
      duracionMinutos: 20,
      activo: false,
    },
  ],
  horariosAtencion: {
    monday: [{ abreA: '08:00', cierraA: '18:00' }],
  },
};

const business = (): ConfiguracionNegocio =>
  parseBusinessConfig(externalConfig);

const now = new Date('2026-10-15T15:00:00.000Z');

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

const createDuplicateAliasBusiness = (): ConfiguracionNegocio => ({
  businessId: 'business-1',
  name: 'Barbería',
  timezone: 'America/Bogota',
  whatsappNumber: '+573000000000',
  googleCalendarId: 'calendar-1',
  services: [
    createService({ id: 'srv-corte', name: 'Corte de cabello' }),
    createService({
      id: 'srv-corte-premium',
      name: 'Corte premium',
      aliases: ['corte'],
    }),
  ],
  businessHours: {
    monday: [{ opensAt: '08:00', closesAt: '18:00' }],
  },
});

describe('analyzeReservationMessage', () => {
  it('asigna el serviceId canónico al reconocer el nombre o un alias', () => {
    const config = business();

    for (const message of [
      'Quiero un corte de cabello',
      'Quiero un corte',
    ]) {
      const intake = analyzeReservationMessage(message, config);

      expect(intake.serviceResolution?.status).toBe('resolved');
      expect(intake.data).toEqual({ serviceId: 'cut-1' });
    }
  });

  it('obtiene precio y duración del Service canónico', () => {
    const config = business();
    const intake = analyzeReservationMessage(
      'Quiero un corte de cabello',
      config,
    );

    if (intake.serviceResolution?.status !== 'resolved') {
      throw new Error('Se esperaba un servicio resuelto');
    }

    expect(intake.serviceResolution.service).toBe(config.services[0]);
    expect(intake.serviceResolution.service.price).toBe(25_000);
    expect(intake.serviceResolution.service.durationMinutes).toBe(30);
  });

  it('permite validar el servicio reconocido mediante su ID', () => {
    const config = business();
    const intake = analyzeReservationMessage(
      'Quiero un corte de cabello',
      config,
    );

    if (intake.serviceResolution?.status !== 'resolved') {
      throw new Error('Se esperaba un servicio resuelto');
    }

    expect(
      validateService(config, intake.serviceResolution.service.id),
    ).toEqual({
      valid: true,
      value: config.services[0],
    });
  });

  it('conserva solo la fecha sin inventar la hora ni startsAt', () => {
    const intake = analyzeReservationMessage(
      'Quiero un corte mañana',
      business(),
      { now },
    );

    expect(intake.data).toEqual({
      serviceId: 'cut-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
    });
  });

  it('conserva solo la hora sin inventar la fecha ni startsAt', () => {
    const intake = analyzeReservationMessage(
      'Quiero un corte a las 3 de la tarde',
      business(),
      { now },
    );

    expect(intake.data).toEqual({
      serviceId: 'cut-1',
      requestedTime: '15:00',
    });
  });

  it('combina fecha y hora con la zona horaria del negocio', () => {
    const intake = analyzeReservationMessage(
      'Quiero un corte mañana a las 3 de la tarde',
      business(),
      { now },
    );

    expect(intake.data).toEqual({
      serviceId: 'cut-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
      requestedTime: '15:00',
      startsAt: new Date('2026-10-16T20:00:00.000Z'),
    });
  });

  it('conserva fecha y hora aunque el servicio no se resuelva', () => {
    const intake = analyzeReservationMessage(
      'Quiero reservar mañana a las 3 de la tarde',
      business(),
      { now },
    );

    expect(intake.serviceResolution).toEqual({ status: 'not-found' });
    expect(intake.data).toMatchObject({
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
      requestedTime: '15:00',
      startsAt: new Date('2026-10-16T20:00:00.000Z'),
    });
  });

  it('no asigna serviceId a un servicio inactivo', () => {
    const intake = analyzeReservationMessage('Quiero un peinado', business());

    expect(intake.analysis.catalog.map((entry) => entry.id)).toEqual(['cut-1']);
    expect(intake.serviceResolution).toEqual({ status: 'not-found' });
    expect(intake.data).toEqual({});
  });

  it('rechaza una configuración no validada antes de analizar la reserva', () => {
    expect(() =>
      analyzeReservationMessage('Quiero un corte', createDuplicateAliasBusiness()),
    ).toThrow(ConfigurationError);
  });
});
