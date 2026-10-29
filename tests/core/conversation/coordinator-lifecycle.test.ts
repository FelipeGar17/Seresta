import { describe, expect, it } from 'vitest';
import { parseBusinessConfig } from '../../../src/config/load-config.js';
import { ConversationCoordinator } from '../../../src/core/conversation/coordinator.js';
import { MemoryConversationStore } from '../../../src/core/conversation/memory-store.js';
import { MemoryReservationRepository } from '../../../src/core/reservations/memory-reservation-repository.js';

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

const setup = (clock: () => Date = () => now) => {
  const store = new MemoryConversationStore();
  const reservations = new MemoryReservationRepository();
  let counter = 0;
  const coordinator = new ConversationCoordinator(store, {
    now: clock,
    idFactory: () => `conversation-${++counter}`,
    reservations,
  });
  const sayAs = (contactId: string) => (message: string) =>
    coordinator.handleMessage({
      business: config,
      contactId,
      whatsappId: `whatsapp-${contactId}`,
      customerPhone: '+573001112233',
      message,
    });

  return { reservations, say: sayAs('contact-1'), sayAs };
};

type Say = ReturnType<typeof setup>['say'];

const book = async (say: Say, hour: string, name: string) => {
  await say(`Quiero un corte de cabello mañana a las ${hour}, me llamo ${name}`);
  await say('sí, confirmar');
  const confirmed = await say('sí, confirmar');
  await say('gracias');
  return confirmed;
};

