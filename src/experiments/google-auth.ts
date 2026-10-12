import { google } from "googleapis";
import type { Auth } from "googleapis";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const AUTH_DIR = ".google_auth";
const CLIENT_FILE = `${AUTH_DIR}/client_secret.json`;
const TOKEN_FILE = `${AUTH_DIR}/tokens.json`;

export const REDIRECT_URI = "http://127.0.0.1:3000/oauth2callback";
export const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

export async function loadTokens(): Promise<Auth.Credentials | null> {
  try {
    return JSON.parse(await readFile(TOKEN_FILE, "utf8"));
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: Auth.Credentials): Promise<void> {
  await mkdir(AUTH_DIR, { recursive: true });
  await writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export async function createOAuthClient() {
  const raw = JSON.parse(await readFile(CLIENT_FILE, "utf8"));
  const { client_id, client_secret } = raw.installed ?? raw.web;
  const client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

  // Cuando la librería renueva el access token, lo guardamos.
  // Google solo envía el refresh_token la primera vez, por eso se fusiona
  // con lo que ya teníamos en vez de reemplazarlo.
  client.on("tokens", async (newTokens) => {
    const current = (await loadTokens()) ?? {};
    await saveTokens({ ...current, ...newTokens });
    console.log("Tokens renovados y guardados.");
  });

  return client;
}
