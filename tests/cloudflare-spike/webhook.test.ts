import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import worker, {
  type D1Database,
  type Env,
} from '../../spikes/cloudflare-viability/src/index.js';

const VERIFY_TOKEN = 'local-test-verify-token';
const APP_SECRET = 'local-test-app-secret';

const makeDatabase = () => {
  const messages = new Set<string>();
  const database: D1Database = {
    prepare(query: string) {
      if (!query.startsWith('INSERT OR IGNORE INTO webhook_messages')) {
        throw new Error(`Unexpected SQL in webhook spike: ${query}`);
      }
      let messageId = '';
      return {
        bind(id: string) {
          messageId = id;
          return this;
        },
        async run() {
          const wasInserted = !messages.has(messageId);
          messages.add(messageId);
          return { success: true, meta: { changes: wasInserted ? 1 : 0 } };
        },
      };
    },
  };
  return { database, messages };
};

const signedPost = (body: string): Request => {
  const signature = createHmac('sha256', APP_SECRET).update(body).digest('hex');
  return new Request('https://seresta.example/webhook', {
    method: 'POST',
    headers: { 'x-hub-signature-256': `sha256=${signature}` },
    body,
  });
};

const payloadWithMessage = (id: string): string =>
  JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: { messages: [{ id, from: 'private-contact' }] },
          },
        ],
      },
    ],
  });

const makeEnv = (): { env: Env; messages: Set<string> } => {
  const { database, messages } = makeDatabase();
  return {
    env: {
      DB: database,
      META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
      META_APP_SECRET: APP_SECRET,
    },
    messages,
  };
};

describe('Cloudflare webhook viability spike', () => {
  it('answers Meta subscription verification only with the configured token', async () => {
    const { env } = makeEnv();
    const valid = await worker.fetch(
      new Request(
        `https://seresta.example/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=challenge-123`,
      ),
      env,
    );
    const invalid = await worker.fetch(
      new Request(
        'https://seresta.example/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123',
      ),
      env,
    );

    expect(valid.status).toBe(200);
    expect(await valid.text()).toBe('challenge-123');
    expect(invalid.status).toBe(403);
  });

  it('rejects invalid HMAC signatures without persisting message data', async () => {
    const { env, messages } = makeEnv();
    const response = await worker.fetch(
      new Request('https://seresta.example/webhook', {
        method: 'POST',
        headers: { 'x-hub-signature-256': 'sha256=00' },
        body: payloadWithMessage('wamid.invalid-signature'),
      }),
      env,
    );

    expect(response.status).toBe(401);
    expect(messages.size).toBe(0);
  });

  it('persists message IDs idempotently and does not store contact data', async () => {
    const { env, messages } = makeEnv();
    const body = payloadWithMessage('wamid.test-message');

    const first = await worker.fetch(signedPost(body), env);
    const retry = await worker.fetch(signedPost(body), env);

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(messages).toEqual(new Set(['wamid.test-message']));
    expect([...messages].join()).not.toContain('private-contact');
  });

  it('rejects malformed JSON after validating its signature', async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(signedPost('{'), env);

    expect(response.status).toBe(400);
  });
});
