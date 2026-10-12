import { google } from 'googleapis';
import { createOAuthClient, loadTokens } from './google-auth.js';

const CALENDAR_ID = process.env.CALENDAR_ID ?? 'primary';
const TIMEZONE = 'America/Bogota';

const tokens = await loadTokens();
if (!tokens) {
  console.error('No hay tokens. Ejecuta primero: npm run test:gcal-auth');
  process.exit(1);
}

const auth = await createOAuthClient();
auth.setCredentials(tokens);
const calendar = google.calendar({ version: 'v3', auth });

// Hora configurable: HORA=14 npm run ... (por defecto 10)
const hour = Number(process.env.HORA ?? 12);
const start = new Date();
start.setDate(start.getDate() + 1);
start.setHours(hour, 0, 0, 0);
const end = new Date(start.getTime() + 30 * 60 * 1000);

// 1. CONSULTAR disponibilidad primero
const overlapping = await calendar.events.list({
  calendarId: CALENDAR_ID,
  timeMin: start.toISOString(),
  timeMax: end.toISOString(),
  singleEvents: true,
  orderBy: 'startTime',
});

const blocking = (overlapping.data.items ?? []).filter(
  (e) => e.status !== 'cancelled' && e.transparency !== 'transparent',
);

console.log(`Franja ${start.toLocaleString()}: ${blocking.length ? 'OCUPADA' : 'libre'}`);

// 2. DECIDIR: si está ocupada, no crear
if (blocking.length > 0) {
  for (const e of blocking) console.log(`- Ocupada por: ${e.summary}`);
  console.log('No se crea el evento. Aquí el bot ofrecería alternativas.');
  process.exit(0);
}

// 3. CREAR solo si está libre
const created = await calendar.events.insert({
  calendarId: CALENDAR_ID,
  requestBody: {
    summary: 'Prueba MIPES bot',
    description: 'Evento creado por la prueba de conexión.',
    start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
    extendedProperties: { private: { source: 'mipes-bot' } },
  },
});
console.log('Evento creado:', created.data.id, created.data.htmlLink);