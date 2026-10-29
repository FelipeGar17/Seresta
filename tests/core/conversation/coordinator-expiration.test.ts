import { describe, expect, it } from 'vitest';
import { parseBusinessConfig } from '../../../src/config/load-config.js';
import {
  CONVERSATION_TTL_MINUTES,
  ConversationCoordinator,
} from '../../../src/core/conversation/coordinator.js';
import { MemoryConversationStore } from '../../../src/core/conversation/memory-store.js';
import { MemoryReservationRepository } from '../../../src/core/reservations/memory-reservation-repository.js';

const start = new Date('2026-10-15T15:00:00.000Z');
const minutesLater = (minutes: number): Date =>
  new Date(start.getTime() + minutes * 60 * 1000);

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
  let current = start;
  let counter = 0;
  const reservations = new MemoryReservationRepository();
  const coordinator = new ConversationCoordinator(
    new MemoryConversationStore(),
    {
      now: () => current,
      idFactory: () => `conversation-${++counter}`,
      reservations,
    },
  );
  const say = (message: string, at: number) => {
    current = minutesLater(at);
    return coordinator.handleMessage({
      business: config,
      contactId: 'contact-1',
      whatsappId: 'whatsapp-1',
      customerPhone: '+573001112233',
      message,
    });
  };

  return { say, reservations };
};

describe('expiración de la conversación', () => {
  it('el plazo es de 10 minutos y se fija en expiresAt', async () => {
    const { say } = setup();
    const result = await say('Quiero un corte de cabello', 0);

    expect(CONVERSATION_TTL_MINUTES).toBe(10);
    expect(result.conversation.expiresAt).toEqual(minutesLater(10));
  });

  it('un mensaje a los 9 minutos conserva los datos y renueva el plazo', async () => {
    const { say } = setup();
    await say('Quiero un corte de cabello mañana', 0);

    const result = await say('a las 3 pm', 9);

    expect(result.conversation.id).toBe('conversation-1');
    expect(result.conversation.data).toMatchObject({
      serviceId: 'cut-1',
      requestedTime: '15:00',
    });
    expect(result.conversation.expiresAt).toEqual(minutesLater(19));
    expect(result.nextField).toBe('customerName');
  });

  it('el plazo se renueva en cada mensaje: 9 + 9 minutos sigue vigente', async () => {
    const { say } = setup();
    await say('Quiero un corte de cabello mañana', 0);
    await say('a las 3 pm', 9);

    const result = await say('me llamo Carlos', 18);

    expect(result.conversation.id).toBe('conversation-1');
    expect(result.conversation.state).toBe('awaiting-confirmation');
  });

  it('a los 10 minutos exactos el borrador vence y se empieza de cero', async () => {
    const { say } = setup();
    await say('Quiero un corte de cabello mañana', 0);

    const result = await say('a las 3 pm', 10);

    expect(result.conversation.id).toBe('conversation-2');
    expect(result.conversation.data.serviceId).toBeUndefined();
    expect(result.conversation.data.requestedDate).toBeUndefined();
    expect(result.reply).not.toContain('Corte de cabello');
  });

  it('un borrador abandonado días después no se reanuda', async () => {
    const { say } = setup();
    await say('Quiero un corte de cabello mañana a las 3 pm', 0);

    const result = await say('me llamo Carlos', 3 * 24 * 60);

    expect(result.conversation.id).toBe('conversation-2');
    expect(result.conversation.state).not.toBe('awaiting-confirmation');
    expect(result.conversation.data.serviceId).toBeUndefined();
  });

  it('vencer la confirmación pendiente no crea ninguna reserva', async () => {
    const { say, reservations } = setup();
    await say('Quiero un corte de cabello mañana a las 3 pm, me llamo Carlos', 0);

    const result = await say('sí, confirmar', 11);

    expect(result.conversation.id).toBe('conversation-2');
    expect(result.reply).not.toMatch(/quedó confirmada/i);
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toBeNull();
    await expect(
      reservations.getById('reservation:conversation-2'),
    ).resolves.toBeNull();
  });

  it('awaiting-cancellation también vence y no cancela la cita', async () => {
    const { say, reservations } = setup();
    await say('Quiero un corte de cabello mañana a las 3 pm, me llamo Carlos', 0);
    await say('sí, confirmar', 1);
    await say('sí, confirmar', 2);
    const asked = await say('quiero cancelar mi cita', 2);
    expect(asked.conversation.state).toBe('awaiting-cancellation');

    const late = await say('sí, cancelar', 12);

    expect(late.conversation.id).toBe('conversation-3');
    expect(late.conversation.state).toBe('awaiting-cancellation');
    expect(late.reply).toMatch(/confirmas que deseas cancelar/i);
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('una consulta de catálogo también renueva el plazo', async () => {
    const { say } = setup();
    await say('Quiero un corte de cabello mañana', 0);

    const catalog = await say('¿cuánto cuesta el corte?', 8);
    const resumed = await say('a las 3 pm', 17);

    expect(catalog.conversation.expiresAt).toEqual(minutesLater(18));
    expect(resumed.conversation.id).toBe('conversation-1');
    expect(resumed.conversation.data.requestedTime).toBe('15:00');
  });
});
