import http from 'node:http';
import {
  createGoogleCalendarOAuthClient,
  GOOGLE_CALENDAR_REDIRECT_URI,
  GOOGLE_CALENDAR_SCOPES,
  saveGoogleCalendarTokens,
} from './google-calendar-auth.js';

const client = await createGoogleCalendarOAuthClient();
const authorizationUrl = client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: GOOGLE_CALENDAR_SCOPES,
});
const redirect = new URL(GOOGLE_CALENDAR_REDIRECT_URI);
let completed = false;

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', GOOGLE_CALENDAR_REDIRECT_URI);
  if (url.pathname !== redirect.pathname) {
    response.writeHead(404).end();
    return;
  }

  const authorizationCode = url.searchParams.get('code');
  if (!authorizationCode) {
    response.writeHead(400).end('Falta el código de autorización.');
    return;
  }

  try {
    const { tokens } = await client.getToken(authorizationCode);
    await saveGoogleCalendarTokens(tokens);
    completed = true;
    response.end('Autorización completada. Puedes cerrar esta pestaña.');
    console.log('Tokens guardados localmente en .google_auth/tokens.json.');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    response.writeHead(500).end('No se pudo completar la autorización.');
    console.error(`Error al obtener los tokens de Google: ${detail}`);
  } finally {
    server.close();
  }
});

server.listen(Number(redirect.port), '127.0.0.1', () => {
  console.log('Abre esta URL y autoriza el acceso al calendario:\n');
  console.log(authorizationUrl);
});

server.on('close', () => {
  if (!completed) process.exitCode = 1;
});
