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
  console.log('Cierra el proceso con Ctrl+C y vuelve a iniciarlo para probar el reinicio.');
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

console.log('Iniciando prueba de conexión de whatsapp-web.js...');
void client.initialize();
