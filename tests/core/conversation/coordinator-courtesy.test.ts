import { describe, expect, it } from 'vitest';
import { parseBusinessConfig } from '../../../src/config/load-config.js';
import { ConversationCoordinator } from '../../../src/core/conversation/coordinator.js';
import { MemoryConversationStore } from '../../../src/core/conversation/memory-store.js';

// Jueves; «mañana» = viernes 2026-10-16 (08:00–18:00).
const now = new Date('2026-10-15T15:00:00.000Z');

const config = parseBusinessConfig({
  businessId: 'business-1',
  nombre: 'Barbería Central',
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
  return (message: string) =>
    coordinator.handleMessage({
      business: config,
      contactId: 'contact-1',
      whatsappId: 'whatsapp-contact-1',
      customerPhone: '+573001112233',
      message,
    });
};

describe('flujo de cortesía — sin reserva en curso', () => {
  it.each(['hola', 'buenos días', 'buenas tardes'])(
    'saluda con el nombre del negocio y presenta opciones sin asumir una reserva: %s',
    async (message) => {
      const result = await setup()(message);

      expect(result.reply).toContain('Barbería Central');
      expect(result.reply).toMatch(/agendar una cita/i);
      expect(result.reply).toMatch(/consultar servicios y precios/i);
      expect(result.reply).toMatch(/cancelar una cita confirmada/i);
      expect(result.reply).not.toMatch(/¿qué servicio deseas/i);
      expect(result.conversation.intent).toBe('greeting');
      expect(result.conversation.state).toBe('idle');
      expect(result.conversation.data).toEqual({});
      expect(result.nextField).toBeNull();
    },
  );

  it.each(['gracias', 'muchas gracias'])(
    'responde al agradecimiento sin iniciar reserva: %s',
    async (message) => {
      const result = await setup()(message);

      expect(result.reply).toMatch(/con gusto/i);
      expect(result.conversation.intent).toBe('thanks');
      expect(result.conversation.state).toBe('idle');
      expect(result.conversation.data).toEqual({});
    },
  );

  it.each(['chao', 'hasta luego', 'adiós'])(
    'se despide sin pedir datos de reserva: %s',
    async (message) => {
      const result = await setup()(message);

      expect(result.reply).toMatch(/hasta luego/i);
      expect(result.reply).not.toMatch(/qué servicio deseas/i);
      expect(result.conversation.intent).toBe('goodbye');
      expect(result.conversation.state).toBe('idle');
      expect(result.conversation.data).toEqual({});
    },
  );

  it('un saludo con solicitud de reserva sigue iniciando la reserva', async () => {
    const result = await setup()('Hola, quiero agendar un corte de cabello');

    expect(result.conversation.intent).toBe('book-appointment');
    expect(result.conversation.data.serviceId).toBe('cut-1');
    expect(result.conversation.state).toBe('collecting-date');
  });
});

describe('flujo de cortesía — dentro de una reserva no hay saludo ni despedida', () => {
  it.each(['chao', 'hasta luego', 'hola'])(
    '«%s» conserva datos y estado y repite la pregunta pendiente',
    async (message) => {
      const say = setup();
      const before = await say('Quiero un corte de cabello mañana');
      const result = await say(message);

      expect(result.reply).not.toMatch(/hasta luego|bienvenido/i);
      expect(result.reply).toMatch(/hora/i);
      expect(result.conversation.data).toEqual(before.conversation.data);
      expect(result.conversation.state).toBe('collecting-time');
      expect(result.nextField).toBe('requestedTime');
    },
  );

  it('despedirse en awaiting-confirmation no confirma ni borra la reserva', async () => {
    const say = setup();
    await say('Quiero un corte de cabello mañana a las 3 pm');
    const full = await say('me llamo Carlos');
    const result = await say('chao');

    expect(full.conversation.state).toBe('awaiting-confirmation');
    expect(result.conversation.state).toBe('awaiting-confirmation');
    expect(result.conversation.data).toEqual(full.conversation.data);
    expect(result.conversation.intent).not.toBe('confirm-appointment');
    expect(result.reply).not.toMatch(/hasta luego/i);
  });

  it('tras un mensaje de cortesía se puede retomar la reserva', async () => {
    const say = setup();
    await say('Quiero un corte de cabello mañana');
    await say('chao');
    const result = await say('a las 3 pm');

    expect(result.conversation.data.requestedTime).toBe('15:00');
    expect(result.nextField).toBe('customerName');
  });

  it('agradecer mientras se pide el nombre sigue aceptando «de Sara, gracias»', async () => {
    const say = setup();
    await say('Quiero un corte de cabello mañana a las 3 pm');
    const result = await say('de Sara, gracias');

    expect(result.conversation.data.customerName).toBe('Sara');
    expect(result.conversation.state).toBe('awaiting-confirmation');
  });
});
