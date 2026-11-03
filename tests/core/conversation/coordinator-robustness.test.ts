import { describe, expect, it } from 'vitest';
import { parseBusinessConfig } from '../../../src/config/load-config.js';
import { ConversationCoordinator } from '../../../src/core/conversation/coordinator.js';
import { MemoryConversationStore } from '../../../src/core/conversation/memory-store.js';

// Jueves; «mañana» = viernes 2026-10-16 (08:00–18:00).
const now = new Date('2026-10-15T15:00:00.000Z');

const business = () =>
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
    horariosAtencion: { friday: [{ abreA: '08:00', cierraA: '18:00' }] },
  });

const setup = () => {
  const coordinator = new ConversationCoordinator(
    new MemoryConversationStore(),
    { now: () => now, idFactory: () => 'conversation-1' },
  );
  const config = business();
  return (message: string) =>
    coordinator.handleMessage({
      business: config,
      contactId: 'contact-1',
      whatsappId: 'whatsapp-contact-1',
      customerPhone: '+573001112233',
      message,
    });
};

// Deja la reserva completa en awaiting-confirmation (viernes 15:00, Carlos).
const toConfirmation = async (say: ReturnType<typeof setup>) => {
  await say('Quiero un corte de cabello mañana a las 3 pm');
  return say('me llamo Carlos');
};

const DERIVED = {
  startsAt: new Date('2026-10-16T20:00:00.000Z'),
  endsAt: new Date('2026-10-16T20:30:00.000Z'),
  occupiedEndsAt: new Date('2026-10-16T20:30:00.000Z'),
};

describe('coordinador — negación de cancelación', () => {
  it.each([
    'no cancelar, mejor cambiar la hora a las 4 pm',
    'no cancelar la cita, cambia la hora a las 4 pm',
  ])('«%s» no cancela y aplica el cambio', async (message) => {
    const say = setup();
    await toConfirmation(say);
    const result = await say(message);

    expect(result.conversation.state).toBe('awaiting-confirmation');
    expect(result.conversation.data).toMatchObject({
      serviceId: 'cut-1',
      customerName: 'Carlos',
      requestedTime: '16:00',
      startsAt: new Date('2026-10-16T21:00:00.000Z'),
      endsAt: new Date('2026-10-16T21:30:00.000Z'),
    });
  });

  it('«no cancelar» solo conserva la reserva intacta', async () => {
    const say = setup();
    await toConfirmation(say);
    const result = await say('no cancelar');

    expect(result.conversation.state).toBe('awaiting-confirmation');
    expect(result.conversation.data).toMatchObject({
      serviceId: 'cut-1',
      customerName: 'Carlos',
      requestedTime: '15:00',
      ...DERIVED,
    });
  });

  it('«cancelar» sigue cancelando', async () => {
    const say = setup();
    await toConfirmation(say);
    expect((await say('cancelar')).conversation.state).toBe('cancelled');
  });

  it('pide aclaración ante acciones incompatibles y no inicia ninguna', async () => {
    const say = setup();

    const result = await say(
      'Quiero agendar una cita y cancelar mi cita mañana a las 3 pm',
    );

    expect(result.conversation.state).toBe('idle');
    expect(result.conversation.data).toEqual({});
    expect(result.conversation.intent).toBe('unknown');
    expect(result.reply).toMatch(/^¡Hola! 👋 Bienvenido a Barbería\./u);
    expect(result.reply).toMatch(/acciones distintas/i);
    expect(result.reply).toMatch(/agendar una cita/i);
    expect(result.reply).toMatch(/cancelar una cita/i);
    expect(result.reply).toMatch(/no he confirmado ni cancelado nada/i);
  });
});

