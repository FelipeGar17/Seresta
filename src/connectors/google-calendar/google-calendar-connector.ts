import { createHash } from 'node:crypto';
import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import type { ConfiguracionNegocio, Reservation } from '../../core/types.js';
import type { ExistingAppointment } from '../../core/booking/appointment-schedule.js';
import type { ReservationCalendar } from '../../core/reservations/reservation-calendar.js';
import { combineDateAndTime } from '../../core/time/business-time.js';
import { createAuthenticatedGoogleCalendarClient } from './google-calendar-auth.js';

export interface CalendarBusyInterval {
  start: string;
  end: string;
}

export interface CalendarEvent {
  id?: string;
  extendedProperties?: { private?: Record<string, string> };
}

export interface CalendarEventInput {
  id: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  extendedProperties: { private: Record<string, string> };
}

export interface GoogleCalendarApi {
  listBusy(
    calendarId: string,
    from: Date,
    to: Date,
    timeZone: string,
    excludeEventId?: string,
  ): Promise<CalendarBusyInterval[]>;
  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent | null>;
  insertEvent(
    calendarId: string,
    event: CalendarEventInput,
  ): Promise<CalendarEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

const getHttpStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error && typeof error.code === 'number') return error.code;
  if ('response' in error && typeof error.response === 'object') {
    const response = error.response;
    if (
      response !== null &&
      'status' in response &&
      typeof response.status === 'number'
    ) {
      return response.status;
    }
  }
  return undefined;
};

const toCalendarEvent = (event: calendar_v3.Schema$Event): CalendarEvent => ({
  ...(event.id ? { id: event.id } : {}),
  ...(event.extendedProperties?.private
    ? { extendedProperties: { private: event.extendedProperties.private } }
    : {}),
});

const createGoogleCalendarApi = async (): Promise<GoogleCalendarApi> => {
  const auth = await createAuthenticatedGoogleCalendarClient();
  const calendar = google.calendar({ version: 'v3', auth });

  return {
    async listBusy(calendarId, from, to, timeZone, excludeEventId) {
      const intervals: CalendarBusyInterval[] = [];
      let pageToken: string | undefined;

      do {
        const response = await calendar.events.list({
          calendarId,
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          showDeleted: false,
          maxResults: 2500,
          ...(pageToken ? { pageToken } : {}),
        });

        for (const event of response.data.items ?? []) {
          if (
            event.id === excludeEventId ||
            event.status === 'cancelled' ||
            event.transparency === 'transparent'
          ) {
            continue;
          }

          const toIso = (
            value: calendar_v3.Schema$EventDateTime | undefined | null,
          ): string => {
            if (value?.dateTime) return new Date(value.dateTime).toISOString();
            if (value?.date) {
              const date = new Date(`${value.date}T00:00:00.000Z`);
              const midnight = combineDateAndTime(date, '00:00', timeZone);
              if (midnight) return midnight.toISOString();
            }
            throw new Error(
              `Google Calendar devolvió el evento "${event.id ?? '(sin id)'}" sin inicio o fin válido.`,
            );
          };

          intervals.push({
            start: toIso(event.start),
            end: toIso(event.end),
          });
        }

        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);

      return intervals;
    },
    async getEvent(calendarId, eventId) {
      try {
        const response = await calendar.events.get({ calendarId, eventId });
        return toCalendarEvent(response.data);
      } catch (error) {
        if (getHttpStatus(error) === 404) return null;
        throw error;
      }
    },
    async insertEvent(calendarId, event) {
      const response = await calendar.events.insert({
        calendarId,
        requestBody: event,
      });
      return toCalendarEvent(response.data);
    },
    async deleteEvent(calendarId, eventId) {
      try {
        await calendar.events.delete({ calendarId, eventId });
      } catch (error) {
        if (getHttpStatus(error) !== 404) throw error;
      }
    },
  };
};

export const createGoogleCalendarEventId = (
  reservationId: string,
): string => `appt${createHash('sha256').update(reservationId).digest('hex')}`;

export class GoogleCalendarConnector implements ReservationCalendar {
  constructor(private readonly api: GoogleCalendarApi) {}

  static async create(): Promise<GoogleCalendarConnector> {
    return new GoogleCalendarConnector(await createGoogleCalendarApi());
  }

  async listBusyAppointments(
    business: ConfiguracionNegocio,
    from: Date,
    to: Date,
    excludeReservationId?: string,
  ): Promise<ExistingAppointment[]> {
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new Error('El intervalo para consultar Calendar no es válido.');
    }

    const intervals = await this.api.listBusy(
      business.googleCalendarId,
      from,
      to,
      business.timezone,
      excludeReservationId
        ? createGoogleCalendarEventId(excludeReservationId)
        : undefined,
    );

    return intervals.map(({ start, end }) => {
      const startsAt = new Date(start);
      const endsAt = new Date(end);
      if (
        Number.isNaN(startsAt.getTime()) ||
        Number.isNaN(endsAt.getTime()) ||
        startsAt >= endsAt
      ) {
        throw new Error('Google Calendar devolvió un intervalo inválido.');
      }

      return {
        startsAt,
        endsAt,
        durationMinutes: (endsAt.getTime() - startsAt.getTime()) / 60_000,
      };
    });
  }

  async createReservationEvent(
    business: ConfiguracionNegocio,
    reservation: Reservation,
  ): Promise<string> {
    const eventId = createGoogleCalendarEventId(reservation.id);
    const existing = await this.api.getEvent(
      business.googleCalendarId,
      eventId,
    );
    if (existing) return this.validateExistingEvent(existing, reservation.id);

    const service = business.services.find(
      (candidate) => candidate.id === reservation.serviceId,
    );
    const description = [
      `Cliente: ${reservation.customerName}`,
      ...(reservation.customerPhone
        ? [`Teléfono: ${reservation.customerPhone}`]
        : []),
      `Servicio: ${service?.name ?? reservation.serviceId}`,
      `Reserva: ${reservation.id}`,
    ].join('\n');

    try {
      const created = await this.api.insertEvent(business.googleCalendarId, {
        id: eventId,
        summary: `Cita - ${reservation.customerName}`,
        description,
        start: {
          dateTime: reservation.startsAt.toISOString(),
          timeZone: business.timezone,
        },
        end: {
          dateTime: reservation.endsAt.toISOString(),
          timeZone: business.timezone,
        },
        extendedProperties: {
          private: {
            reservationId: reservation.id,
            businessId: business.businessId,
          },
        },
      });
      return this.validateExistingEvent(created, reservation.id);
    } catch (error) {
      if (getHttpStatus(error) !== 409) throw error;

      const duplicate = await this.api.getEvent(
        business.googleCalendarId,
        eventId,
      );
      if (!duplicate) throw error;
      return this.validateExistingEvent(duplicate, reservation.id);
    }
  }

  async deleteReservationEvent(
    business: ConfiguracionNegocio,
    reservation: Reservation,
  ): Promise<void> {
    await this.api.deleteEvent(
      business.googleCalendarId,
      reservation.googleCalendarEventId ??
        createGoogleCalendarEventId(reservation.id),
    );
  }

  private validateExistingEvent(
    event: CalendarEvent,
    reservationId: string,
  ): string {
    if (
      !event.id ||
      event.extendedProperties?.private?.reservationId !== reservationId
    ) {
      throw new Error(
        `El evento determinístico de Calendar no pertenece a la reserva "${reservationId}".`,
      );
    }
    return event.id;
  }
}
