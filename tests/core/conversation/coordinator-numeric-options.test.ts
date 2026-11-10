import { describe, expect, it } from 'vitest';
import type { ConfiguracionNegocio } from '../../../src/core/types.js';
import { parseBusinessConfig } from '../../../src/config/load-config.js';
import { ConversationCoordinator } from '../../../src/core/conversation/coordinator.js';
import { MemoryConversationStore } from '../../../src/core/conversation/memory-store.js';
import { MemoryReservationRepository } from '../../../src/core/reservations/memory-reservation-repository.js';
import type { ReservationCalendar } from '../../../src/core/reservations/reservation-calendar.js';
import { formatBusinessTime24 } from '../../../src/core/time/business-time.js';

// Jueves 15 de octubre de 2026, 10:00 en America/Bogota.
const now = new Date('2026-10-15T15:00:00.000Z');

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
      {
        id: 'cut-beard',
        nombre: 'Corte y barba',
        aliases: ['corte con barba'],
        precio: 40_000,
        duracionMinutos: 45,
        activo: true,
      },
    ],
    horariosAtencion: {
      friday: [{ abreA: '08:00', cierraA: '18:00' }],
    },
  });

const emptyCalendar = (): ReservationCalendar => ({
  async listBusyAppointments() {
    return [];
  },
  async createReservationEvent() {
    return 'event-1';
  },
  async deleteReservationEvent() {},
});

const setup = (calendar: ReservationCalendar = emptyCalendar()) => {
  const store = new MemoryConversationStore();
  const reservations = new MemoryReservationRepository();
  let conversationNumber = 0;

  return {
    store,
    reservations,
    coordinator: new ConversationCoordinator(store, {
      now: () => now,
      idFactory: () => `conversation-${++conversationNumber}`,
      reservations,
      calendar,
    }),
    input: (message: string) => ({
      business: business(),
      contactId: 'contact-1',
      whatsappId: 'whatsapp-contact-1',
      customerPhone: '+573001112233',
      message,
    }),
  };
};

describe('listas numeradas', () => {
  it('selecciona un servicio por número dentro de una reserva', async () => {
    const { coordinator, input } = setup();

    const prompt = await coordinator.handleMessage(
      input('Quiero agendar una cita'),
    );
    expect(prompt.reply).toContain('1. Corte de cabello');
    expect(prompt.reply).toContain('2. Corte y barba');
    expect(prompt.conversation.offeredOptions).toEqual({
      kind: 'service',
      values: ['cut-1', 'cut-beard'],
    });

    const selected = await coordinator.handleMessage(input('2'));
    expect(selected.conversation.data.serviceId).toBe('cut-beard');
    expect(selected.conversation.state).toBe('collecting-date');
    expect(selected.reply).toMatch(/para qué fecha/i);
  });

  it('selecciona un horario por número y conserva el instante ofrecido', async () => {
    const { coordinator, input } = setup();

    const prompt = await coordinator.handleMessage(
      input('Quiero un corte para mañana'),
    );
    expect(prompt.conversation.state).toBe('collecting-time');
    const options = prompt.conversation.offeredOptions;
    expect(options?.kind).toBe('time');
    expect(options?.values).toHaveLength(9);
    expect(prompt.reply).toContain('2. ');

    const second = options?.values[1];
    if (!second) {
      throw new Error('La segunda opción de horario debe estar disponible.');
    }

    const selected = await coordinator.handleMessage(input('2'));
    expect(selected.conversation.data.requestedTime).toBe(
      formatBusinessTime24(new Date(second), 'America/Bogota'),
    );
    expect(selected.conversation.data.startsAt?.toISOString()).toBe(second);
    expect(selected.conversation.state).toBe('collecting-customer-data');
  });

  it('no interpreta un número cuando el último mensaje no ofrece la lista', async () => {
    const { coordinator, input } = setup();

    await coordinator.handleMessage(input('Quiero agendar una cita'));
    await coordinator.handleMessage(input('1'));

    const numeric = await coordinator.handleMessage(input('2'));
    expect(numeric.conversation.data.serviceId).toBe('cut-1');
    expect(numeric.conversation.state).toBe('collecting-date');
    expect(numeric.conversation.offeredOptions).toBeUndefined();
  });

  it('mantiene el menú de entrada con sus propias opciones', async () => {
    const { coordinator, input } = setup();

    const welcome = await coordinator.handleMessage(input('Hola'));
    expect(welcome.reply).toContain('1. 📅 Iniciar una reserva');

    const catalog = await coordinator.handleMessage(input('2'));
    expect(catalog.conversation.intent).toBe('check-prices');
    expect(catalog.reply).toMatch(/servicios y precios|precios/i);
  });

  it('consulta disponibilidad eligiendo servicio y hora por número', async () => {
    const { coordinator, input, reservations } = setup();

    const query = await coordinator.handleMessage(
      input('¿Tienen disponibilidad para mañana?'),
    );
    expect(query.conversation.state).toBe('checking-availability');
    expect(query.conversation.offeredOptions?.kind).toBe('service');

    const withService = await coordinator.handleMessage(input('2'));
    expect(withService.conversation.data.serviceId).toBe('cut-beard');
    expect(withService.nextField).toBe('requestedTime');
    expect(withService.conversation.offeredOptions?.kind).toBe('time');

    const offeredStart = withService.conversation.offeredOptions?.values[0];
    expect(offeredStart).toBeDefined();

    const available = await coordinator.handleMessage(input('1'));
    expect(available.reply).toMatch(/^✅ Sí,/);
    expect(available.reply).toMatch(/no he creado ninguna cita/i);
    await expect(
      reservations.listBlockingAppointments(
        'business-1',
        new Date('2026-10-16T00:00:00.000Z'),
        new Date('2026-10-17T00:00:00.000Z'),
      ),
    ).resolves.toEqual([]);
  });
});
