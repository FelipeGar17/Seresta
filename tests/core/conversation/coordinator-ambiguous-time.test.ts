import { describe, expect, it } from 'vitest';
import type { ConfiguracionNegocio } from '../../../src/core/types.js';
import { parseBusinessConfig } from '../../../src/config/load-config.js';
import { ConversationCoordinator } from '../../../src/core/conversation/coordinator.js';
import { MemoryConversationStore } from '../../../src/core/conversation/memory-store.js';

// Jueves; "mañana" = viernes 2026-10-16. El viernes se atiende de 08:00 a 18:00.
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
    ],
    horariosAtencion: {
      friday: [{ abreA: '08:00', cierraA: '18:00' }],
    },
  });

const setup = () => {
  const store = new MemoryConversationStore();
  const coordinator = new ConversationCoordinator(store, {
    now: () => now,
    idFactory: () => 'conversation-1',
  });
  const config = business();
  const say = (message: string) =>
    coordinator.handleMessage({
      business: config,
      contactId: 'contact-1',
      whatsappId: 'whatsapp-contact-1',
      customerPhone: '+573001112233',
      message,
    });
  return { say };
};

// Deja la reserva esperando la hora, con servicio y fecha ya guardados.
const untilTime = async (say: ReturnType<typeof setup>['say']) => {
  await say('Quiero un corte de cabello mañana');
};

const FRIDAY = new Date('2026-10-16T00:00:00.000Z');

describe('coordinador — hora ambigua', () => {
  it('«a las 4» pide aclarar mañana o tarde sin guardar hora ni avanzar', async () => {
    const { say } = setup();
    await untilTime(say);
    const result = await say('a las 4');

    expect(result.reply).toMatch(/Las 4 son de la mañana o de la tarde/);
    expect(result.nextField).toBe('requestedTime');
    expect(result.conversation.state).toBe('collecting-time');
    expect(result.conversation.data.requestedTime).toBeUndefined();
    expect(result.conversation.data.ambiguousTime).toEqual({
      hour: 4,
      minute: 0,
    });
    expect(result.conversation.data.startsAt).toBeUndefined();
    // Los datos ya recopilados no cambian.
    expect(result.conversation.data.serviceId).toBe('cut-1');
    expect(result.conversation.data.requestedDate).toEqual(FRIDAY);
  });

  it('«de la tarde» completa 16:00, valida y avanza al nombre', async () => {
    const { say } = setup();
    await untilTime(say);
    await say('a las 4');
    const result = await say('de la tarde');

    expect(result.conversation.data.requestedTime).toBe('16:00');
    expect(result.conversation.data.ambiguousTime).toBeUndefined();
    expect(result.conversation.data.startsAt?.toISOString()).toBe(
      '2026-10-16T21:00:00.000Z',
    );
    expect(result.conversation.data.endsAt?.toISOString()).toBe(
      '2026-10-16T21:30:00.000Z',
    );
    expect(result.conversation.data.occupiedEndsAt).toBeDefined();
    expect(result.nextField).toBe('customerName');
    expect(result.conversation.state).toBe('collecting-customer-data');
    expect(result.conversation.data.serviceId).toBe('cut-1');
    expect(result.conversation.data.requestedDate).toEqual(FRIDAY);
  });

  it.each(['pm', 'la tarde', 'en la tarde', 'tarde'])(
    'la aclaración «%s» resuelve la hora a 16:00',
    async (clarification) => {
      const { say } = setup();
      await untilTime(say);
      await say('a las 4');
      const result = await say(clarification);

      expect(result.conversation.data.requestedTime).toBe('16:00');
      expect(result.nextField).toBe('customerName');
    },
  );

  it.each(['de la mañana', 'am', 'la mañana'])(
    'la aclaración «%s» da 04:00, que se rechaza por estar fuera de horario',
    async (clarification) => {
      const { say } = setup();
      await untilTime(say);
      await say('a las 4');
      const result = await say(clarification);

      expect(result.reply).toMatch(/horario de atención/i);
      expect(result.nextField).toBe('requestedTime');
      expect(result.conversation.state).toBe('collecting-time');
      expect(result.conversation.data.requestedTime).toBeUndefined();
      expect(result.conversation.data.ambiguousTime).toBeUndefined();
      expect(result.conversation.data.startsAt).toBeUndefined();
      expect(result.conversation.data.serviceId).toBe('cut-1');
      expect(result.conversation.data.requestedDate).toEqual(FRIDAY);
    },
  );

  it('tras rechazar la hora se puede dar otra y continuar', async () => {
    const { say } = setup();
    await untilTime(say);
    await say('a las 4');
    await say('am');
    const result = await say('3 pm');

    expect(result.conversation.data.requestedTime).toBe('15:00');
    expect(result.nextField).toBe('customerName');
  });

  it('una aclaración que no indica periodo vuelve a preguntar sin guardar hora', async () => {
    const { say } = setup();
    await untilTime(say);
    await say('a las 4');
    const result = await say('no sé');

    expect(result.reply).toMatch(/mañana o de la tarde/);
    expect(result.conversation.data.requestedTime).toBeUndefined();
    expect(result.conversation.data.ambiguousTime).toEqual({
      hour: 4,
      minute: 0,
    });
  });

  it('una hora completa posterior reemplaza la ambigua', async () => {
    const { say } = setup();
    await untilTime(say);
    await say('a las 4');
    const result = await say('mejor a las 5 pm');

    expect(result.conversation.data.requestedTime).toBe('17:00');
    expect(result.conversation.data.ambiguousTime).toBeUndefined();
  });

  it('una consulta de precio durante la aclaración la retoma sin perder datos', async () => {
    const { say } = setup();
    await untilTime(say);
    await say('a las 4');
    const result = await say('¿Cuánto cuesta el corte de cabello?');

    expect(result.reply).toContain('$25.000');
    expect(result.reply).toMatch(/mañana o de la tarde/);
    expect(result.conversation.data.ambiguousTime).toEqual({
      hour: 4,
      minute: 0,
    });
    expect(result.conversation.data.requestedTime).toBeUndefined();
  });
});

