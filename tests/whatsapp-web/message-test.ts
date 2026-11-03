import qrcode from 'qrcode-terminal';
import whatsapp from 'whatsapp-web.js';
import { extractPhoneFromContactId } from '../../src/core/messaging/whatsapp-contact.js';

const { Client, LocalAuth } = whatsapp;
let whatsappReadyAt: Date | undefined;

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'mipes-bot',
    dataPath: '.wwebjs_auth',
  }),
  puppeteer: {
    headless: false,
  },
});

client.on('qr', (qr: string) => {
  console.log('Escanea este código QR con WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('Sesión de WhatsApp autenticada.');
});

client.on('ready', () => {
  whatsappReadyAt = new Date();
  console.log(`Conexión lista para ${client.info.pushname ?? 'la cuenta autenticada'}.`);
  console.log('Envía un mensaje directo a esta cuenta para probar la lectura y respuesta.');
});

client.on('message', async (message) => {
  if (message.fromMe || !message.body.trim()) {
    return;
  }

  if (message.from.endsWith('@newsletter') || message.from.endsWith('@g.us')) {
    console.log(`Mensaje ignorado por no ser un chat directo: ${message.from}`);
    return;
  }
  if (
    !whatsappReadyAt ||
    !Number.isSafeInteger(message.timestamp) ||
    message.timestamp < Math.ceil(whatsappReadyAt.getTime() / 1000)
  ) {
    console.log(
      `Mensaje anterior a la conexión lista ignorado: ${message.from}. Envía un mensaje nuevo después de que WhatsApp esté listo.`,
    );
    return;
  }

  console.log(`Mensaje detectado de ${message.from}: ${message.body}`);
  console.log(
    `Fecha del mensaje: ${new Date(message.timestamp * 1000).toISOString()}`,
  );
  console.log(`Tipo de mensaje: ${message.type}`);
  console.log('rawData completo del mensaje:');
  console.dir(message.rawData, { depth: null });

  try {
    const contact = await message.getContact();
    console.log(
      'Identidad reportada por whatsapp-web.js:',
      JSON.stringify(
        {
          messageFrom: message.from,
          messageTo: message.to,
          groupAuthor: message.author ?? null,
          messageId: message.id._serialized,
          messageRemote: message.id.remote,
          contactId: contact.id._serialized,
          customerPhone: extractPhoneFromContactId(contact.id._serialized) ?? null,
          contactNumber: contact.number,
          contactName: contact.name ?? null,
          contactPushname: contact.pushname,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error('No se pudo consultar la identidad del contacto:', error);
  }

  try {
    await message.reply('¡Hola! Recibí tu mensaje. Esta es una prueba aislada.');
    console.log('Saludo enviado correctamente.');
  } catch (error) {
    console.error('No se pudo responder al mensaje:', error);
  }
});

client.on('auth_failure', (message: string) => {
  console.error(`Falló la autenticación: ${message}`);
});

client.on('disconnected', (reason: string) => {
  console.error(`WhatsApp se desconectó: ${reason}`);
});

const shutdown = async (signal: string) => {
  console.log(`\n${signal}: cerrando la conexión...`);
  await client.destroy();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

console.log('Iniciando prueba aislada de lectura y respuesta...');
void client.initialize();
