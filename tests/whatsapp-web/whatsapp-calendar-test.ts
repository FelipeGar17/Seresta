import crypto from 'node:crypto';
import qrcode from 'qrcode-terminal';
import whatsapp from 'whatsapp-web.js';
import type { Message } from 'whatsapp-web.js';
import { google } from 'googleapis';
import { createOAuthClient, loadTokens } from './google-auth.js';

const { Client, LocalAuth } = whatsapp;

// ---------- Configuración de la prueba ----------
const CALENDAR_ID = process.env.CALENDAR_ID ?? 'primary';
const TIMEZONE = 'America/Bogota';
const TTL_MS = Number(process.env.TTL_MIN ?? 15) * 60 * 1000; // expiración de conversación
const SLOT_MIN = 30; // duración de la cita
const DAY_START = 9; // primera hora del día (9:00)
const DAY_END = 17; // última hora de cierre (17:00)
const SEARCH_DAYS = 7; // cuántos días hacia adelante buscar hueco
const MAX_ATTEMPTS = 3;

// ---------- Google Calendar ----------
const tokens = await loadTokens();
if (!tokens) {
  console.error('No hay tokens. Ejecuta primero: npm run test:gcal-auth');
  process.exit(1);
}
const auth = await createOAuthClient();
auth.setCredentials(tokens);
const calendar = google.calendar({ version: 'v3', auth });

type Interval = { start: number; end: number };
const overlaps = (a: Interval, b: Interval) => a.start < b.end && a.end > b.start;

async function getBusyIntervals(from: Date, to: Date): Promise<Interval[]> {
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });

  const busy: Interval[] = [];
  for (const e of res.data.items ?? []) {
    if (e.status === 'cancelled' || e.transparency === 'transparent') continue;
    if (e.start?.dateTime && e.end?.dateTime) {
      busy.push({ start: Date.parse(e.start.dateTime), end: Date.parse(e.end.dateTime) });
    } else if (e.start?.date && e.end?.date) {
      // Evento de día completo: bloquea todo el día
      busy.push({
        start: new Date(`${e.start.date}T00:00:00`).getTime(),
        end: new Date(`${e.end.date}T00:00:00`).getTime(),
      });
    }
  }
  return busy;
}

async function findFirstFreeSlot(): Promise<Interval | null> {
  const first = new Date();
  first.setDate(first.getDate() + 1); // desde mañana
  first.setHours(DAY_START, 0, 0, 0);
  const last = new Date(first);
  last.setDate(first.getDate() + SEARCH_DAYS);
  last.setHours(DAY_END, 0, 0, 0);

  const busy = await getBusyIntervals(first, last);

  for (let d = 0; d < SEARCH_DAYS; d++) {
    const day = new Date(first);
    day.setDate(first.getDate() + d);
    for (let m = DAY_START * 60; m + SLOT_MIN <= DAY_END * 60; m += SLOT_MIN) {
      const start = new Date(day);
      start.setHours(Math.floor(m / 60), m % 60, 0, 0);
      const slot = { start: start.getTime(), end: start.getTime() + SLOT_MIN * 60_000 };
      if (!busy.some((b) => overlaps(slot, b))) return slot;
    }
  }
  return null;
}

async function isSlotFree(slot: Interval): Promise<boolean> {
  const busy = await getBusyIntervals(new Date(slot.start), new Date(slot.end));
  return !busy.some((b) => overlaps(slot, b));
}

type Booking = { start: Date; end: Date; link?: string | null };

async function createBooking(phone: string, name: string, waMessageId: string): Promise<Booking | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const slot = await findFirstFreeSlot();
    if (!slot) return null;

    // Revalidar justo antes de insertar (mitiga condiciones de carrera)
    if (!(await isSlotFree(slot))) {
      console.log(`Intento ${attempt}: el hueco se ocupó, buscando otro...`);
      continue;
    }

    const start = new Date(slot.start);
    const end = new Date(slot.end);

    // ID determinístico: misma persona + mismo horario = mismo ID (idempotencia).
    // Hex usa solo 0-9 y a-f, válido para los IDs de Google Calendar (a-v, 0-9).
    const eventId = 'mipes' + crypto.createHash('sha1').update(`${phone}|${start.toISOString()}`).digest('hex').slice(0, 30);

    try {
      const res = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        requestBody: {
          id: eventId,
          summary: `Cita - ${name}`,
          description: `Cliente: ${name}\nTeléfono: ${phone}\nCreado por MIPES bot (prueba).`,
          start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
          end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
          extendedProperties: { private: { source: 'mipes-bot', phone, waMessageId } },
        },
      });
      // Solo devolvemos éxito si Google confirmó el ID
      if (!res.data.id) throw new Error('Google no devolvió el ID del evento');
      return { start, end, link: res.data.htmlLink };
    } catch (error: any) {
      if (error?.code === 409) {
        console.log('El evento ya existía (ID duplicado). Se trata como ya creado.');
        return { start, end };
      }
      throw error;
    }
  }
  return null;
}

