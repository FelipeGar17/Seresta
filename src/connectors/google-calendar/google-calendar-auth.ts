import { google } from 'googleapis';
import type { Auth } from 'googleapis';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const AUTH_DIRECTORY = join(process.cwd(), '.google_auth');
const CLIENT_FILE = join(AUTH_DIRECTORY, 'client_secret.json');
const TOKEN_FILE = join(AUTH_DIRECTORY, 'tokens.json');

export const GOOGLE_CALENDAR_REDIRECT_URI =
  'http://127.0.0.1:3000/oauth2callback';
export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
];

const isMissingFile = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT';

export async function loadGoogleCalendarTokens(): Promise<Auth.Credentials | null> {
  let contents: string;
  try {
    contents = await readFile(TOKEN_FILE, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }

  return JSON.parse(contents) as Auth.Credentials;
}

export async function saveGoogleCalendarTokens(
  tokens: Auth.Credentials,
): Promise<void> {
  await mkdir(AUTH_DIRECTORY, { recursive: true });
  await writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
}

export async function createGoogleCalendarOAuthClient() {
  let contents: string;
  try {
    contents = await readFile(CLIENT_FILE, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      throw new Error(
        'Falta .google_auth/client_secret.json. Guarda ahí las credenciales OAuth de Google Cloud.',
      );
    }
    throw error;
  }

  const credentials: unknown = JSON.parse(contents);
  if (typeof credentials !== 'object' || credentials === null) {
    throw new Error('El archivo de credenciales OAuth de Google no es válido.');
  }

  const configured =
    'installed' in credentials && credentials.installed
      ? credentials.installed
      : 'web' in credentials
        ? credentials.web
        : undefined;
  if (
    typeof configured !== 'object' ||
    configured === null ||
    !('client_id' in configured) ||
    typeof configured.client_id !== 'string' ||
    !('client_secret' in configured) ||
    typeof configured.client_secret !== 'string'
  ) {
    throw new Error(
      'Las credenciales OAuth deben incluir client_id y client_secret.',
    );
  }

  const client = new google.auth.OAuth2(
    configured.client_id,
    configured.client_secret,
    GOOGLE_CALENDAR_REDIRECT_URI,
  );
  client.on('tokens', (newTokens) => {
    void loadGoogleCalendarTokens()
      .then((current) =>
        saveGoogleCalendarTokens({ ...(current ?? {}), ...newTokens }),
      )
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`No se pudieron guardar los tokens renovados: ${detail}`);
      });
  });

  return client;
}

export async function createAuthenticatedGoogleCalendarClient() {
  const tokens = await loadGoogleCalendarTokens();
  if (!tokens) {
    throw new Error(
      'No hay tokens OAuth de Google Calendar. Ejecuta npm run calendar:auth.',
    );
  }

  const auth = await createGoogleCalendarOAuthClient();
  auth.setCredentials(tokens);
  return auth;
}
