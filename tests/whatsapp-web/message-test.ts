import qrcode from 'qrcode-terminal';
import whatsapp from 'whatsapp-web.js';

const { Client, LocalAuth } = whatsapp;

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
  console.log('Sesión autenticada. Los datos se están guardando localmente.');
});

client.on('ready', () => {
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

  console.log(`Mensaje detectado de ${message.from}: ${message.body}`);

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