describe('ciclo de vida — confirmación de una cita', () => {
  it('requiere dos confirmaciones y espera un agradecimiento por un minuto', async () => {
    let current = now;
    const { reservations, say } = setup(() => current);
    await say('Quiero un corte de cabello mañana a las 3 pm, me llamo Carlos');

    const firstConfirmation = await say('sí, confirmar');
    expect(firstConfirmation.conversation.state).toBe(
      'awaiting-final-confirmation',
    );
    expect(firstConfirmation.reply).toContain('Verifica por última vez');
    expect(firstConfirmation.reply).toMatch(/no se podrá modificar/i);
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toBeNull();

    const secondConfirmation = await say('sí, confirmar');
    expect(secondConfirmation.conversation.state).toBe(
      'awaiting-acknowledgment',
    );
    expect(secondConfirmation.conversation.expiresAt).toEqual(
      new Date(current.getTime() + 60_000),
    );
    expect(secondConfirmation.reply).toMatch(/quedó confirmada/i);
    expect(secondConfirmation.reply).toMatch(/solo puedes cancelarla/i);
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toMatchObject({ status: 'confirmed' });

    current = new Date(current.getTime() + 59_999);
    const acknowledgment = await say('allá estaré');
    expect(acknowledgment.conversation.state).toBe('completed');
    expect(acknowledgment.reply).toMatch(/te esperamos/i);
  });

  it('cierra la espera al minuto sin perder la cita confirmada', async () => {
    let current = now;
    const { reservations, say } = setup(() => current);
    await say('Quiero un corte de cabello mañana a las 3 pm, me llamo Carlos');
    await say('sí, confirmar');
    await say('sí, confirmar');

    current = new Date(current.getTime() + 60_000);
    const lateAcknowledgment = await say('gracias');

    expect(lateAcknowledgment.conversation.id).toBe('conversation-2');
    expect(lateAcknowledgment.conversation.state).toBe('idle');
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('un cambio durante la reconfirmación vuelve a solicitar ambas confirmaciones', async () => {
    const { reservations, say } = setup();
    await say('Quiero un corte de cabello mañana a las 3 pm, me llamo Carlos');
    await say('sí, confirmar');

    const changed = await say('cambia la hora a las 4 pm');

    expect(changed.conversation.state).toBe('awaiting-confirmation');
    expect(changed.conversation.data.requestedTime).toBe('16:00');
    expect(changed.reply).toContain('Resumen de tu cita');
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toBeNull();

    expect((await say('sí, confirmar')).conversation.state).toBe(
      'awaiting-final-confirmation',
    );
    const confirmed = await say('sí, confirmar');
    expect(confirmed.conversation.state).toBe('awaiting-acknowledgment');
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toMatchObject({
      status: 'confirmed',
      startsAt: new Date('2026-10-16T21:00:00.000Z'),
    });
  });

  it('una respuesta no reconocida en la segunda confirmación no la reinicia', async () => {
    const { reservations, say } = setup();
    await say('Quiero un corte de cabello mañana a las 3 pm, me llamo Carlos');
    await say('sí, confirmar');

    const unclear = await say('confirmo, muchas gracias por todo');

    expect(unclear.conversation.state).toBe('awaiting-final-confirmation');
    expect(unclear.reply).toMatch(/todavía no está confirmada/i);
    expect(unclear.reply).toMatch(/verifica por última vez/i);
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toBeNull();

    const confirmed = await say('confirmo, gracias');
    expect(confirmed.conversation.state).toBe('awaiting-acknowledgment');
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('tras confirmar, «chao» se despide y «sí» no crea otra reserva', async () => {
    const { reservations, say } = setup();
    await book(say, '3 pm', 'Carlos');

    const farewell = await say('chao');
    expect(farewell.reply).toMatch(/hasta luego/i);
    expect(farewell.conversation.state).toBe('idle');

    const again = await say('sí');
    expect(again.conversation.state).toBe('idle');
    await expect(
      reservations.listConfirmedByContact('business-1', 'contact-1', now),
    ).resolves.toHaveLength(1);
  });

  it('una reserva de un contacto no es visible para otro', async () => {
    const { reservations, say, sayAs } = setup();
    await book(say, '3 pm', 'Carlos');

    const other = await sayAs('contact-2')('quiero cancelar mi cita');

    expect(other.reply).toMatch(/no encuentro citas confirmadas/i);
    await expect(
      reservations.listConfirmedByContact('business-1', 'contact-2', now),
    ).resolves.toEqual([]);
  });
});

describe('ciclo de vida — cancelar una cita confirmada', () => {
  it.each([
    'cancelar mi cita',
    'quiero cancelar mi cita',
    'cancela la cita',
    'cancela mi reserva',
    'necesito cancelar la cita',
  ])('«%s» pide confirmación sin cancelar todavía', async (phrase) => {
    const { reservations, say } = setup();
    await book(say, '3 pm', 'Carlos');

    const result = await say(phrase);

    expect(result.conversation.state).toBe('awaiting-cancellation');
    expect(result.reply).toMatch(/confirmas que deseas cancelar/i);
    expect(result.reply).toContain('Corte de cabello');
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toMatchObject({ status: 'confirmed' });
  });

  it.each(['sí, cancelar', 'sí', 'confirmo'])(
    'confirmar con «%s» marca la cita como cancelled y registra cancelledAt',
    async (confirmation) => {
      const { reservations, say } = setup();
      await book(say, '3 pm', 'Carlos');
      await say('quiero cancelar mi cita');

      const result = await say(confirmation);
      const stored = await reservations.getById('reservation:conversation-1');

      expect(result.reply).toMatch(/fue cancelada/i);
      expect(result.conversation.state).toBe('cancelled');
      expect(result.conversation.cancellation).toBeUndefined();
      expect(stored).toMatchObject({ status: 'cancelled', cancelledAt: now });
      await expect(
        reservations.listConfirmedByContact('business-1', 'contact-1', now),
      ).resolves.toEqual([]);

      const farewell = await say('gracias, chao');
      expect(farewell.conversation.state).toBe('idle');
    },
  );

  it.each(['no', 'mejor no', 'dejala así'])(
    'responder «%s» conserva la cita confirmada',
    async (decline) => {
      const { reservations, say } = setup();
      await book(say, '3 pm', 'Carlos');
      await say('quiero cancelar mi cita');

      const result = await say(decline);

      expect(result.reply).toMatch(/sigue vigente/i);
      expect(result.conversation.state).toBe('completed');
      await expect(
        reservations.getById('reservation:conversation-1'),
      ).resolves.toMatchObject({ status: 'confirmed' });
    },
  );

  it('una respuesta ambigua no cancela y repite la pregunta', async () => {
    const { reservations, say } = setup();
    await book(say, '3 pm', 'Carlos');
    await say('quiero cancelar mi cita');

    const result = await say('no sé');

    expect(result.conversation.state).toBe('awaiting-cancellation');
    expect(result.reply).toMatch(/confirmas que deseas cancelar/i);
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('sin citas confirmadas informa y no entra al flujo de cancelación', async () => {
    const { say } = setup();

    const result = await say('quiero cancelar mi cita');

    expect(result.reply).toMatch(/no encuentro citas confirmadas/i);
    expect(result.conversation.state).toBe('idle');
    expect(result.conversation.cancellation).toBeUndefined();
  });

  it('con dos citas pide elegir por número y cancela solo la elegida', async () => {
    const { reservations, say } = setup();
    await book(say, '3 pm', 'Carlos');
    await book(say, '4 pm', 'Carlos');

    const list = await say('cancelar mi cita');
    expect(list.reply).toMatch(/1\..*3:00/s);
    expect(list.reply).toMatch(/2\..*4:00/s);
    expect(list.conversation.cancellation?.selectedId).toBeUndefined();

    const invalid = await say('9');
    expect(invalid.reply).toMatch(/identifiqué cuál cita/i);
    expect(invalid.conversation.cancellation?.selectedId).toBeUndefined();

    const picked = await say('2');
    expect(picked.reply).toMatch(/confirmas que deseas cancelar/i);
    expect(picked.reply).toContain('4:00');

    await say('sí, cancelar');

    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toMatchObject({ status: 'confirmed' });
    await expect(
      reservations.getById('reservation:conversation-2'),
    ).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('cancelar el borrador de una reserva en curso no toca citas confirmadas', async () => {
    const { reservations, say } = setup();
    await book(say, '3 pm', 'Carlos');
    await say('quiero agendar un corte de cabello');

    const result = await say('cancelar');

    expect(result.reply).toMatch(/solicitud de reserva fue cancelada/i);
    await expect(
      reservations.listConfirmedByContact('business-1', 'contact-1', now),
    ).resolves.toHaveLength(1);
  });
});
