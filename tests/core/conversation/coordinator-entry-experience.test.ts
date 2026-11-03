import { describe, expect, it } from 'vitest';
import { parseBusinessConfig } from '../../../src/config/load-config.js';
import { ConversationCoordinator } from '../../../src/core/conversation/coordinator.js';
import { MemoryConversationStore } from '../../../src/core/conversation/memory-store.js';

const now = new Date('2026-10-15T15:00:00.000Z');

const setup = (durationMinutes = 45) => {
  const business = parseBusinessConfig({
    businessId: 'business-1',
    nombre: 'Barbería Central',
    zonaHoraria: 'America/Bogota',
    whatsappNumero: '+573000000000',
    calendarId: 'calendar-1',
    servicios: [
      {
        id: 'cut-1',
        nombre: 'Corte de cabello',
        precio: 25_000,
        duracionMinutos: durationMinutes,
        activo: true,
      },
    ],
    horariosAtencion: {
      friday: [
        { abreA: '09:00', cierraA: '12:00' },
        { abreA: '14:00', cierraA: '19:00' },
      ],
    },
    politicaReservas: { intervaloAgendaMinutos: 30 },
  });
  let id = 0;
  const coordinator = new ConversationCoordinator(
    new MemoryConversationStore(),
    { now: () => now, idFactory: () => `conversation-${++id}` },
  );
  const say = (message: string) =>
    coordinator.handleMessage({
      business,
      contactId: 'contact-1',
      whatsappId: 'whatsapp-contact-1',
      message,
    });

  return { say };
};

describe('coordinador — orientación inicial', () => {
  it.each([
    ['1', 'book-appointment'],
    ['opción 2', 'check-prices'],
    ['3', 'cancel-appointment'],
  ] as const)(
    'interpreta la opción %s solo después de mostrar el menú',
    async (choice, intent) => {
      const { say } = setup();
      await say('hola');

      const result = await say(choice);

      expect(result.conversation.intent).toBe(intent);
      if (intent === 'book-appointment') {
        expect(result.conversation.state).toBe('collecting-service');
        expect(result.nextField).toBe('serviceId');
        expect(result.reply).toMatch(/¿qué servicio deseas agendar/i);
        expect(result.reply).not.toMatch(/no logré reconocer ese dato/i);
      } else if (intent === 'check-prices') {
        expect(result.reply).toContain('Corte de cabello');
        expect(result.reply).toContain('Responde 1, 2 o 3.');
      } else {
        expect(result.reply).toMatch(/no encuentro citas confirmadas/i);
      }
    },
  );

  it('no interpreta un número como opción si todavía no mostró el menú', async () => {
    const { say } = setup();
    const result = await say('1');

    expect(result.conversation.intent).toBe('unknown');
    expect(result.conversation.state).toBe('idle');
    expect(result.reply).toContain('Responde 1, 2 o 3.');
  });

  it('permite iniciar una reserva con el menú que sigue al catálogo', async () => {
    const { say } = setup();
    await say('¿qué servicios tienen?');

    const result = await say('1');

    expect(result.conversation.intent).toBe('book-appointment');
    expect(result.conversation.state).toBe('collecting-service');
    expect(result.nextField).toBe('serviceId');
    expect(result.reply).toMatch(/¿qué servicio deseas agendar/i);
    expect(result.reply).not.toMatch(/no logré reconocer ese dato/i);
  });

  it('no interpreta opciones del menú durante una reserva activa', async () => {
    const { say } = setup();
    await say('quiero agendar una cita');

    const result = await say('1');

    expect(result.conversation.state).toBe('collecting-service');
    expect(result.conversation.data.serviceId).toBeUndefined();
    expect(result.nextField).toBe('serviceId');
    expect(result.reply).toMatch(/no logré reconocer ese dato/i);
  });

  it('un saludo ofrece opciones sin dar a entender que la reserva ya empezó', async () => {
    const { say } = setup();
    const result = await say('hola');

    expect(result.conversation.state).toBe('idle');
    expect(result.conversation.data).toEqual({});
    expect(result.nextField).toBeNull();
    expect(result.reply).toMatch(/agendar una cita/i);
    expect(result.reply).toMatch(/consultar servicios y precios/i);
    expect(result.reply).toMatch(/cancelar una cita confirmada/i);
    expect(result.reply).not.toMatch(/¿qué servicio deseas/i);
  });

  it('un saludo combinado con consulta de servicios responde directamente al catálogo', async () => {
    const { say } = setup();
    const result = await say('Hola, ¿qué servicios tienen?');

    expect(result.reply).toContain('Corte de cabello');
    expect(result.reply).toContain('Responde 1, 2 o 3.');
    expect(result.reply).not.toMatch(/¡Hola! 👋 Bienvenido/i);
    expect(result.conversation.intent).toBe('list-services');
    expect(result.conversation.state).toBe('idle');
  });

  it.each(['blorf', '.'])(
    'el primer mensaje sin intención detectable recibe un saludo cordial: "%s"',
    async (message) => {
      const { say } = setup();
      const result = await say(message);

      expect(result.conversation.state).toBe('idle');
      expect(result.reply).toMatch(/¡hola!/i);
      expect(result.reply).toContain('Barbería Central');
      expect(result.reply).not.toMatch(/no alcancé a identificar/i);
      expect(result.reply).toMatch(/agendar una cita/i);
      expect(result.reply).toMatch(/consultar servicios y precios/i);
      expect(result.reply).toMatch(/cancelar una cita confirmada/i);
    },
  );

  it('si el mensaje siguiente tampoco se entiende, explica el problema y ofrece acciones', async () => {
    const { say } = setup();
    await say('.');

    const result = await say('blorf');

    expect(result.conversation.state).toBe('idle');
    expect(result.reply).toMatch(/no alcancé a identificar/i);
    expect(result.reply).toMatch(/agendar una cita/i);
    expect(result.reply).toMatch(/consultar servicios y precios/i);
    expect(result.reply).toMatch(/cancelar una cita confirmada/i);
  });

  it('un "sí" aislado en estado idle no se interpreta como confirmación previa', async () => {
    const { say } = setup();
    await say('hola');

    const result = await say('sí');

    expect(result.conversation.state).toBe('idle');
    expect(result.conversation.intent).toBe('unknown');
    expect(result.reply).toMatch(/no alcancé a identificar/i);
    expect(result.reply).toMatch(/agendar una cita/i);
  });

  it('si no reconoce un dato durante la reserva, conserva el estado y da un ejemplo', async () => {
    const { say } = setup();
    await say('quiero agendar una cita');

    const result = await say('blorf');

    expect(result.conversation.state).toBe('collecting-service');
    expect(result.conversation.data).toEqual({});
    expect(result.nextField).toBe('serviceId');
    expect(result.reply).toMatch(/no logré reconocer ese dato/i);
    expect(result.reply).toMatch(/escribe el nombre del servicio/i);
    expect(result.reply).toContain('Corte de cabello');
    expect(result.reply).toMatch(/¿qué servicios tienen\?/i);
  });

  it('responde una consulta de servicios y guía para elegir uno en la reserva', async () => {
    const { say } = setup();
    await say('quiero agendar una cita');

    const catalog = await say('¿qué servicios tienen?');

    expect(catalog.conversation.state).toBe('collecting-service');
    expect(catalog.reply).toContain('Corte de cabello');
    expect(catalog.reply).toMatch(/elige|escribe el nombre/i);

    const selected = await say('Corte de cabello');
    expect(selected.conversation.state).toBe('collecting-date');
    expect(selected.conversation.data.serviceId).toBe('cut-1');
  });
});