describe('coordinador — respuesta negativa a la confirmación', () => {
  it('«no la confirmo» no inicia la confirmación final', async () => {
    const say = setup();
    await toConfirmation(say);

    const result = await say('no la confirmo');

    expect(result.conversation.state).toBe('awaiting-confirmation');
    expect(result.conversation.intent).not.toBe('confirm-appointment');
    expect(result.conversation.data).toMatchObject({
      serviceId: 'cut-1',
      customerName: 'Carlos',
      requestedTime: '15:00',
      ...DERIVED,
    });
  });

  it('«no» mantiene el borrador y pregunta si desea cambiarlo o cancelarlo', async () => {
    const say = setup();
    await toConfirmation(say);

    const result = await say('no');

    expect(result.conversation.state).toBe('awaiting-confirmation');
    expect(result.conversation.data).toMatchObject({
      serviceId: 'cut-1',
      customerName: 'Carlos',
      requestedTime: '15:00',
      ...DERIVED,
    });
    expect(result.reply).toMatch(/no confirmaré/i);
    expect(result.reply).toMatch(/cambiar.*cancelar/i);
  });

  it('después de «no», permite cambiar un dato o cancelar el borrador', async () => {
    const say = setup();
    await toConfirmation(say);
    await say('no');

    const changed = await say('cambiar la hora a las 4 pm');

    expect(changed.conversation.state).toBe('awaiting-confirmation');
    expect(changed.conversation.data).toMatchObject({
      requestedTime: '16:00',
      startsAt: new Date('2026-10-16T21:00:00.000Z'),
      endsAt: new Date('2026-10-16T21:30:00.000Z'),
      occupiedEndsAt: new Date('2026-10-16T21:30:00.000Z'),
    });
  });

  it('después de «no», «cancelar» descarta solo la solicitud provisional', async () => {
    const say = setup();
    await toConfirmation(say);
    await say('no');

    const result = await say('cancelar');

    expect(result.conversation.state).toBe('cancelled');
    expect(result.conversation.data).toEqual({});
    expect(result.reply).toMatch(/no se creó ninguna cita/i);
  });

  it.each([
    'no la confirmo, mejor cambia la hora a las 4 pm',
    'mejor cambia la hora a las 4 pm, no la confirmo',
  ])(
    'si mezcla rechazo y cambio, prioriza el dato y conserva el borrador: "%s"',
    async (message) => {
      const say = setup();
      await toConfirmation(say);

      const result = await say(message);

      expect(result.conversation.state).toBe('awaiting-confirmation');
      expect(result.nextField).toBeNull();
      expect(result.conversation.data).toMatchObject({
        serviceId: 'cut-1',
        customerName: 'Carlos',
        requestedTime: '16:00',
        startsAt: new Date('2026-10-16T21:00:00.000Z'),
        endsAt: new Date('2026-10-16T21:30:00.000Z'),
        occupiedEndsAt: new Date('2026-10-16T21:30:00.000Z'),
      });
      expect(result.reply).toContain('*Resumen de tu cita*');
      expect(result.reply).toContain('Hora: 4:00 p.');
    },
  );
});

describe('coordinador — confirmación mezclada con cambios', () => {
  it.each([
    'sí, la confirmo, pero cambia la hora a las 4 pm',
    'cambia la hora a las 4 pm y sí, la confirmo',
  ])(
    'prioriza el cambio y no avanza la confirmación final cuando hay datos nuevos: "%s"',
    async (message) => {
      const say = setup();
      await toConfirmation(say);

      const result = await say(message);

      expect(result.conversation.state).toBe('awaiting-confirmation');
      expect(result.nextField).toBeNull();
      expect(result.conversation.data).toMatchObject({
        serviceId: 'cut-1',
        customerName: 'Carlos',
        requestedTime: '16:00',
        startsAt: new Date('2026-10-16T21:00:00.000Z'),
        endsAt: new Date('2026-10-16T21:30:00.000Z'),
        occupiedEndsAt: new Date('2026-10-16T21:30:00.000Z'),
      });
      expect(result.reply).toContain('*Resumen de tu cita*');
    },
  );
});

describe('coordinador — cambio de nombre en la confirmación', () => {
  it.each([
    'cambia el nombre a Pedro',
    'cambiar el nombre por Pedro',
    'mi nombre es Pedro',
    'mejor a nombre de Pedro',
  ])('«%s» reemplaza el nombre y conserva el resto', async (message) => {
    const say = setup();
    await toConfirmation(say);
    const result = await say(message);

    expect(result.conversation.state).toBe('awaiting-confirmation');
    expect(result.nextField).toBeNull();
    expect(result.conversation.data).toMatchObject({
      serviceId: 'cut-1',
      customerName: 'Pedro',
      requestedTime: '15:00',
      ...DERIVED,
    });
    expect(result.reply).toContain('Pedro');
  });

  it('«cambiar nombre» seguido de «Pedro» sigue funcionando', async () => {
    const say = setup();
    await toConfirmation(say);
    await say('cambiar nombre');
    const result = await say('Pedro');

    expect(result.conversation.state).toBe('awaiting-confirmation');
    expect(result.conversation.data.customerName).toBe('Pedro');
  });

  it.each(['gracias', 'sí', 'mañana'])(
    '«%s» no sobrescribe el nombre guardado',
    async (message) => {
      const say = setup();
      await toConfirmation(say);
      const result = await say(message);

      expect(result.conversation.data.customerName).toBe('Carlos');
      expect(result.conversation.data).toMatchObject(DERIVED);
    },
  );
});
