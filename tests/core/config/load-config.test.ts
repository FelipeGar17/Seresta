import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  loadBusinessConfig,
  parseBusinessConfig,
} from '../../../src/config/load-config.js';
import { analyzeReservationMessage } from '../../../src/core/booking/reservation-intake.js';

const validConfig = {
  businessId: 'business-1',
  nombre: 'Barbería Ejemplo',
  zonaHoraria: 'America/Bogota',
  whatsappNumero: '+573000000000',
  calendarId: 'calendar-1',
  servicios: [
    {
      id: 'cut-1',
      nombre: 'Corte de cabello',
      aliases: ['corte'],
      precio: 25000,
      duracionMinutos: 30,
      activo: true,
    },
  ],
  metodosPago: ['efectivo'],
  horariosAtencion: {
    monday: [{ abreA: '08:00', cierraA: '18:00' }],
  },
  cierres: [{ fecha: '2026-12-25', motivo: 'Festivo' }],
  politicaReservas: {
    anticipacionMinimaMinutos: 60,
    maximoDiasAnticipacion: 10,
  },
};

const tempDirectory = join(process.cwd(), '.tmp-config-tests');

afterEach(() => {
  rmSync(tempDirectory, { recursive: true, force: true });
});

describe('parseBusinessConfig', () => {
  it('mapea el contrato externo al modelo interno', () => {
    const config = parseBusinessConfig(validConfig);

    expect(config).toEqual({
      businessId: 'business-1',
      name: 'Barbería Ejemplo',
      timezone: 'America/Bogota',
      whatsappNumber: '+573000000000',
      googleCalendarId: 'calendar-1',
      services: [
        {
          id: 'cut-1',
          businessId: 'business-1',
          name: 'Corte de cabello',
          description: undefined,
          aliases: ['corte'],
          price: 25000,
          durationMinutes: 30,
          active: true,
        },
      ],
      paymentMethods: ['efectivo'],
      businessHours: {
        monday: [{ opensAt: '08:00', closesAt: '18:00' }],
      },
      closures: [{ date: '2026-12-25', reason: 'Festivo' }],
      bookingPolicy: {
        minimumNoticeMinutes: 60,
        maxDaysAhead: 10,
        appointmentIntervalMinutes: 30,
      },
    });
  });

  it('usa 30 minutos como intervalo por defecto', () => {
    const config = parseBusinessConfig({
      ...validConfig,
      politicaReservas: undefined,
    });

    expect(config.bookingPolicy?.appointmentIntervalMinutes).toBe(30);
  });

  it('lee el intervalo desde politicaReservas', () => {
    const config = parseBusinessConfig({
      ...validConfig,
      politicaReservas: {
        ...validConfig.politicaReservas,
        intervaloAgendaMinutos: 15,
      },
    });

    expect(config.bookingPolicy?.appointmentIntervalMinutes).toBe(15);
  });

  it('acepta el alias superior intervaloAgendaMinutos', () => {
    const config = parseBusinessConfig({
      ...validConfig,
      politicaReservas: undefined,
      intervaloAgendaMinutos: 60,
    });

    expect(config.bookingPolicy?.appointmentIntervalMinutes).toBe(60);
  });

  it.each([
    ['cero', 0],
    ['negativo', -15],
    ['decimal', 15.5],
    ['demasiado grande', 1441],
  ])('rechaza un intervalo de agenda %s', (_label, interval) => {
    expect(() =>
      parseBusinessConfig({
        ...validConfig,
        politicaReservas: {
          ...validConfig.politicaReservas,
          intervaloAgendaMinutos: interval,
        },
      }),
    ).toThrow(/intervaloAgendaMinutos/);
  });

  it('rechaza un intervalo duplicado con valores distintos', () => {
    expect(() =>
      parseBusinessConfig({
        ...validConfig,
        intervaloAgendaMinutos: 15,
        politicaReservas: {
          ...validConfig.politicaReservas,
          intervaloAgendaMinutos: 30,
        },
      }),
    ).toThrow(/no puede diferir/);
  });

  it.each([
    ['businessId', { businessId: '' }],
    ['nombre', { nombre: '' }],
    ['zonaHoraria', { zonaHoraria: 'Invalid/Zone' }],
    ['whatsappNumero', { whatsappNumero: '' }],
    ['calendarId', { calendarId: '' }],
    ['servicios', { servicios: undefined }],
    ['horariosAtencion', { horariosAtencion: undefined }],
  ])('rechaza el campo obligatorio %s', (_field, override) => {
    expect(() => parseBusinessConfig({ ...validConfig, ...override })).toThrow(
      ConfigurationError,
    );
  });

  it('rechaza horarios inválidos y superpuestos', () => {
    expect(() =>
      parseBusinessConfig({
        ...validConfig,
        horariosAtencion: {
          monday: [
            { abreA: '10:00', cierraA: '09:00' },
          ],
        },
      }),
    ).toThrow(/horariosAtencion\.monday/);
  });

  it('rechaza un horario sin días operativos', () => {
    expect(() =>
      parseBusinessConfig({
        ...validConfig,
        horariosAtencion: {},
      }),
    ).toThrow(/horariosAtencion/);
  });

  it('rechaza políticas inválidas', () => {
    expect(() =>
      parseBusinessConfig({
        ...validConfig,
        politicaReservas: { maximoDiasAnticipacion: -1 },
      }),
    ).toThrow(/politicaReservas\.maximoDiasAnticipacion/);
  });

  it('rechaza cierres con fechas inválidas o duplicadas', () => {
    expect(() =>
      parseBusinessConfig({
        ...validConfig,
        cierres: [{ fecha: '2026-02-30' }],
      }),
    ).toThrow(/cierres\[0\]\.fecha/);

    expect(() =>
      parseBusinessConfig({
        ...validConfig,
        cierres: [{ fecha: '2026-12-25' }, { fecha: '2026-12-25' }],
      }),
    ).toThrow(/cierres\[1\]\.fecha/);
  });

  it('rechaza IDs y servicios pertenecientes a otro negocio', () => {
    expect(() =>
      parseBusinessConfig({
        ...validConfig,
        servicios: [
          validConfig.servicios[0],
          { ...validConfig.servicios[0], id: 'cut-1' },
        ],
      }),
    ).toThrow(/servicios\[1\]\.id/);

    expect(() =>
      parseBusinessConfig({
        ...validConfig,
        servicios: [
          { ...validConfig.servicios[0], businessId: 'business-2' },
        ],
      }),
    ).toThrow(/servicios\[0\]\.businessId/);
  });

  it('rechaza nombres y alias vacíos o en conflicto', () => {
    expect(() =>
      parseBusinessConfig({
        ...validConfig,
        servicios: [{ ...validConfig.servicios[0], aliases: [''] }],
      }),
    ).toThrow(/servicios\[0\]\.aliases/);

    expect(() =>
      parseBusinessConfig({
        ...validConfig,
        servicios: [
          validConfig.servicios[0],
          {
            ...validConfig.servicios[0],
            id: 'cut-2',
            nombre: 'Barba',
            aliases: ['Corte de cabello'],
          },
        ],
      }),
    ).toThrow(/conflicto/);
  });

  it('rechaza precios y duraciones inválidos', () => {
    expect(() =>
      parseBusinessConfig({
        ...validConfig,
        servicios: [{ ...validConfig.servicios[0], precio: -1 }],
      }),
    ).toThrow(/servicios\[0\]\.precio/);

    expect(() =>
      parseBusinessConfig({
        ...validConfig,
        servicios: [{ ...validConfig.servicios[0], duracionMinutos: 0 }],
      }),
    ).toThrow(/servicios\[0\]\.duracionMinutos/);
  });
});

