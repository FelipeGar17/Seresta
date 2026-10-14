import http from 'node:http';
import { createOAuthClient, REDIRECT_URI, SCOPES, saveTokens } from './google-auth.js';

const client = await createOAuthClient();

const authUrl = client.generateAuthUrl({
  access_type: 'offline', // necesario para obtener refresh_token
  prompt: 'consent',      // fuerza a Google a entregar el refresh_token
  scope: SCOPES,
});

const { port, pathname } = new URL(REDIRECT_URI);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '', REDIRECT_URI);
  if (url.pathname !== pathname) {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('Falta el código de autorización.');
    return;
  }

  try {
    const { tokens } = await client.getToken(code);
    await saveTokens(tokens);
    res.end('Autorización completada. Puedes cerrar esta pestaña.');
    console.log('Tokens guardados en .google_auth/tokens.json');
    console.log('¿Refresh token recibido?', Boolean(tokens.refresh_token));
  } catch (error) {
    res.writeHead(500).end('Error al obtener los tokens.');
    console.error(error);
  } finally {
    server.close();
  }
});

server.listen(Number(port), '127.0.0.1', () => {
  console.log('Abre esta URL en tu navegador y acepta los permisos:\n');
  console.log(authUrl);
});