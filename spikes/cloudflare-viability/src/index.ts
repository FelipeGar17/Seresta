export interface D1Result {
  success: boolean;
}

export interface D1PreparedStatement {
  bind(...values: string[]): D1PreparedStatement;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface Env {
  DB: D1Database;
  META_WEBHOOK_VERIFY_TOKEN: string;
  META_APP_SECRET: string;
}

interface WebhookMessage {
  id?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const hexToBytes = (hex: string): Uint8Array | undefined => {
  if (!/^(?:[0-9a-f]{2})+$/iu.test(hex)) return undefined;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

const constantTimeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
};

const verifyWebhookSignature = async (
  body: ArrayBuffer,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> => {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const signature = hexToBytes(signatureHeader.slice('sha256='.length));
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, body),
  );
  return constantTimeEqual(signature, expected);
};

const matchesSecret = (candidate: string, expected: string): boolean => {
  const candidateBytes = new TextEncoder().encode(candidate);
  const expectedBytes = new TextEncoder().encode(expected);
  return constantTimeEqual(candidateBytes, expectedBytes);
};

const extractMessageIds = (payload: unknown): string[] => {
  if (!isRecord(payload) || !Array.isArray(payload.entry)) return [];
  const ids = new Set<string>();

  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value)) continue;
      const messages = change.value.messages;
      if (!Array.isArray(messages)) continue;
      for (const message of messages as WebhookMessage[]) {
        if (typeof message?.id === 'string' && message.id.length > 0) {
          ids.add(message.id);
        }
      }
    }
  }

  return [...ids];
};

const jsonResponse = (status: number, body: Record<string, unknown>): Response =>
  Response.json(body, { status });

const handleVerification = (request: Request, env: Env): Response => {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const tokenMatches =
    token !== null && matchesSecret(token, env.META_WEBHOOK_VERIFY_TOKEN);

  if (
    mode !== 'subscribe' ||
    token === null ||
    challenge === null ||
    !tokenMatches
  ) {
    return new Response('Forbidden', { status: 403 });
  }
  return new Response(challenge, { status: 200 });
};

const handleNotification = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  const body = await request.arrayBuffer();
  const signatureValid = await verifyWebhookSignature(
    body,
    request.headers.get('x-hub-signature-256'),
    env.META_APP_SECRET,
  );
  if (!signatureValid) return new Response('Unauthorized', { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const messageIds = extractMessageIds(payload);
  for (const messageId of messageIds) {
    const result = await env.DB.prepare(
      'INSERT OR IGNORE INTO webhook_messages (message_id, received_at) VALUES (?, ?)',
    )
      .bind(messageId, new Date().toISOString())
      .run();
    if (!result.success) {
      return jsonResponse(503, { error: 'Could not persist webhook event' });
    }
  }

  return jsonResponse(200, { status: 'accepted', messageCount: messageIds.length });
};

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/webhook') return new Response('Not found', { status: 404 });

    if (request.method === 'GET') return handleVerification(request, env);
    if (request.method === 'POST') return handleNotification(request, env);
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, POST' },
    });
  },
};

export default worker;
