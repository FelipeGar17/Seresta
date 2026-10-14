import { describe, expect, it } from 'vitest';
import { MemoryConversationStore } from '../../../src/core/conversation/memory-store.js';
import type { Conversation } from '../../../src/core/types.js';

const createConversation = (
  overrides: Partial<Conversation> = {},
): Conversation => ({
  id: 'conversation-1',
  businessId: 'business-1',
  contactId: 'contact-1',
  whatsappId: 'whatsapp-contact-1',
  customerPhone: '+5215555555555',
  intent: 'book-appointment',
  state: 'collecting-service',
  messages: [],
  data: {},
  expiresAt: null,
  createdAt: new Date('2026-10-13T10:00:00.000Z'),
  updatedAt: new Date('2026-10-13T10:00:00.000Z'),
  ...overrides,
});

describe('MemoryConversationStore', () => {
  it('saves and retrieves conversations by id', async () => {
    const store = new MemoryConversationStore();
    const conversation = createConversation();

    await store.save(conversation);

    await expect(store.get(conversation.id)).resolves.toBe(conversation);
  });

  it('returns null for an unknown identifier', async () => {
    const store = new MemoryConversationStore();

    await expect(store.get('missing')).resolves.toBeNull();
  });

  it('finds the active conversation by business and contact', async () => {
    const store = new MemoryConversationStore();
    const now = new Date('2026-10-13T10:15:00.000Z');
    const conversation = createConversation();
    await store.save(conversation);
    await store.save(
      createConversation({
        id: 'conversation-2',
        businessId: 'business-2',
      }),
    );
    await store.save(
      createConversation({
        id: 'expired-conversation',
        expiresAt: new Date('2026-10-13T10:14:59.000Z'),
      }),
    );
    await store.save(
      createConversation({
        id: 'completed-conversation',
        state: 'completed',
      }),
    );

    await expect(
      store.getByContact(
        conversation.businessId,
        conversation.contactId,
        now,
      ),
    ).resolves.toBe(conversation);
  });

  it('updates an existing conversation and rejects unknown ids', async () => {
    const store = new MemoryConversationStore();
    const conversation = createConversation();
    await store.save(conversation);
    const updated = {
      ...conversation,
      state: 'awaiting-confirmation' as const,
      data: {
        serviceId: 'service-1',
        customerName: 'Ana',
      },
    };

    await store.update(updated);

    await expect(store.get(conversation.id)).resolves.toBe(updated);
    await expect(store.get(conversation.id)).resolves.toMatchObject({
      data: {
        serviceId: 'service-1',
        customerName: 'Ana',
      },
      state: 'awaiting-confirmation',
    });
    await expect(
      store.update(createConversation({ id: 'missing' })),
    ).rejects.toThrow('does not exist');
  });

  it('deletes conversations and removes expired ones only', async () => {
    const store = new MemoryConversationStore();
    const active = createConversation({ id: 'active', expiresAt: null });
    const expired = createConversation({
      id: 'expired',
      expiresAt: new Date('2026-10-13T10:14:59.000Z'),
    });
    await store.save(active);
    await store.save(expired);

    await expect(
      store.deleteExpired(new Date('2026-10-13T10:15:00.000Z')),
    ).resolves.toBe(1);
    await expect(store.get('expired')).resolves.toBeNull();
    await expect(store.get('active')).resolves.toBe(active);

    await store.delete(active.id);
    await expect(store.get(active.id)).resolves.toBeNull();
  });
});