describe('coordinador — descansos entre tramos de atención', () => {
  it('rechaza una hora durante el almuerzo y explica los horarios del día', async () => {
    const { say } = setup();
    const result = await say(
      'Quiero un corte de cabello mañana a las 12:30 pm',
    );

    expect(result.conversation.state).toBe('collecting-time');
    expect(result.nextField).toBe('requestedTime');
    expect(result.conversation.data.requestedTime).toBeUndefined();
    expect(result.conversation.data.startsAt).toBeUndefined();
    expect(result.reply).toMatch(/no cabe en el horario de atención/i);
    expect(result.reply).toMatch(/viernes atendemos de 09:00–12:00 y 14:00–19:00/i);
    expect(result.reply).toMatch(/otra hora dentro de esos tramos/i);
  });

  it.each([
    ['9 am', '09:00'],
    ['10 am', '10:00'],
    ['3 pm', '15:00'],
  ])('acepta una hora dentro del tramo de trabajo: %s', async (time, expected) => {
    const { say } = setup();
    const result = await say(
      `Quiero un corte de cabello mañana a las ${time}`,
    );

    expect(result.conversation.data.requestedTime).toBe(expected);
    expect(result.conversation.state).toBe('collecting-customer-data');
    expect(result.nextField).toBe('customerName');
  });

  it('permite que un servicio termine exactamente a las 12:00', async () => {
    const { say } = setup(30);
    const result = await say(
      'Quiero un corte de cabello mañana a las 11:30 am',
    );

    expect(result.conversation.state).toBe('collecting-customer-data');
    expect(result.nextField).toBe('customerName');
    expect(result.conversation.data).toMatchObject({
      requestedTime: '11:30',
      startsAt: new Date('2026-10-16T16:30:00.000Z'),
      endsAt: new Date('2026-10-16T17:00:00.000Z'),
    });
  });

  it('permite iniciar una cita exactamente a las 14:00', async () => {
    const { say } = setup();
    const result = await say(
      'Quiero un corte de cabello mañana a las 2 pm',
    );

    expect(result.conversation.state).toBe('collecting-customer-data');
    expect(result.nextField).toBe('customerName');
    expect(result.conversation.data).toMatchObject({
      requestedTime: '14:00',
      startsAt: new Date('2026-10-16T19:00:00.000Z'),
      endsAt: new Date('2026-10-16T19:45:00.000Z'),
    });
  });
});
