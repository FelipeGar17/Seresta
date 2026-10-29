import { describe, expect, it } from 'vitest';
import type { ConfiguracionNegocio } from '../../../src/core/types.js';
import { parseBusinessConfig } from '../../../src/config/load-config.js';
import { ConversationCoordinator } from '../../../src/core/conversation/coordinator.js';
import { MemoryConversationStore } from '../../../src/core/conversation/memory-store.js';

// Jueves; "mañana" = viernes 2026-10-16.
const now = new Date('2026-10-15T15:00:00.000Z');

const catalogBusiness = (): ConfiguracionNegocio =>
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
        aliases: ['corte de pelo'],
        precio: 25_000,
        duracionMinutos: 30,
        activo: true,
      },
      {
        id: 'beard-1',
        nombre: 'Barba',
        precio: 15_000,
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
      {
        id: 'old-1',
        nombre: 'Tintura',
        precio: 99_000,
        duracionMinutos: 60,
        activo: false,
      },
    ],
    horariosAtencion: {
      monday: [{ abreA: '08:00', cierraA: '18:00' }],
      thursday: [{ abreA: '08:00', cierraA: '18:00' }],
      friday: [{ abreA: '08:00', cierraA: '18:00' }],
      saturday: [{ abreA: '08:00', cierraA: '18:00' }],
    },
  });

const setup = () => {
  const store = new MemoryConversationStore();
  let n = 0;
  const coordinator = new ConversationCoordinator(store, {
    now: () => now,
    idFactory: () => `conversation-${++n}`,
  });
  const business = catalogBusiness();
  const say = (message: string) =>
    coordinator.handleMessage({
      business,
      contactId: 'contact-1',
      whatsappId: 'whatsapp-contact-1',
      customerPhone: '+573001112233',
      message,
    });
  return { say };
};

describe('coordinador — consultas de catálogo sin reserva activa', () => {
  it.each([
    '¿Qué servicios ofrecen?',
    '¿Qué servicios tienen disponibles?',
    '¿Qué cortes hacen?',
  ])('lista los servicios reales para «%s» sin iniciar una reserva', async (message) => {
    const { say } = setup();
    const result = await say(message);

    expect(result.reply).toContain('Corte de cabello');
    expect(result.reply).toContain('Barba');
    expect(result.reply).toContain('Corte y barba');
    expect(result.reply).not.toContain('Tintura');
    expect(result.conversation.data).toEqual({});
    expect(result.conversation.state).not.toBe('awaiting-confirmation');
  });

  it.each([
    ['¿Cuánto cuesta el corte de cabello?', '$25.000'],
    ['¿Cuánto vale la barba?', '$15.000'],
    ['¿Cuánto cuesta el corte y barba?', '$40.000'],
    ['¿Cuánto sale la barba?', '$15.000'],
    ['¿Cuánto me cobran por la barba?', '$15.000'],
  ])('«%s» responde el precio configurado', async (message, price) => {
    const { say } = setup();
    const result = await say(message);

    expect(result.reply).toContain(price);
    expect(result.conversation.intent).toBe('check-prices');
    expect(result.conversation.data).toEqual({});
  });

  it('el precio del corte y barba no se confunde con el del corte', async () => {
    const { say } = setup();
    const result = await say('¿Cuánto cuesta el corte y barba?');

    expect(result.reply).not.toContain('$25.000');
    expect(result.reply).not.toContain('$15.000');
  });

  it('una consulta ambigua pide aclaración sin elegir servicio ni precio', async () => {
    const { say } = setup();
    const result = await say('¿Cuánto cuesta el corte?');

    expect(result.reply).toMatch(/cuál/i);
    expect(result.reply).toContain('Corte de cabello');
    expect(result.reply).toContain('Corte y barba');
    expect(result.reply).not.toMatch(/cuesta \$/i);
    expect(result.conversation.data.serviceId).toBeUndefined();
  });

  it('no inventa precios para servicios inexistentes ni lista inactivos', async () => {
    const { say } = setup();
    const result = await say('¿Cuánto cuesta la tintura?');

    expect(result.reply).not.toContain('$99.000');
    expect(result.reply).not.toContain('Tintura');
    expect(result.conversation.data.serviceId).toBeUndefined();
  });
});

