import { describe, expect, it } from 'vitest';
import type {
  ConfiguracionNegocio,
  Conversation,
  ReservationData,
} from '../../../src/core/types.js';
import { parseBusinessConfig } from '../../../src/config/load-config.js';
import { ConversationCoordinator } from '../../../src/core/conversation/coordinator.js';
import { MemoryConversationStore } from '../../../src/core/conversation/memory-store.js';
import { MemoryReservationRepository } from '../../../src/core/reservations/memory-reservation-repository.js';
import type { ReservationCalendar } from '../../../src/core/reservations/reservation-calendar.js';
import { getPendingReservationFields } from '../../../src/core/conversation/reservation-progress.js';

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
      monday: [{ abreA: '08:00', cierraA: '18:00' }],
      thursday: [{ abreA: '08:00', cierraA: '18:00' }],
      friday: [{ abreA: '08:00', cierraA: '18:00' }],
      saturday: [{ abreA: '08:00', cierraA: '18:00' }],
    },
  });

const businessWithTwoServices = (): ConfiguracionNegocio =>
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
      monday: [{ abreA: '08:00', cierraA: '18:00' }],
      thursday: [{ abreA: '08:00', cierraA: '18:00' }],
      friday: [{ abreA: '08:00', cierraA: '18:00' }],
      saturday: [{ abreA: '08:00', cierraA: '18:00' }],
    },
  });

const businessWithDuration = (
  duracionMinutos: number,
  intervaloMinutos = 30,
): ConfiguracionNegocio =>
  parseBusinessConfig({
    businessId: 'business-1',
    nombre: 'Barbería',
    zonaHoraria: 'America/Bogota',
    whatsappNumero: '+573000000000',
    calendarId: 'calendar-1',
    servicios: [
      {
        id: 'service-1',
        nombre: 'Corte de cabello',
        aliases: ['corte'],
        precio: 25_000,
        duracionMinutos,
        activo: true,
      },
    ],
    horariosAtencion: {
      friday: [{ abreA: '08:00', cierraA: '18:00' }],
    },
    politicaReservas: {
      intervaloAgendaMinutos: intervaloMinutos,
    },
  });

const setup = (
  config: ConfiguracionNegocio = business(),
  calendar?: ReservationCalendar,
) => {
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
      ...(calendar ? { calendar } : {}),
    }),
    input: (message: string) => ({
      business: config,
      contactId: 'contact-1',
      whatsappId: 'whatsapp-contact-1',
      customerPhone: '+573001112233',
      message,
    }),
  };
};

const seedConversation = (
  store: MemoryConversationStore,
  data: ReservationData,
): Conversation => {
  const conversation: Conversation = {
    id: 'conversation-seeded',
    businessId: 'business-1',
    contactId: 'contact-1',
    whatsappId: 'whatsapp-contact-1',
    customerPhone: '+573001112233',
    intent: 'book-appointment',
    state: 'awaiting-confirmation',
    messages: [],
    data,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  };

  return conversation;
};

