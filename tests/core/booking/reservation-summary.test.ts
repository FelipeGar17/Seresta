import { describe, expect, it } from 'vitest';
import { parseBusinessConfig } from '../../../src/config/load-config.js';
import type { ConfiguracionNegocio } from '../../../src/core/types.js';
import {
  buildReservationSummary,
  formatReservationSummary,
} from '../../../src/core/booking/reservation-summary.js';

const business = (): ConfiguracionNegocio =>
  parseBusinessConfig({
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
    ],
    horariosAtencion: {
      friday: [{ abreA: '08:00', cierraA: '18:00' }],
    },
  });

const completeData = {
  serviceId: 'cut-1',
  requestedDate: new Date('2026-10-23T00:00:00.000Z'),
  requestedTime: '15:00',
  customerName: 'Camila',
};

describe('reservation summary', () => {
  it('uses canonical service data and calculates the end instant', () => {
    const summary = buildReservationSummary(business(), completeData);

    expect(summary).toBeDefined();
    expect(summary?.service.name).toBe('Corte de cabello');
    expect(summary?.service.price).toBe(25_000);
    expect(summary?.service.durationMinutes).toBe(30);
    expect(summary?.customerName).toBe('Camila');
    expect(summary?.startsAt).toEqual(
      new Date('2026-10-23T20:00:00.000Z'),
    );
    expect(summary?.endsAt).toEqual(
      new Date('2026-10-23T20:30:00.000Z'),
    );
  });

  it('formats date and time in the business time zone', () => {
    const config = business();
    const summary = buildReservationSummary(config, completeData);

    expect(summary).toBeDefined();

    const text = formatReservationSummary(summary!, config.timezone);

    expect(text).toContain('*Resumen de tu cita*');
    expect(text).toContain('Servicio: Corte de cabello');
    expect(text).toContain('Fecha: viernes, 23 de octubre de 2026');
    expect(text).toMatch(/Hora: 3:00 p\.\s*m\./u);
    expect(text).toContain('Nombre: Camila');
    expect(text).toContain('Duración: 30 minutos');
    expect(text).toContain('Precio: $25.000 COP');
  });

  it('does not build a summary when required data is missing', () => {
    expect(
      buildReservationSummary(business(), {
        ...completeData,
        customerName: '   ',
      }),
    ).toBeUndefined();
    expect(
      buildReservationSummary(business(), {
        ...completeData,
        requestedTime: undefined,
      }),
    ).toBeUndefined();
  });

  it('does not build a summary with an invalid service or schedule', () => {
    expect(
      buildReservationSummary(business(), {
        ...completeData,
        serviceId: 'missing-service',
      }),
    ).toBeUndefined();
    expect(
      buildReservationSummary(business(), {
        ...completeData,
        requestedTime: '25:00',
      }),
    ).toBeUndefined();
    expect(
      buildReservationSummary(business(), {
        ...completeData,
        requestedDate: new Date('invalid'),
      }),
    ).toBeUndefined();
  });
});
