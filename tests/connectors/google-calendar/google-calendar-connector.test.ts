import { describe, expect, it, vi } from 'vitest';
import type { ConfiguracionNegocio, Reservation } from '../../../src/core/types.js';
import {
  createGoogleCalendarEventId,
  GoogleCalendarConnector,
  type GoogleCalendarApi,
} from '../../../src/connectors/google-calendar/google-calendar-connector.js';

const business: ConfiguracionNegocio = {
  businessId: 'business-1',
  name: 'Barbería',
  timezone: 'America/Bogota',
  whatsappNumber: '+573000000000',
  googleCalendarId: 'calendar-1',
  services: [
    {
      id: 'cut-1',
      businessId: 'business-1',
      name: 'Corte',
      price: 20_000,
      durationMinutes: 30,
      active: true,
    },
  ],
};

const reservation: Reservation = {
  id: 'reservation-1',
  businessId: business.businessId,
  contactId: 'contact-1@lid',
  whatsappId: '573000000001@c.us',
  customerPhone: '+573000000001',
  customerName: 'Ana',
  serviceId: 'cut-1',
  startsAt: new Date('2026-10-16T20:00:00.000Z'),
  endsAt: new Date('2026-10-16T20:30:00.000Z'),
  status: 'pending',
  createdAt: new Date('2026-10-15T15:00:00.000Z'),
  updatedAt: new Date('2026-10-15T15:00:00.000Z'),
};

describe('GoogleCalendarConnector', () => {
  it('consulta intervalos ocupados excluyendo el evento de la misma reserva', async () => {
    const listBusy = vi.fn<GoogleCalendarApi['listBusy']>().mockResolvedValue([
      {
        start: '2026-10-16T20:00:00.000Z',
        end: '2026-10-16T20:30:00.000Z',
      },
    ]);
    const api: GoogleCalendarApi = {
      listBusy,
      getEvent: vi.fn().mockResolvedValue(null),
      insertEvent: vi.fn(),
      deleteEvent: vi.fn(),
    };
    const connector = new GoogleCalendarConnector(api);
    const from = new Date('2026-10-16T05:00:00.000Z');
    const to = new Date('2026-10-17T05:00:00.000Z');

    await expect(
      connector.listBusyAppointments(business, from, to, reservation.id),
    ).resolves.toEqual([
      {
        startsAt: new Date('2026-10-16T20:00:00.000Z'),
        endsAt: new Date('2026-10-16T20:30:00.000Z'),
        durationMinutes: 30,
      },
    ]);
    expect(listBusy).toHaveBeenCalledWith(
      business.googleCalendarId,
      from,
      to,
      business.timezone,
      createGoogleCalendarEventId(reservation.id),
    );
  });

  it('reutiliza el evento determinístico al reintentar una creación', async () => {
    const events = new Map<
      string,
      { id: string; extendedProperties: { private: Record<string, string> } }
    >();
    const api: GoogleCalendarApi = {
      listBusy: vi.fn().mockResolvedValue([]),
      getEvent: vi.fn(async (_calendarId, eventId) => events.get(eventId) ?? null),
      insertEvent: vi.fn(async (_calendarId, event) => {
        const created = {
          id: event.id,
          extendedProperties: event.extendedProperties,
        };
        events.set(event.id, created);
        return created;
      }),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
    };
    const connector = new GoogleCalendarConnector(api);

    const first = await connector.createReservationEvent(business, reservation);
    const retried = await connector.createReservationEvent(
      business,
      reservation,
    );

    expect(retried).toBe(first);
    expect(first).toBe(createGoogleCalendarEventId(reservation.id));
    expect(api.insertEvent).toHaveBeenCalledTimes(1);
    expect(api.getEvent).toHaveBeenCalledTimes(2);
  });

  it('rechaza intervalos inválidos que devuelva la fuente de agenda', async () => {
    const connector = new GoogleCalendarConnector({
      listBusy: vi.fn().mockResolvedValue([
        { start: 'fecha-invalida', end: '2026-10-16T20:30:00.000Z' },
      ]),
      getEvent: vi.fn().mockResolvedValue(null),
      insertEvent: vi.fn(),
      deleteEvent: vi.fn(),
    });

    await expect(
      connector.listBusyAppointments(
        business,
        new Date('2026-10-16T05:00:00.000Z'),
        new Date('2026-10-17T05:00:00.000Z'),
      ),
    ).rejects.toThrow(/intervalo inválido/i);
  });
});