// ---------- Utilidades de conversación ----------
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const formatDate = (d: Date) =>
  d.toLocaleString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TIMEZONE,
  });

type Session = { state: 'esperando_palabra' | 'creado'; lastActivity: number };
const sessions = new Map<string, Session>();
const processedIds = new Set<string>(); // deduplicación de mensajes
const locks = new Set<string>(); // evita procesar dos mensajes del mismo chat a la vez

async function handleMessage(message: Message) {
  const chatId = message.from;
  const now = Date.now();

  let session = sessions.get(chatId);

  if (session && now - session.lastActivity > TTL_MS) {
    console.log(`[${chatId}] Conversación expirada; se descarta el contexto.`);
    sessions.delete(chatId);
    session = undefined;
  }

  // Si ya había terminado, cualquier mensaje nuevo inicia otra conversación
  if (session?.state === 'creado') {
    sessions.delete(chatId);
    session = undefined;
  }

  if (!session) {
    sessions.set(chatId, { state: 'esperando_palabra', lastActivity: now });
    await message.reply('¡Hola! Soy el bot de prueba de MIPES. 👋\nPara la prueba, responde con la palabra: *prueba*');
    return;
  }

  session.lastActivity = now;

  if (normalize(message.body) !== 'prueba') {
    await message.reply('Para continuar con la prueba, responde con la palabra: *prueba*');
    return;
  }

  // Datos del cliente
  const contact = await message.getContact().catch(() => null);
  const name = contact?.pushname || contact?.name || 'Cliente WhatsApp';
  const phone = contact?.number || chatId.split('@')[0];

  const booking = await createBooking(
    phone,
    name,
    message.id?._serialized ?? `sin-id-${Date.now()}`,
  );

  if (!booking) {
    await message.reply('Lo siento, no encontré horarios disponibles en los próximos días.');
    return;
  }

  session.state = 'creado';
  await message.reply(`✅ Cita reservada para ${formatDate(booking.start)} (${SLOT_MIN} min). ¡Gracias, ${name}!`);
  console.log(`[${chatId}] Evento creado: ${booking.link ?? '(ya existía)'}`);
}

// ---------- WhatsApp ----------
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'mipes-bot', dataPath: '.wwebjs_auth' }),
  puppeteer: { headless: false },
});

client.on('qr', (qr: string) => {
  console.log('Escanea este código QR con WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('Sesión de WhatsApp autenticada.'));

client.on('ready', () => {
  console.log(`Bot listo (${client.info.pushname ?? 'cuenta autenticada'}). Calendario: ${CALENDAR_ID}`);
  console.log(`Expiración de conversación: ${TTL_MS / 60000} min.`);
  console.log('Escribe desde OTRO celular para iniciar la prueba.');
});

client.on('message', async (message) => {
  if (message.fromMe || !message.body?.trim()) return;
  if (message.from.endsWith('@g.us') || message.from.endsWith('@newsletter') || message.from === 'status@broadcast') {
    return;
  }

  // ID del mensaje: puede venir en distintos campos según la versión de la librería
  const msgId: string | undefined =
    message.id?._serialized ?? (message as any)._data?.id?._serialized;

  if (msgId) {
    if (processedIds.has(msgId)) {
      console.log(`Mensaje duplicado ignorado: ${msgId}`);
      return;
    }
    processedIds.add(msgId);
  } else {
    // Sin ID confiable no deduplicamos por ID (nunca por "undefined")
    console.warn('Mensaje sin ID; se procesa sin deduplicar por ID.');
  }

  if (locks.has(message.from)) {
    console.log(`[${message.from}] Ya hay un mensaje en proceso; se ignora este.`);
    return;
  }
  locks.add(message.from);

  console.log(`Mensaje de ${message.from}: ${message.body}`);
  console.log('DEBUG id:', JSON.stringify(message.id), '| tipo:', message.type, '| from:', message.from);

  try {
    await handleMessage(message);
  } catch (error: any) {
    console.error('Error procesando el mensaje:', error);
    if (JSON.stringify(error?.response?.data ?? '').includes('invalid_grant')) {
      console.error('⚠️ El token de Google fue revocado o caducó. Hay que reautorizar: npm run test:gcal-auth');
    }
    // Nunca confirmamos una cita si algo falló
    await message.reply('Tuve un problema técnico y no pude completar la reserva. Intenta de nuevo en un momento.').catch(() => {});
  } finally {
    locks.delete(message.from);
  }
});

client.on('auth_failure', (m: string) => console.error(`Falló la autenticación: ${m}`));
client.on('disconnected', (reason: string) => console.error(`WhatsApp se desconectó: ${reason}`));

const shutdown = async (signal: string) => {
  console.log(`\n${signal}: cerrando la conexión...`);
  await client.destroy();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

console.log('Iniciando prueba integrada WhatsApp + Google Calendar...');
void client.initialize();