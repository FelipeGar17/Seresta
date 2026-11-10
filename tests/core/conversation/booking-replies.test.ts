import { describe, expect, it } from 'vitest';
import type { ConfiguracionNegocio } from '../../../src/core/types.js';
import {
  getAvailabilityReply,
  getFieldPrompt,
  getScheduleRejectionReply,
  getUnrecognizedFieldReply,
} from '../../../src/core/conversation/booking-replies.js';
import {
  OPTION_SELECTION_INSTRUCTION,
  parseOptionSelection,
} from '../../../src/core/conversation/offered-options.js';

const business: ConfiguracionNegocio = {
  businessId: 'business-1',
  name: 'Negocio',
  timezone: 'America/Bogota',
  whatsappNumber: '+573000000000',
  googleCalendarId: 'calendar-1',
  services: [],
  businessHours: {},
};
type TimePeriod = 'morning' | 'afternoon' | 'evening';

describe('getScheduleRejectionReply', () => {
  it('explica que la hora de hoy ya pasó y no cambia la fecha por su cuenta', () => {
    const reply = getScheduleRejectionReply(
      {
        status: 'invalid',
        field: 'requestedTime',
        reason: 'past-time',
        requestedStartsAt: new Date('2026-10-29T21:00:00.000Z'),
      },
      business,
      { requestedDate: new Date('2026-10-29T00:00:00.000Z') },
    );

    expect(reply).toContain('Esa hora ya pasó');
    expect(reply).toContain('No moveré la cita a otro día automáticamente');
  });
});

describe('getUnrecognizedFieldReply', () => {
  it('muestra la fecha calendario sin correrla un día', () => {
    const reply = getUnrecognizedFieldReply(
      'requestedTime',
      { requestedDate: new Date('2026-10-15T00:00:00.000Z') },
      business,
    );

    expect(reply).toContain('📅 Fecha: jueves, 15 de octubre de 2026');
  });
});

describe('respuestas de disponibilidad', () => {
  const startsByPeriod: Record<TimePeriod, Date[]> = {
    morning: [
      new Date('2026-10-16T14:00:00.000Z'),
      new Date('2026-10-16T14:30:00.000Z'),
      new Date('2026-10-16T15:00:00.000Z'),
      new Date('2026-10-16T15:30:00.000Z'),
    ],
    afternoon: [
      new Date('2026-10-16T19:00:00.000Z'),
      new Date('2026-10-16T19:30:00.000Z'),
    ],
    evening: [new Date('2026-10-16T23:00:00.000Z')],
  };

  it('presenta cada franja con horarios numerados y devuelve las opciones', () => {
    const starts = Object.values(startsByPeriod).flat();
    const { reply, options } = getAvailabilityReply(starts, business);

    expect(reply).toContain(
      '✅ Encontré disponibilidad en la mañana, la tarde y la noche:',
    );
    expect(reply).toContain('🌅 Mañana');
    expect(reply).toContain('1. 9:00 a. m.');
    expect(reply).toContain('5. 2:00 p. m.');
    expect(reply).toContain('🌙 Noche');
    expect(reply).toContain('7. 6:00 p. m.');
    expect(reply).toContain(OPTION_SELECTION_INSTRUCTION);
    expect(options).toEqual(starts);
  });

  it('limita la lista a nueve opciones numeradas', () => {
    const starts = Array.from(
      { length: 12 },
      (_, index) => new Date(`2026-10-16T14:${String(index * 5).padStart(2, '0')}:00.000Z`),
    );

    const { reply, options } = getAvailabilityReply(starts, business);

    expect(options).toHaveLength(9);
    expect(reply).toContain('…y más horarios disponibles');
    expect(reply).not.toContain('10.');
  });

  it('explica por qué necesita conocer el servicio antes de consultar', () => {
    expect(getFieldPrompt('serviceId', business)).toContain(
      'cada uno tiene una duración distinta',
    );
  });

  it('numera los servicios activos en el orden del catálogo', () => {
    const withServices: ConfiguracionNegocio = {
      ...business,
      services: [
        {
          id: 'cut-1',
          businessId: 'business-1',
          name: 'Corte de cabello',
          price: 25_000,
          durationMinutes: 30,
          active: true,
        },
        {
          id: 'cut-2',
          businessId: 'business-1',
          name: 'Corte y barba',
          price: 40_000,
          durationMinutes: 45,
          active: true,
        },
        {
          id: 'cut-3',
          businessId: 'business-1',
          name: 'Servicio inactivo',
          price: 10_000,
          durationMinutes: 15,
          active: false,
        },
      ],
    };

    const reply = getFieldPrompt('serviceId', withServices);

    expect(reply).toContain('1. Corte de cabello');
    expect(reply).toContain('2. Corte y barba');
    expect(reply).not.toContain('Servicio inactivo');
    expect(reply).toContain(OPTION_SELECTION_INSTRUCTION);
  });
});

describe('parseOptionSelection', () => {
  it('acepta solo un número de opción aislado', () => {
    expect(parseOptionSelection('2')).toBe(2);
    expect(parseOptionSelection('opcion 3')).toBe(3);
    expect(parseOptionSelection('opcion numero 1')).toBe(1);
    expect(parseOptionSelection('2 personas')).toBeUndefined();
    expect(parseOptionSelection('12')).toBeUndefined();
    expect(parseOptionSelection('0')).toBeUndefined();
    expect(parseOptionSelection('corte 2')).toBeUndefined();
  });
});
