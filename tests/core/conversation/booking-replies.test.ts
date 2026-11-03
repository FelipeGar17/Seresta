import { describe, expect, it } from 'vitest';
import type { ConfiguracionNegocio } from '../../../src/core/types.js';
import {
  getAvailabilityPeriodReply,
  getFieldPrompt,
  getScheduleRejectionReply,
} from '../../../src/core/conversation/booking-replies.js';

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

  it('presenta cada franja horaria en una línea separada', () => {
    const reply = getAvailabilityPeriodReply(
      Object.values(startsByPeriod).flat(),
      business,
    );

    expect(reply).toContain('✅ Encontré disponibilidad en la mañana, la tarde y la noche:');
    expect(reply).toContain('• 🌅 Mañana:');
    expect(reply).toContain('• 🌤️ Tarde:');
    expect(reply).toContain('• 🌙 Noche:');
    expect(reply).toContain('y otros horarios');
    expect(reply).toContain('🕒 ¿Qué hora prefieres?');
  });

  it('explica por qué necesita conocer el servicio antes de consultar', () => {
    expect(getFieldPrompt('serviceId', business)).toContain(
      'cada uno tiene una duración distinta',
    );
  });
});