describe('coordinador — variantes de hora en una reserva', () => {
  it.each([
    ['a las 4 de la tarde', '16:00', 'customerName'],
    ['a las 4 pm', '16:00', 'customerName'],
    ['16:00', '16:00', 'customerName'],
    ['a las 16:00', '16:00', 'customerName'],
  ])('«%s» se acepta como %s', async (message, time, nextField) => {
    const { say } = setup();
    await untilTime(say);
    const result = await say(message);

    expect(result.conversation.data.requestedTime).toBe(time);
    expect(result.conversation.data.ambiguousTime).toBeUndefined();
    expect(result.nextField).toBe(nextField);
  });

  it.each(['a las 4 de la mañana', 'a las 4 am'])(
    '«%s» se rechaza por fuera del horario, sin guardar la hora',
    async (message) => {
      const { say } = setup();
      await untilTime(say);
      const result = await say(message);

      expect(result.reply).toMatch(/horario de atención/i);
      expect(result.conversation.data.requestedTime).toBeUndefined();
      expect(result.conversation.data.ambiguousTime).toBeUndefined();
      expect(result.nextField).toBe('requestedTime');
    },
  );

  it('la fecha, el servicio y la hora ambigua en un solo mensaje', async () => {
    const { say } = setup();
    const result = await say('Quiero un corte de cabello mañana a las 4');

    expect(result.conversation.data).toMatchObject({
      serviceId: 'cut-1',
      requestedDate: FRIDAY,
      ambiguousTime: { hour: 4, minute: 0 },
    });
    expect(result.conversation.data.requestedTime).toBeUndefined();
    expect(result.reply).toMatch(/mañana o de la tarde/);
    expect(result.nextField).toBe('requestedTime');
  });
});

describe('coordinador — cambiar la hora con una hora ambigua', () => {
  it('en awaiting-confirmation pide aclarar, conserva datos y limpia derivados', async () => {
    const { say } = setup();
    const full = await say(
      'Quiero un corte de cabello mañana a las 3 pm, me llamo Carlos',
    );
    expect(full.conversation.state).toBe('awaiting-confirmation');

    const result = await say('quiero cambiar la hora a las 4');

    expect(result.reply).toMatch(/Las 4 son de la mañana o de la tarde/);
    expect(result.conversation.state).toBe('collecting-time');
    expect(result.conversation.data.requestedTime).toBeUndefined();
    expect(result.conversation.data.startsAt).toBeUndefined();
    expect(result.conversation.data.endsAt).toBeUndefined();
    expect(result.conversation.data.occupiedEndsAt).toBeUndefined();
    expect(result.conversation.data).toMatchObject({
      serviceId: 'cut-1',
      customerName: 'Carlos',
      requestedDate: FRIDAY,
    });

    const clarified = await say('de la tarde');
    expect(clarified.conversation.data.requestedTime).toBe('16:00');
    expect(clarified.conversation.state).toBe('awaiting-confirmation');
    expect(clarified.conversation.data.startsAt?.toISOString()).toBe(
      '2026-10-16T21:00:00.000Z',
    );
    expect(clarified.conversation.data.customerName).toBe('Carlos');
  });
});