describe('ConversationCoordinator', () => {
  it('reconoce una reserva para mañana, explica el servicio y permite salir', async () => {
    const { coordinator, input } = setup();

    const bookingStarted = await coordinator.handleMessage(
      input('Quisiera hacer una reserva para mañana'),
    );
    expect(bookingStarted.conversation.intent).toBe('book-appointment');
    expect(bookingStarted.conversation.state).toBe('collecting-service');
    expect(bookingStarted.conversation.data.requestedDate?.toISOString()).toBe(
      '2026-10-16T00:00:00.000Z',
    );

    const availabilityAsked = await coordinator.handleMessage(
      input('¿Tienes disponibilidad para mañana?'),
    );
    expect(availabilityAsked.conversation.state).toBe('collecting-service');
    expect(availabilityAsked.conversation.data.requestedDate?.toISOString()).toBe(
      '2026-10-16T00:00:00.000Z',
    );
    expect(availabilityAsked.reply).toMatch(/cada uno tiene una duración distinta/i);
    expect(availabilityAsked.reply).toMatch(/¿qué servicio deseas agendar/i);

    const exited = await coordinator.handleMessage(input('Salir'));
    expect(exited.conversation.state).toBe('cancelled');
    expect(exited.conversation.data).toEqual({});
    expect(exited.reply).toMatch(/no se creó ninguna cita/i);
  });

  it('consulta otra fecha sin perder el servicio cuando el día está completo', async () => {
    let availabilityChecks = 0;
    let createdEvents = 0;
    const calendar: ReservationCalendar = {
      async listBusyAppointments(_business, from, to) {
        availabilityChecks += 1;
        const day = from.toISOString().slice(0, 10);
        return day === '2026-10-16'
          ? [
              {
                startsAt: from,
                endsAt: to,
                durationMinutes: 24 * 60,
              },
            ]
          : [];
      },
      async createReservationEvent() {
        createdEvents += 1;
        return 'event-1';
      },
      async deleteReservationEvent() {},
    };
    const { coordinator, input } = setup(business(), calendar);

    const fullDay = await coordinator.handleMessage(
      input('¿Tienen disponibilidad para un corte de cabello mañana?'),
    );
    expect(fullDay.conversation.state).toBe('checking-availability');
    expect(fullDay.conversation.intent).toBe('check-availability');
    expect(fullDay.conversation.data.serviceId).toBe('cut-1');
    expect(fullDay.nextField).toBe('requestedDate');
    expect(fullDay.reply).toMatch(/no encuentro horarios disponibles/i);
    expect(fullDay.reply).toContain('viernes, 16 de octubre de 2026');
    expect(fullDay.reply).toMatch(/no he creado ninguna cita/i);

    const nextDate = await coordinator.handleMessage(
      input('¿Y para el lunes?'),
    );
    expect(nextDate.conversation.state).toBe('checking-availability');
    expect(nextDate.conversation.data.serviceId).toBe('cut-1');
    expect(nextDate.conversation.data.requestedDate?.toISOString()).toBe(
      '2026-10-19T00:00:00.000Z',
    );
    expect(nextDate.reply).toMatch(/disponibilidad/i);
    expect(availabilityChecks).toBe(2);
    expect(createdEvents).toBe(0);
  });

  it('pide el servicio faltante y solo inicia la reserva cuando se solicita', async () => {
    const { coordinator, input } = setup();

    const missingService = await coordinator.handleMessage(
      input('¿Tienen disponibilidad para mañana?'),
    );
    expect(missingService.conversation.state).toBe('checking-availability');
    expect(missingService.nextField).toBe('serviceId');
    expect(missingService.reply).toMatch(/¿para qué servicio/i);

    const serviceProvided = await coordinator.handleMessage(
      input('Corte de cabello'),
    );
    expect(serviceProvided.conversation.state).toBe('checking-availability');
    expect(serviceProvided.conversation.data.serviceId).toBe('cut-1');
    expect(serviceProvided.reply).toMatch(/disponibilidad/i);
    expect(serviceProvided.reply).toMatch(/escribe \*agendar\*/i);

    const bookingRequested = await coordinator.handleMessage(
      input('Quiero iniciar una reserva'),
    );
    expect(bookingRequested.conversation.intent).toBe('book-appointment');
    expect(bookingRequested.conversation.state).toBe('collecting-time');
    expect(bookingRequested.conversation.data.serviceId).toBe('cut-1');
    expect(bookingRequested.conversation.data.requestedDate?.toISOString()).toBe(
      '2026-10-16T00:00:00.000Z',
    );
  });

  it('consulta los periodos del día y conserva el periodo elegido', async () => {
    const calendar: ReservationCalendar = {
      async listBusyAppointments() {
        return [
          {
            startsAt: new Date('2026-10-16T14:00:00.000Z'),
            endsAt: new Date('2026-10-16T14:30:00.000Z'),
            durationMinutes: 30,
          },
        ];
      },
      async createReservationEvent() {
        return 'event-1';
      },
      async deleteReservationEvent() {},
    };
    const { coordinator, input } = setup(business(), calendar);

    const periods = await coordinator.handleMessage(
      input('Quiero un corte para mañana'),
    );
    expect(periods.nextField).toBe('requestedTime');
    expect(periods.reply).toMatch(/mañana.*tarde/i);

    const morning = await coordinator.handleMessage(
      input('en la mañana'),
    );
    expect(morning.conversation.data.requestedTimeOfDay).toBe('morning');
    expect(morning.reply).toMatch(/disponibilidad en la mañana/i);
    expect(morning.reply).toMatch(/8:00/);
  });

  it('propone las horas más cercanas y revalida la elegida', async () => {
    let newlyOccupied = false;
    const calendar: ReservationCalendar = {
      async listBusyAppointments() {
        return [
          {
            startsAt: new Date('2026-10-16T21:00:00.000Z'),
            endsAt: new Date('2026-10-16T21:30:00.000Z'),
            durationMinutes: 30,
          },
          ...(newlyOccupied
            ? [
                {
                  startsAt: new Date('2026-10-16T21:30:00.000Z'),
                  endsAt: new Date('2026-10-16T22:00:00.000Z'),
                  durationMinutes: 30,
                },
              ]
            : []),
        ];
      },
      async createReservationEvent() {
        return 'event-1';
      },
      async deleteReservationEvent() {},
    };
    const { coordinator, input } = setup(business(), calendar);

    await coordinator.handleMessage(input('Quiero un corte para mañana'));
    const occupiedTime = await coordinator.handleMessage(input('4 pm'));
    expect(occupiedTime.conversation.state).toBe('collecting-time');
    expect(occupiedTime.reply).toMatch(/3:30.*4:30/);

    newlyOccupied = true;
    const selectedAlternative = await coordinator.handleMessage(
      input('4:30 pm'),
    );
    expect(selectedAlternative.conversation.state).toBe('collecting-time');
    expect(selectedAlternative.conversation.data.requestedTime).toBeUndefined();
    expect(selectedAlternative.reply).toMatch(/ocupado/);
  });

  it('reutiliza la respuesta de un mensaje ya persistido al reintentarlo', async () => {
    const { coordinator, input } = setup();
    const message = {
      ...input('Hola'),
      messageId: 'whatsapp-message-1',
      receivedAt: now,
    };

    const first = await coordinator.handleMessage(message);
    const retried = await coordinator.handleMessage(message);

    expect(retried.reply).toBe(first.reply);
    expect(retried.conversation.messages).toHaveLength(2);
    expect(
      retried.conversation.messages[0].externalMessageId,
    ).toBe('whatsapp-message-1');
  });

  it('revalida Calendar antes de confirmar y no confirma un hueco ocupado', async () => {
    let occupied = false;
    let createdEvents = 0;
    const calendar: ReservationCalendar = {
      async listBusyAppointments() {
        return occupied
          ? [
              {
                startsAt: new Date('2026-10-16T20:00:00.000Z'),
                endsAt: new Date('2026-10-16T20:30:00.000Z'),
                durationMinutes: 30,
              },
            ]
          : [];
      },
      async createReservationEvent() {
        createdEvents += 1;
        return 'event-1';
      },
      async deleteReservationEvent() {},
    };
    const store = new MemoryConversationStore();
    const reservations = new MemoryReservationRepository();
    const coordinator = new ConversationCoordinator(store, {
      now: () => now,
      idFactory: () => 'calendar-conversation',
      reservations,
      calendar,
    });
    const input = (message: string) => ({
      business: business(),
      contactId: 'contact-1',
      whatsappId: 'whatsapp-contact-1',
      message,
    });

    await coordinator.handleMessage(
      input('Quiero un corte mañana a las 3 de la tarde'),
    );
    const complete = await coordinator.handleMessage(input('Ana Pérez'));
    expect(complete.conversation.state).toBe('awaiting-confirmation');

    await coordinator.handleMessage(input('sí'));
    occupied = true;
    const finalAttempt = await coordinator.handleMessage(input('sí'));

    expect(finalAttempt.conversation.state).toBe('collecting-time');
    expect(finalAttempt.conversation.data.requestedTime).toBeUndefined();
    expect(finalAttempt.reply).toMatch(/ocupad|disponible/i);
    expect(createdEvents).toBe(0);
    await expect(
      reservations.getById('reservation:calendar-conversation'),
    ).resolves.toBeNull();
  });

  it('sincroniza la cancelación con Calendar antes de cambiar el estado local', async () => {
    let deletedReservationId: string | undefined;
    let deleteAttempts = 0;
    const calendar: ReservationCalendar = {
      async listBusyAppointments() {
        return [];
      },
      async createReservationEvent() {
        return 'event-1';
      },
      async deleteReservationEvent(_business, reservation) {
        deleteAttempts += 1;
        if (deleteAttempts === 1) {
          throw new Error('Calendar temporalmente no disponible');
        }
        deletedReservationId = reservation.id;
      },
    };
    const store = new MemoryConversationStore();
    const reservations = new MemoryReservationRepository();
    await reservations.create({
      id: 'existing-reservation',
      businessId: 'business-1',
      contactId: 'contact-1',
      whatsappId: 'whatsapp-contact-1',
      customerName: 'Ana Pérez',
      serviceId: 'cut-1',
      startsAt: new Date('2026-10-16T20:00:00.000Z'),
      endsAt: new Date('2026-10-16T20:30:00.000Z'),
      status: 'confirmed',
      createdAt: now,
      updatedAt: now,
    });
    const coordinator = new ConversationCoordinator(store, {
      now: () => now,
      idFactory: () => 'cancellation-conversation',
      reservations,
      calendar,
    });
    const input = (message: string) => ({
      business: business(),
      contactId: 'contact-1',
      whatsappId: 'whatsapp-contact-1',
      message,
    });

    await coordinator.handleMessage(input('Quiero cancelar mi cita'));
    await expect(
      coordinator.handleMessage(input('Sí, cancelar')),
    ).rejects.toThrow(/temporalmente no disponible/i);
    await expect(
      reservations.getById('existing-reservation'),
    ).resolves.toMatchObject({ status: 'confirmed' });

    await coordinator.handleMessage(input('Sí, cancelar'));

    expect(deletedReservationId).toBe('existing-reservation');
    expect(deleteAttempts).toBe(2);
    await expect(
      reservations.getById('existing-reservation'),
    ).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('no anuncia una cita ante un fallo de Calendar y reintenta sin duplicar la reserva', async () => {
    let attempts = 0;
    const calendar: ReservationCalendar = {
      async listBusyAppointments() {
        return [];
      },
      async createReservationEvent() {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('Calendar temporalmente no disponible');
        }
        return 'event-1';
      },
      async deleteReservationEvent() {},
    };
    const store = new MemoryConversationStore();
    const reservations = new MemoryReservationRepository();
    const coordinator = new ConversationCoordinator(store, {
      now: () => now,
      idFactory: () => 'calendar-retry',
      reservations,
      calendar,
    });
    const input = (message: string, messageId?: string) => ({
      business: business(),
      contactId: 'contact-1',
      whatsappId: 'whatsapp-contact-1',
      ...(messageId ? { messageId, receivedAt: now } : {}),
      message,
    });

    await coordinator.handleMessage(
      input('Quiero un corte mañana a las 3 de la tarde'),
    );
    await coordinator.handleMessage(input('Ana Pérez'));
    await coordinator.handleMessage(input('sí'));

    await expect(
      coordinator.handleMessage(input('sí', 'final-confirmation')),
    ).rejects.toThrow(/temporalmente no disponible/i);
    await expect(
      reservations.getById('reservation:calendar-retry'),
    ).resolves.toMatchObject({ status: 'pending' });

    const retried = await coordinator.handleMessage(
      input('sí', 'final-confirmation'),
    );
    const duplicate = await coordinator.handleMessage(
      input('sí', 'final-confirmation'),
    );

    expect(retried.conversation.state).toBe('awaiting-acknowledgment');
    expect(retried.reply).toMatch(/quedó confirmada/i);
    expect(duplicate.reply).toBe(retried.reply);
    expect(attempts).toBe(2);
    await expect(
      reservations.getById('reservation:calendar-retry'),
    ).resolves.toMatchObject({
      status: 'confirmed',
      googleCalendarEventId: 'event-1',
    });
  });

  it('inicia una conversación y pide el servicio', async () => {
    const { store, coordinator, input } = setup();
    const result = await coordinator.handleMessage(
      input('Hola, quiero reservar una cita'),
    );

    expect(result.conversation.id).toBe('conversation-1');
    expect(result.conversation.intent).toBe('book-appointment');
    expect(result.conversation.state).toBe('collecting-service');
    expect(result.nextField).toBe('serviceId');
    expect(result.reply).toMatch(/servicio/i);
    expect(result.conversation.messages).toHaveLength(2);
    await expect(
      store.getByContact('business-1', 'contact-1', now),
    ).resolves.toBe(result.conversation);
  });

  it('continúa la conversación existente del mismo contacto', async () => {
    const { coordinator, input } = setup();
    const first = await coordinator.handleMessage(input('Quiero un corte'));
    const second = await coordinator.handleMessage(input('mañana'));

    expect(second.conversation.id).toBe(first.conversation.id);
    expect(second.conversation.messages).toHaveLength(4);
    expect(second.conversation.data).toMatchObject({
      serviceId: 'cut-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
    });
    expect(second.conversation.state).toBe('collecting-time');
    expect(second.nextField).toBe('requestedTime');
  });

  it('recopila servicio, fecha, hora y nombre en mensajes sucesivos', async () => {
    const { coordinator, input } = setup();

    const service = await coordinator.handleMessage(input('Quiero un corte'));
    expect(service.conversation.state).toBe('collecting-date');
    expect(service.nextField).toBe('requestedDate');
    expect(service.reply).toMatch(/fecha/i);

    const date = await coordinator.handleMessage(input('mañana'));
    expect(date.conversation.state).toBe('collecting-time');
    expect(date.nextField).toBe('requestedTime');
    expect(date.reply).toMatch(/hora/i);

    const time = await coordinator.handleMessage(
      input('a las 3 de la tarde'),
    );
    expect(time.conversation.state).toBe('collecting-customer-data');
    expect(time.nextField).toBe('customerName');
    expect(time.reply).toMatch(/nombre/i);

    const name = await coordinator.handleMessage(input('Ana Pérez'));
    expect(name.conversation.state).toBe('awaiting-confirmation');
    expect(name.nextField).toBeNull();
    expect(name.conversation.data).toEqual({
      serviceId: 'cut-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
      requestedTime: '15:00',
      startsAt: new Date('2026-10-16T20:00:00.000Z'),
      endsAt: new Date('2026-10-16T20:30:00.000Z'),
      occupiedEndsAt: new Date('2026-10-16T20:30:00.000Z'),
      customerName: 'Ana Pérez',
    });
    expect(name.reply).toContain('*Resumen de tu cita*');
    expect(name.reply).toContain('Servicio: Corte de cabello');
    expect(name.reply).toContain('Fecha: viernes, 16 de octubre de 2026');
    expect(name.reply).toMatch(/Hora: 3:00 p\.\s*m\./u);
    expect(name.reply).toContain('Nombre: Ana Pérez');
    expect(name.reply).toContain('Duración: 30 minutos');
    expect(name.reply).toContain('Precio: $25.000 COP');
    expect(name.reply).toMatch(/confirmas/i);
  });

  it('pide el nuevo servicio cuando se solicita cambiarlo sin indicar cuál', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(
      input('Quiero un corte mañana a las 3 pm'),
    );

    const result = await coordinator.handleMessage(
      input('Quiero cambiar el servicio'),
    );

    expect(result.conversation.state).toBe('collecting-service');
    expect(result.nextField).toBe('serviceId');
    expect(result.reply).toMatch(/¿Qué servicio deseas agendar/u);
    expect(result.conversation.data).toMatchObject({
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
      requestedTime: '15:00',
    });
    expect(result.conversation.data.serviceId).toBeUndefined();
  });

  it('pide la nueva fecha si se solicita cambiarla sin indicar el día', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(
      input('Quiero un corte mañana a las 3 pm'),
    );

    const result = await coordinator.handleMessage(
      input('Quiero cambiar la fecha'),
    );

    expect(result.conversation.state).toBe('collecting-date');
    expect(result.nextField).toBe('requestedDate');
    expect(result.reply).toMatch(/¿Para qué fecha/u);
    expect(result.conversation.data).toMatchObject({
      serviceId: 'cut-1',
      requestedTime: '15:00',
    });
    expect(result.conversation.data.requestedDate).toBeUndefined();
  });

  it('no borra datos cuando el cliente niega que quiera cambiar el servicio', async () => {
    const { coordinator, input } = setup();
    const initial = await coordinator.handleMessage(
      input('Quiero un corte mañana a las 3 pm'),
    );

    const result = await coordinator.handleMessage(
      input('No quiero cambiar el servicio'),
    );

    expect(result.conversation.data).toEqual(initial.conversation.data);
    expect(result.nextField).toBe('customerName');
  });

  it.each([
    [
      'Quiero un corte de cabello mañana a las 3 de la tarde, me llamo Carlos',
      'Carlos',
    ],
    [
      'Mi nombre es carlos y quiero agendar un corte de cabello mañana a las 3 pm',
      'Carlos',
    ],
  ])(
    'extrae el nombre junto con servicio, fecha y hora: "%s"',
    async (message, customerName) => {
      const { coordinator, input } = setup();

      const result = await coordinator.handleMessage(input(message));

      expect(result.conversation.data).toEqual({
        serviceId: 'cut-1',
        requestedDate: new Date('2026-10-16T00:00:00.000Z'),
        requestedTime: '15:00',
        startsAt: new Date('2026-10-16T20:00:00.000Z'),
        endsAt: new Date('2026-10-16T20:30:00.000Z'),
        occupiedEndsAt: new Date('2026-10-16T20:30:00.000Z'),
        customerName,
      });
      expect(result.conversation.state).toBe('awaiting-confirmation');
      expect(result.nextField).toBeNull();
      expect(getPendingReservationFields(result.conversation.data)).toEqual([]);
      expect(result.reply).toContain(`Nombre: ${customerName}`);
    },
  );

  it(
    'guarda el nombre explícito aunque todavía falte seleccionar el servicio',
    async () => {
      const { coordinator, input } = setup();
      await coordinator.handleMessage(input('Quiero reservar una cita'));

      const name = await coordinator.handleMessage(input('Me llamo Andrés'));

      expect(name.conversation.data.customerName).toBe('Andrés');
      expect(name.conversation.state).toBe('collecting-service');
      expect(name.nextField).toBe('serviceId');
      expect(getPendingReservationFields(name.conversation.data)).toEqual([
        'serviceId',
        'requestedDate',
        'requestedTime',
      ]);

      const service = await coordinator.handleMessage(
        input('Quiero un corte'),
      );

      expect(service.conversation.data).toMatchObject({
        serviceId: 'cut-1',
        customerName: 'Andrés',
      });
      expect(service.conversation.state).toBe('collecting-date');
      expect(service.nextField).toBe('requestedDate');
    },
  );

  it.each([
    'Hola, me llamo Sara y quiero agendar una cita para mañana a las 3 pm',
    'Quiero agendar una cita para mañana a las 3 pm, hola, mi nombre es Sara',
  ])(
    'conserva datos mezclados y pide solo el servicio faltante: "%s"',
    async (message) => {
      const { coordinator, input } = setup();

      const result = await coordinator.handleMessage(input(message));

      expect(result.conversation.data).toEqual({
        customerName: 'Sara',
        requestedDate: new Date('2026-10-16T00:00:00.000Z'),
        requestedTime: '15:00',
      });
      expect(result.conversation.state).toBe('collecting-service');
      expect(result.nextField).toBe('serviceId');
      expect(result.reply).toMatch(/servicio/i);
      expect(result.reply).not.toMatch(/¡Hola! 👋 Bienvenido/i);
      expect(getPendingReservationFields(result.conversation.data)).toEqual([
        'serviceId',
      ]);
    },
  );

  it('aplica una corrección de hora mientras pregunta por el nombre', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(
      input('Quiero un corte mañana a las 3 de la tarde'),
    );

    const correctedTime = await coordinator.handleMessage(
      input('Quiero cambiar la hora para las 4 de la tarde'),
    );

    expect(correctedTime.conversation.state).toBe('collecting-customer-data');
    expect(correctedTime.nextField).toBe('customerName');
    expect(correctedTime.conversation.data).toMatchObject({
      serviceId: 'cut-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
      requestedTime: '16:00',
      startsAt: new Date('2026-10-16T21:00:00.000Z'),
      endsAt: new Date('2026-10-16T21:30:00.000Z'),
      occupiedEndsAt: new Date('2026-10-16T21:30:00.000Z'),
    });
    expect(
      getPendingReservationFields(correctedTime.conversation.data),
    ).toEqual(['customerName']);

    const name = await coordinator.handleMessage(input('Carlos'));
    expect(name.conversation.data.customerName).toBe('Carlos');
    expect(name.conversation.state).toBe('awaiting-confirmation');
  });

  it('no presenta el resumen mientras falten datos obligatorios', async () => {
    const { coordinator, input } = setup();

    const result = await coordinator.handleMessage(input('Quiero un corte'));

    expect(result.conversation.state).toBe('collecting-date');
    expect(result.nextField).toBe('requestedDate');
    expect(result.reply).not.toContain('Resumen de tu cita');
  });

  it('pide la fecha cuando el cliente ya dio la hora', async () => {
    const { coordinator, input } = setup();

    const result = await coordinator.handleMessage(
      input('Quiero un corte a las 3 de la tarde'),
    );

    expect(result.conversation.data).toEqual({
      serviceId: 'cut-1',
      requestedTime: '15:00',
    });
    expect(result.conversation.state).toBe('collecting-date');
    expect(result.nextField).toBe('requestedDate');
    expect(result.reply).toMatch(/fecha/i);
  });

  it('combina fecha y hora recibidas en turnos distintos', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(
      input('Quiero un corte a las 3 de la tarde'),
    );

    const result = await coordinator.handleMessage(input('mañana'));

    expect(result.conversation.data.requestedDate).toEqual(
      new Date('2026-10-16T00:00:00.000Z'),
    );
    expect(result.conversation.data.requestedTime).toBe('15:00');
    expect(result.conversation.data.startsAt).toEqual(
      new Date('2026-10-16T20:00:00.000Z'),
    );
  });

  it.each([
    {
      label: 'fecha',
      correction: 'pasado mañana',
      requestedDate: '2026-10-17T00:00:00.000Z',
      requestedTime: '15:00',
      startsAt: '2026-10-17T20:00:00.000Z',
      dateInReply: 'sábado, 17 de octubre de 2026',
      timeInReply: /Hora: 3:00 p\.\s*m\./u,
    },
    {
      label: 'hora',
      correction: 'Mejor a las 4 de la tarde',
      requestedDate: '2026-10-16T00:00:00.000Z',
      requestedTime: '16:00',
      startsAt: '2026-10-16T21:00:00.000Z',
      dateInReply: 'viernes, 16 de octubre de 2026',
      timeInReply: /Hora: 4:00 p\.\s*m\./u,
    },
  ])(
    'recalcula los datos derivados y conserva el resto al cambiar la $label',
    async ({
      correction,
      requestedDate,
      requestedTime,
      startsAt,
      dateInReply,
      timeInReply,
    }) => {
      const { coordinator, input } = setup();
      await coordinator.handleMessage(
        input('Quiero un corte mañana a las 3 de la tarde'),
      );
      await coordinator.handleMessage(input('Ana Pérez'));

      const result = await coordinator.handleMessage(input(correction));
      const expectedStart = new Date(startsAt);

      expect(result.conversation.data).toEqual({
        serviceId: 'cut-1',
        requestedDate: new Date(requestedDate),
        requestedTime,
        startsAt: expectedStart,
        endsAt: new Date(expectedStart.getTime() + 30 * 60_000),
        occupiedEndsAt: new Date(expectedStart.getTime() + 30 * 60_000),
        customerName: 'Ana Pérez',
      });
      expect(result.reply).toContain(`Fecha: ${dateInReply}`);
      expect(result.reply).toMatch(timeInReply);
      expect(result.conversation.state).toBe('awaiting-confirmation');
      expect(result.nextField).toBeNull();
      expect(getPendingReservationFields(result.conversation.data)).toEqual([]);
    },
  );

  it('pregunta qué dato cambiar cuando la solicitud no lo especifica', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(input('Quiero un corte mañana a las 3 de la tarde'));
    const complete = await coordinator.handleMessage(input('Ana Pérez'));

    const question = await coordinator.handleMessage(
      input('Quiero cambiar algún dato'),
    );

    expect(question.reply).toMatch(/qué dato deseas cambiar/i);
    expect(question.conversation.state).toBe('awaiting-confirmation');
    expect(question.conversation.data).toEqual(complete.conversation.data);

    const dateChange = await coordinator.handleMessage(input('la fecha'));

    expect(dateChange.conversation.state).toBe('collecting-date');
    expect(dateChange.nextField).toBe('requestedDate');
    expect(dateChange.conversation.data).toEqual({
      serviceId: 'cut-1',
      requestedTime: '15:00',
      customerName: 'Ana Pérez',
    });
    expect(dateChange.reply).toMatch(/fecha/i);
  });

  it.each([
    ['Carlos Ruiz', 'Carlos Ruiz'],
    ['de carlos', 'Carlos'],
  ])('vuelve a pedir y normaliza el nombre "%s"', async (message, expectedName) => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(input('Quiero un corte mañana a las 3 de la tarde'));
    await coordinator.handleMessage(input('Ana Pérez'));

    const request = await coordinator.handleMessage(
      input('Quiero cambiar el nombre'),
    );

    expect(request.conversation.state).toBe('collecting-customer-data');
    expect(request.nextField).toBe('customerName');
    expect(request.conversation.data).toEqual({
      serviceId: 'cut-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
      requestedTime: '15:00',
      startsAt: new Date('2026-10-16T20:00:00.000Z'),
      endsAt: new Date('2026-10-16T20:30:00.000Z'),
      occupiedEndsAt: new Date('2026-10-16T20:30:00.000Z'),
    });

    const updated = await coordinator.handleMessage(input(message));

    expect(updated.conversation.data).toEqual({
      serviceId: 'cut-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
      requestedTime: '15:00',
      startsAt: new Date('2026-10-16T20:00:00.000Z'),
      endsAt: new Date('2026-10-16T20:30:00.000Z'),
      occupiedEndsAt: new Date('2026-10-16T20:30:00.000Z'),
      customerName: expectedName,
    });
    expect(updated.reply).toContain(`Nombre: ${expectedName}`);
    expect(updated.reply).toContain('Servicio: Corte de cabello');
  });

  it.each([
    'de Sara',
    'de Sara, gracias',
    'de Sara grasias',
    'a nombre de Sara',
    'Sara',
    'sara por favor',
    'es Sara',
    'gracias, de Sara',
  ])('interpreta "%s" como el nombre cuando el bot lo solicita', async (message) => {
    const { coordinator, input } = setup();
    const asked = await coordinator.handleMessage(
      input('Quiero un corte mañana a las 3 de la tarde'),
    );
    expect(asked.nextField).toBe('customerName');

    const result = await coordinator.handleMessage(input(message));

    expect(result.conversation.data.customerName).toBe('Sara');
    expect(result.conversation.state).toBe('awaiting-confirmation');
    expect(result.nextField).toBeNull();
    expect(result.reply).toContain('Nombre: Sara');
  });

  it.each(['gracias', 'muchas gracias', 'sí', 'mañana', 'jueves', 'por favor'])(
    'no acepta "%s" como nombre y sigue pidiéndolo',
    async (message) => {
      const { coordinator, input } = setup();
      await coordinator.handleMessage(
        input('Quiero un corte mañana a las 3 de la tarde'),
      );

      const result = await coordinator.handleMessage(input(message));

      expect(result.conversation.data.customerName).toBeUndefined();
      expect(result.nextField).toBe('customerName');
      expect(result.conversation.state).toBe('collecting-customer-data');
    },
  );

  it.each(['gracias', 'a nombre de gracias', 'me llamo mañana'])(
    'no sobrescribe un nombre válido con "%s"',
    async (message) => {
      const { coordinator, input } = setup();
      await coordinator.handleMessage(
        input('Quiero un corte mañana a las 3 de la tarde'),
      );
      const complete = await coordinator.handleMessage(input('Ana Pérez'));

      const result = await coordinator.handleMessage(input(message));

      expect(result.conversation.data.customerName).toBe('Ana Pérez');
      expect(result.conversation.data).toEqual(complete.conversation.data);
    },
  );

  it.each([
    'quiero cambiar la fecha de mañana para el jueves',
    'quiero cambiar la fecha para el jueves',
    'quiero cambiar la fecha del viernes al jueves',
    'cambia la fecha de mañana al jueves',
  ])('cambia la fecha en un solo mensaje: "%s"', async (message) => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(
      input('Quiero un corte mañana a las 3 de la tarde'),
    );
    const complete = await coordinator.handleMessage(input('Ana Pérez'));
    expect(complete.conversation.state).toBe('awaiting-confirmation');

    const result = await coordinator.handleMessage(input(message));

    expect(result.conversation.state).toBe('awaiting-confirmation');
    expect(result.nextField).toBeNull();
    expect(result.conversation.data).toEqual({
      serviceId: 'cut-1',
      requestedDate: new Date('2026-10-15T00:00:00.000Z'),
      requestedTime: '15:00',
      startsAt: new Date('2026-10-15T20:00:00.000Z'),
      endsAt: new Date('2026-10-15T20:30:00.000Z'),
      occupiedEndsAt: new Date('2026-10-15T20:30:00.000Z'),
      customerName: 'Ana Pérez',
    });
    expect(result.reply).toContain('Servicio: Corte de cabello');
    expect(result.reply).toContain('Nombre: Ana Pérez');
  });

  it('cambia la fecha en dos mensajes: «cambiar la fecha» y «para el jueves»', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(
      input('Quiero un corte mañana a las 3 de la tarde'),
    );
    await coordinator.handleMessage(input('Ana Pérez'));

    const request = await coordinator.handleMessage(input('cambiar la fecha'));

    expect(request.conversation.state).toBe('collecting-date');
    expect(request.nextField).toBe('requestedDate');
    expect(request.conversation.data).toEqual({
      serviceId: 'cut-1',
      requestedTime: '15:00',
      customerName: 'Ana Pérez',
    });

    const updated = await coordinator.handleMessage(input('para el jueves'));

    expect(updated.conversation.state).toBe('awaiting-confirmation');
    expect(updated.nextField).toBeNull();
    expect(updated.conversation.data).toEqual({
      serviceId: 'cut-1',
      requestedDate: new Date('2026-10-15T00:00:00.000Z'),
      requestedTime: '15:00',
      startsAt: new Date('2026-10-15T20:00:00.000Z'),
      endsAt: new Date('2026-10-15T20:30:00.000Z'),
      occupiedEndsAt: new Date('2026-10-15T20:30:00.000Z'),
      customerName: 'Ana Pérez',
    });
  });

  it('actualiza servicio, precio y duración al cambiar de servicio', async () => {
    const { coordinator, input } = setup(businessWithTwoServices());
    await coordinator.handleMessage(
      input('Quiero un corte mañana a las 3 de la tarde'),
    );
    await coordinator.handleMessage(input('Ana Pérez'));

    const result = await coordinator.handleMessage(
      input('Quiero cambiar el servicio a corte y barba'),
    );

    expect(result.conversation.data).toEqual({
      serviceId: 'cut-beard',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
      requestedTime: '15:00',
      startsAt: new Date('2026-10-16T20:00:00.000Z'),
      endsAt: new Date('2026-10-16T20:45:00.000Z'),
      occupiedEndsAt: new Date('2026-10-16T21:00:00.000Z'),
      customerName: 'Ana Pérez',
    });
    expect(result.reply).toContain('Servicio: Corte y barba');
    expect(result.reply).toContain('Duración: 45 minutos');
    expect(result.reply).toContain('Precio: $40.000 COP');
    expect(result.reply).toContain('Nombre: Ana Pérez');
  });

  it.each([
    [30, '2026-10-16T20:30:00.000Z', '2026-10-16T20:30:00.000Z'],
    [45, '2026-10-16T20:45:00.000Z', '2026-10-16T21:00:00.000Z'],
    [60, '2026-10-16T21:00:00.000Z', '2026-10-16T21:00:00.000Z'],
    [75, '2026-10-16T21:15:00.000Z', '2026-10-16T21:30:00.000Z'],
  ])(
    'calcula endsAt y occupiedEndsAt para un servicio de %i minutos',
    async (duration, endsAt, occupiedEndsAt) => {
      const { coordinator, input } = setup(businessWithDuration(duration));

      const result = await coordinator.handleMessage(
        input('Quiero un corte mañana a las 3 de la tarde'),
      );

      expect(result.conversation.data).toMatchObject({
        serviceId: 'service-1',
        requestedDate: new Date('2026-10-16T00:00:00.000Z'),
        requestedTime: '15:00',
        startsAt: new Date('2026-10-16T20:00:00.000Z'),
        endsAt: new Date(endsAt),
        occupiedEndsAt: new Date(occupiedEndsAt),
      });
      expect(result.conversation.state).toBe('collecting-customer-data');
      expect(result.nextField).toBe('customerName');
    },
  );

  it('rechaza una hora no alineada, la elimina y acepta la corrección', async () => {
    const { coordinator, input } = setup(businessWithDuration(30));
    await coordinator.handleMessage(
      input('Quiero un corte mañana a las 3 de la tarde'),
    );
    const complete = await coordinator.handleMessage(input('Ana Pérez'));

    const misaligned = await coordinator.handleMessage(
      input('Mejor a las 9:45 de la mañana'),
    );

    expect(misaligned.conversation.state).toBe('collecting-time');
    expect(misaligned.nextField).toBe('requestedTime');
    expect(misaligned.reply).toMatch(/no está alineada/i);
    expect(misaligned.reply).toMatch(/30 minutos/i);
    expect(misaligned.reply).not.toMatch(/disponible|alternativa/i);
    expect(misaligned.conversation.data).toEqual({
      serviceId: 'service-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
      customerName: 'Ana Pérez',
    });
    expect(getPendingReservationFields(misaligned.conversation.data)).toEqual([
      'requestedTime',
    ]);
    expect(complete.conversation.data.startsAt).toEqual(
      new Date('2026-10-16T20:00:00.000Z'),
    );

    const corrected = await coordinator.handleMessage(
      input('Dame entonces el turno de las 3pm'),
    );

    expect(corrected.conversation.state).toBe('awaiting-confirmation');
    expect(corrected.nextField).toBeNull();
    expect(corrected.conversation.data).toMatchObject({
      serviceId: 'service-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
      requestedTime: '15:00',
      startsAt: new Date('2026-10-16T20:00:00.000Z'),
      endsAt: new Date('2026-10-16T20:30:00.000Z'),
      occupiedEndsAt: new Date('2026-10-16T20:30:00.000Z'),
      customerName: 'Ana Pérez',
    });
    expect(corrected.reply).toContain('Nombre: Ana Pérez');
  });

  it('recupera la hora tras un rechazo y acepta las tres formas de corrección', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(
      input('Quiero un corte mañana a las 3 de la tarde'),
    );
    await coordinator.handleMessage(input('Ana Pérez'));

    const rejected = await coordinator.handleMessage(
      input('quiero cambiar la hora a laas 9:45pm'),
    );
    expect(rejected.conversation.state).toBe('collecting-time');
    expect(rejected.nextField).toBe('requestedTime');
    expect(rejected.reply).toMatch(/no cabe en el horario de atención/i);
    expect(rejected.conversation.data).toEqual({
      serviceId: 'cut-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
      customerName: 'Ana Pérez',
    });
    expect(getPendingReservationFields(rejected.conversation.data)).toEqual([
      'requestedTime',
    ]);

    for (const message of [
      'dame entonces el turno de las tres de la tarde',
      'tres pm',
      '3 pm',
    ]) {
      const corrected = await coordinator.handleMessage(input(message));

      expect(corrected.conversation.state).toBe('awaiting-confirmation');
      expect(corrected.nextField).toBeNull();
      expect(getPendingReservationFields(corrected.conversation.data)).toEqual(
        [],
      );
      expect(corrected.conversation.data).toEqual({
        serviceId: 'cut-1',
        requestedDate: new Date('2026-10-16T00:00:00.000Z'),
        requestedTime: '15:00',
        startsAt: new Date('2026-10-16T20:00:00.000Z'),
        endsAt: new Date('2026-10-16T20:30:00.000Z'),
        occupiedEndsAt: new Date('2026-10-16T20:30:00.000Z'),
        customerName: 'Ana Pérez',
      });
      expect(corrected.reply).toContain('Nombre: Ana Pérez');
    }
  });

  it('usa el intervalo configurado para alinear y ocupar bloques', async () => {
    const { coordinator, input } = setup(businessWithDuration(30, 60));

    const misaligned = await coordinator.handleMessage(
      input('Quiero un corte mañana a las 3:30 de la tarde'),
    );

    expect(misaligned.conversation.state).toBe('collecting-time');
    expect(misaligned.nextField).toBe('requestedTime');
    expect(misaligned.reply).toMatch(/60 minutos/i);
    expect(misaligned.conversation.data).toEqual({
      serviceId: 'service-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
    });
    expect(getPendingReservationFields(misaligned.conversation.data)).toEqual([
      'requestedTime',
      'customerName',
    ]);

    const aligned = await coordinator.handleMessage(
      input('Mejor a las 4 de la tarde'),
    );

    expect(aligned.conversation.data).toMatchObject({
      requestedTime: '16:00',
      startsAt: new Date('2026-10-16T21:00:00.000Z'),
      endsAt: new Date('2026-10-16T21:30:00.000Z'),
      occupiedEndsAt: new Date('2026-10-16T22:00:00.000Z'),
    });
  });

  it('rechaza un servicio que no cabe en el horario y conserva la solicitud', async () => {
    const { coordinator, input } = setup(businessWithDuration(75));

    const result = await coordinator.handleMessage(
      input('Quiero un corte mañana a las 5 de la tarde'),
    );

    expect(result.conversation.state).toBe('collecting-time');
    expect(result.nextField).toBe('requestedTime');
    expect(result.reply).toMatch(/no cabe en el horario/i);
    expect(result.reply).toMatch(/75 minutos/i);
    expect(result.conversation.data).toEqual({
      serviceId: 'service-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
    });
  });

  it('rechaza una fecha fuera de la ventana de reserva', async () => {
    const { coordinator, input } = setup();

    const result = await coordinator.handleMessage(
      input('Quiero un corte el próximo jueves a las 3 de la tarde'),
    );

    expect(result.conversation.state).toBe('collecting-date');
    expect(result.nextField).toBe('requestedDate');
    expect(result.reply).toMatch(/próximos 6 días/i);
    expect(result.conversation.data).toEqual({
      serviceId: 'cut-1',
      requestedTime: '15:00',
    });
    expect(getPendingReservationFields(result.conversation.data)).toEqual([
      'requestedDate',
      'customerName',
    ]);
  });

  it('rechaza un día cerrado al cambiar la fecha y conserva hora y nombre', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(
      input('Quiero un corte mañana a las 3 de la tarde'),
    );
    await coordinator.handleMessage(input('Ana Pérez'));

    const closed = await coordinator.handleMessage(input('Mejor el martes'));

    expect(closed.conversation.state).toBe('collecting-date');
    expect(closed.nextField).toBe('requestedDate');
    expect(closed.reply).toMatch(/no atiende ese día/i);
    expect(closed.conversation.data).toEqual({
      serviceId: 'cut-1',
      requestedTime: '15:00',
      customerName: 'Ana Pérez',
    });
    expect(getPendingReservationFields(closed.conversation.data)).toEqual([
      'requestedDate',
    ]);

    const corrected = await coordinator.handleMessage(input('Mejor el viernes'));

    expect(corrected.conversation.state).toBe('awaiting-confirmation');
    expect(corrected.nextField).toBeNull();
    expect(corrected.conversation.data).toMatchObject({
      serviceId: 'cut-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
      requestedTime: '15:00',
      startsAt: new Date('2026-10-16T20:00:00.000Z'),
      endsAt: new Date('2026-10-16T20:30:00.000Z'),
      occupiedEndsAt: new Date('2026-10-16T20:30:00.000Z'),
      customerName: 'Ana Pérez',
    });
    expect(corrected.reply).toContain('Nombre: Ana Pérez');
  });

  it('conserva los datos previos al incorporar datos parciales', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(input('Quiero un corte'));
    await coordinator.handleMessage(input('mañana'));

    const withTime = await coordinator.handleMessage(
      input('a las 3 de la tarde'),
    );

    expect(withTime.conversation.data).toMatchObject({
      serviceId: 'cut-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
      requestedTime: '15:00',
      startsAt: new Date('2026-10-16T20:00:00.000Z'),
    });
  });

  it('pide el siguiente dato faltante y conserva el estado ante una aclaración', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(input('Quiero un corte'));

    const result = await coordinator.handleMessage(input('no entiendo'));

    expect(result.conversation.state).toBe('collecting-date');
    expect(result.conversation.data).toEqual({ serviceId: 'cut-1' });
    expect(result.nextField).toBe('requestedDate');
    expect(result.reply).toMatch(/fecha/i);
  });

  it('explica el dato faltante y conserva datos válidos ante un mensaje de cortesía', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(input('Quiero un corte'));

    const result = await coordinator.handleMessage(input('gracias'));

    expect(result.conversation.state).toBe('collecting-date');
    expect(result.conversation.data).toEqual({ serviceId: 'cut-1' });
    expect(result.nextField).toBe('requestedDate');
    expect(result.reply).toMatch(/no logré reconocer ese dato/i);
    expect(result.reply).toMatch(/conservo estos datos válidos/i);
    expect(result.reply).toMatch(/servicio: ya registrado/i);
    expect(result.reply).toMatch(/fecha válida/i);
  });

  it('no usa una consulta de precios como respuesta al campo pendiente', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(input('Quiero un corte'));

    const result = await coordinator.handleMessage(
      input('¿Cuánto cuesta el corte?'),
    );

    expect(result.conversation.state).toBe('collecting-date');
    expect(result.conversation.data).toEqual({ serviceId: 'cut-1' });
    expect(result.nextField).toBe('requestedDate');
    expect(result.reply).toMatch(/fecha/i);
  });

  it('no conserva startsAt cuando la combinación de fecha y hora es inválida', async () => {
    const { store, coordinator, input } = setup();
    const seeded = seedConversation(store, {
      serviceId: 'cut-1',
      requestedDate: new Date('2026-10-16T00:00:00.000Z'),
      requestedTime: '25:00',
      startsAt: new Date('2026-10-16T20:00:00.000Z'),
      endsAt: new Date('2026-10-16T20:30:00.000Z'),
      customerName: 'Ana Pérez',
    });
    await store.save(seeded);

    const result = await coordinator.handleMessage(input('Quiero un corte'));

    expect(result.conversation.data.requestedDate).toEqual(
      new Date('2026-10-16T00:00:00.000Z'),
    );
    expect(result.conversation.data.requestedTime).toBeUndefined();
    expect(result.conversation.data.customerName).toBe('Ana Pérez');
    expect(result.conversation.data.startsAt).toBeUndefined();
    expect(result.conversation.data.endsAt).toBeUndefined();
    expect(result.conversation.state).toBe('collecting-time');
    expect(result.nextField).toBe('requestedTime');
    expect(getPendingReservationFields(result.conversation.data)).toEqual([
      'requestedTime',
    ]);
  });

  it('no confirma la reserva con un agradecimiento', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(input('Quiero un corte mañana a las 3 de la tarde'));
    const complete = await coordinator.handleMessage(input('Ana Pérez'));

    const result = await coordinator.handleMessage(input('gracias'));

    expect(result.conversation.state).toBe('awaiting-confirmation');
    expect(result.conversation.intent).toBe('thanks');
    expect(result.conversation.data).toEqual(complete.conversation.data);
    expect(result.reply).not.toContain('Resumen de tu cita');
    expect(result.reply).not.toMatch(/confirmación fue registrada/i);
    expect(result.nextField).toBeNull();
  });

  it('no confirma ni borra los datos ante un mensaje ambiguo', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(input('Quiero un corte mañana a las 3 de la tarde'));
    const complete = await coordinator.handleMessage(input('Ana Pérez'));

    const result = await coordinator.handleMessage(input('no entiendo'));

    expect(result.conversation.state).toBe('awaiting-confirmation');
    expect(result.conversation.intent).not.toBe('confirm-appointment');
    expect(result.conversation.data).toEqual(complete.conversation.data);
    expect(result.reply).not.toContain('Resumen de tu cita');
    expect(result.reply).not.toMatch(/confirmación fue registrada/i);
    expect(result.nextField).toBeNull();
  });

  it('no repite el resumen ante respuestas inesperadas', async () => {
    const { coordinator, input } = setup();
    await coordinator.handleMessage(input('Quiero un corte mañana a las 3 de la tarde'));
    const complete = await coordinator.handleMessage(input('Ana Pérez'));

    await coordinator.handleMessage(input('gracias'));
    await coordinator.handleMessage(input('buenos días'));
    const last = await coordinator.handleMessage(input('no entiendo'));

    const summaries = last.conversation.messages.filter(
      (entry) =>
        entry.direction === 'outgoing' &&
        entry.text.includes('Resumen de tu cita'),
    );

    expect(summaries).toHaveLength(1);
    expect(last.conversation.state).toBe('awaiting-confirmation');
    expect(last.conversation.data).toEqual(complete.conversation.data);
  });

  it('cancela la solicitud sin crear una cita', async () => {
    const { store, coordinator, input } = setup();
    await coordinator.handleMessage(input('Quiero un corte mañana a las 3 de la tarde'));
    await coordinator.handleMessage(input('Ana Pérez'));

    const result = await coordinator.handleMessage(input('cancelar'));

    expect(result.conversation.state).toBe('cancelled');
    expect(result.conversation.intent).toBe('cancel-appointment');
    expect(result.conversation.data).toEqual({});
    expect(result.reply).toMatch(/solicitud de reserva fue cancelada/i);
    expect(result.reply).toContain('No se creó ninguna cita');
    expect(result.conversation).not.toHaveProperty('status');
    await expect(
      store.getByContact('business-1', 'contact-1', now),
    ).resolves.toBeNull();
  });

  it('no confirma una solicitud cuya agenda ya no es válida', async () => {
    const { store, coordinator, input } = setup();
    const seeded = seedConversation(store, {
      serviceId: 'cut-1',
      requestedDate: new Date('2026-10-20T00:00:00.000Z'),
      requestedTime: '15:00',
      startsAt: new Date('2026-10-20T20:00:00.000Z'),
      endsAt: new Date('2026-10-20T20:30:00.000Z'),
      customerName: 'Ana Pérez',
    });
    await store.save(seeded);

    const result = await coordinator.handleMessage(input('Sí, confirmo'));

    expect(result.conversation.state).toBe('collecting-date');
    expect(result.conversation.intent).toBe('book-appointment');
    expect(result.nextField).toBe('requestedDate');
    expect(result.reply).toMatch(/no atiende ese día/i);
    expect(result.reply).not.toMatch(/confirmación fue registrada/i);
    expect(result.conversation.data).toEqual({
      serviceId: 'cut-1',
      requestedTime: '15:00',
      customerName: 'Ana Pérez',
    });
    expect(getPendingReservationFields(result.conversation.data)).toEqual([
      'requestedDate',
    ]);
  });

  it('reconfirma antes de crear la reserva y cierra tras el agradecimiento', async () => {
    const { store, reservations, coordinator, input } = setup();
    await coordinator.handleMessage(input('Quiero un corte mañana a las 3 de la tarde'));
    const complete = await coordinator.handleMessage(input('Ana Pérez'));

    const firstConfirmation = await coordinator.handleMessage(
      input('Sí, confirmo'),
    );

    expect(complete.conversation.state).toBe('awaiting-confirmation');
    expect(firstConfirmation.conversation.state).toBe(
      'awaiting-final-confirmation',
    );
    expect(firstConfirmation.reply).toMatch(/no se podrá modificar/i);
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toBeNull();

    const confirmation = await coordinator.handleMessage(
      input('Sí, confirmo'),
    );

    expect(confirmation.conversation.state).toBe('awaiting-acknowledgment');
    expect(confirmation.conversation.intent).toBe('confirm-appointment');
    expect(confirmation.reply).toContain('Tu cita quedó confirmada');
    expect(confirmation.reply).toContain('Corte de cabello');
    expect(confirmation.reply).toMatch(/solo puedes cancelarla/i);
    expect(confirmation.conversation.messages).toHaveLength(8);
    expect(confirmation.nextField).toBeNull();
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toMatchObject({
      businessId: 'business-1',
      contactId: 'contact-1',
      customerName: 'Ana Pérez',
      serviceId: 'cut-1',
      status: 'confirmed',
      startsAt: complete.conversation.data.startsAt,
      endsAt: complete.conversation.data.endsAt,
    });

    const acknowledgment = await coordinator.handleMessage(input('gracias'));
    expect(acknowledgment.conversation.state).toBe('completed');
    expect(acknowledgment.conversation.messages).toHaveLength(10);
    await expect(
      store.getByContact('business-1', 'contact-1', now),
    ).resolves.toBeNull();
  });

  it.each([
    'Sí, confirmar',
    'Sí, confirmo',
    'Sí, confirmo la cita',
    'Sí, la confirmo',
    'La confirmo',
    'Sí, la confirmo, gracias',
    'Confirmo, gracias',
    'Todo correcto',
    'Todo está correcto',
    'Los datos son correctos',
    'Confirmar cita',
  ])('reconoce la confirmación explícita "%s"', async (phrase) => {
    const { reservations, coordinator, input } = setup();
    await coordinator.handleMessage(input('Quiero un corte mañana a las 3 de la tarde'));
    const complete = await coordinator.handleMessage(input('Ana Pérez'));

    const confirmation = await coordinator.handleMessage(input(phrase));

    expect(confirmation.conversation.state).toBe(
      'awaiting-final-confirmation',
    );
    expect(confirmation.conversation.intent).toBe('confirm-appointment');
    expect(confirmation.conversation.data).toEqual(
      complete.conversation.data,
    );
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toBeNull();

    const finalConfirmation = await coordinator.handleMessage(
      input('Sí, confirmar'),
    );
    expect(finalConfirmation.conversation.state).toBe(
      'awaiting-acknowledgment',
    );
    await coordinator.handleMessage(input('gracias'));
    expect(finalConfirmation.reply).toContain('Tu cita quedó confirmada');
    await expect(
      reservations.getById('reservation:conversation-1'),
    ).resolves.toMatchObject({ status: 'confirmed' });
  });
});