describe('coordinador — consulta vs. solicitud de reserva', () => {
  it('«¿Tienen corte de cabello?» es una consulta, no una reserva', async () => {
    const { say } = setup();
    const result = await say('¿Tienen corte de cabello?');

    expect(result.conversation.intent).toBe('list-services');
    expect(result.conversation.data.serviceId).toBeUndefined();
  });

  it('«Quiero reservar un corte de cabello» inicia la reserva con ese servicio', async () => {
    const { say } = setup();
    const result = await say('Quiero reservar un corte de cabello');

    expect(result.conversation.intent).toBe('book-appointment');
    expect(result.conversation.data.serviceId).toBe('cut-1');
    expect(result.nextField).toBe('requestedDate');
  });

  it('«Quiero agendar una cita» pregunta qué servicio desea', async () => {
    const { say } = setup();
    const result = await say('Quiero agendar una cita');

    expect(result.conversation.state).toBe('collecting-service');
    expect(result.nextField).toBe('serviceId');
    expect(result.reply).toMatch(/servicio/i);
  });
});

describe('coordinador — consultas de catálogo durante una reserva', () => {
  it('flujo de la especificación: precio y retoma la pregunta del servicio', async () => {
    const { say } = setup();
    await say('Quiero reservar una cita');
    const result = await say('¿Cuánto cuesta el corte y barba?');

    expect(result.reply).toContain('$40.000');
    expect(result.reply).toMatch(/servicio/i);
    expect(result.nextField).toBe('serviceId');
    expect(result.conversation.state).toBe('collecting-service');
    expect(result.conversation.intent).toBe('book-appointment');
    expect(result.conversation.data.serviceId).toBeUndefined();
  });

  it('conserva servicio, fecha y nombre al preguntar un precio y retoma la hora', async () => {
    const { say } = setup();
    await say('Quiero un corte de cabello mañana, me llamo Carlos');
    const before = (await say('hola')).conversation.data;
    const result = await say('¿Cuánto cuesta la barba?');

    expect(result.reply).toContain('$15.000');
    expect(result.conversation.data).toEqual(before);
    expect(result.conversation.data).toMatchObject({
      serviceId: 'cut-1',
      customerName: 'Carlos',
    });
    expect(result.nextField).toBe('requestedTime');
    expect(result.conversation.state).toBe('collecting-time');
  });

  it('en awaiting-confirmation no altera datos, derivados ni estado', async () => {
    const { say } = setup();
    const full = await say(
      'Quiero un corte de cabello mañana a las 3 pm, me llamo Carlos',
    );
    expect(full.conversation.state).toBe('awaiting-confirmation');
    const snapshot = structuredClone(full.conversation.data);

    const result = await say('¿Cuánto vale la barba?');

    expect(result.reply).toContain('$15.000');
    expect(result.reply).toMatch(/sigue pendiente/i);
    expect(result.conversation.state).toBe('awaiting-confirmation');
    expect(result.conversation.intent).toBe('book-appointment');
    expect(result.conversation.data).toEqual(snapshot);
    expect(result.conversation.data.startsAt).toBeInstanceOf(Date);
    expect(result.conversation.data.endsAt).toBeInstanceOf(Date);
    expect(result.conversation.data.occupiedEndsAt).toBeInstanceOf(Date);
  });

  it('tras la consulta se puede seguir la reserva con normalidad', async () => {
    const { say } = setup();
    await say('Quiero reservar una cita');
    await say('¿Qué servicios ofrecen?');
    const result = await say('Quiero la barba');

    expect(result.conversation.data.serviceId).toBe('beard-1');
    expect(result.nextField).toBe('requestedDate');
  });
});