describe('loadBusinessConfig', () => {
  it('lee un JSON válido desde un archivo', () => {
    mkdirSync(tempDirectory, { recursive: true });
    const filePath = join(tempDirectory, 'negocio.json');
    writeFileSync(filePath, JSON.stringify(validConfig), 'utf8');

    expect(loadBusinessConfig(filePath).businessId).toBe('business-1');
  });

  it('reporta JSON inválido', () => {
    mkdirSync(tempDirectory, { recursive: true });
    const filePath = join(tempDirectory, 'negocio.json');
    writeFileSync(filePath, '{ inválido', 'utf8');

    expect(() => loadBusinessConfig(filePath)).toThrow(/JSON inválido/);
  });

  it('integra un archivo JSON real con la resolución de reservas', () => {
    mkdirSync(tempDirectory, { recursive: true });
    const filePath = join(tempDirectory, 'negocio-integracion.json');
    writeFileSync(filePath, JSON.stringify(validConfig), 'utf8');

    try {
      const business = loadBusinessConfig(filePath);
      const intake = analyzeReservationMessage(
        'Quiero reservar un corte de cabello',
        business,
      );

      expect(business.services[0]).toMatchObject({
        id: 'cut-1',
        name: 'Corte de cabello',
        aliases: ['corte'],
        price: 25000,
        durationMinutes: 30,
      });
      expect(intake.serviceResolution).toMatchObject({
        status: 'resolved',
        service: business.services[0],
      });
      expect(intake.data).toEqual({ serviceId: 'cut-1' });

      const manualConfig = { ...business };
      expect(() =>
        analyzeReservationMessage('Quiero reservar un corte de cabello', manualConfig),
      ).toThrow(/loadBusinessConfig|parseBusinessConfig/);

      const emptySchedulePath = join(tempDirectory, 'sin-horarios.json');
      writeFileSync(
        emptySchedulePath,
        JSON.stringify({ ...validConfig, horariosAtencion: {} }),
        'utf8',
      );
      expect(() => loadBusinessConfig(emptySchedulePath)).toThrow(
        /horariosAtencion/,
      );
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
