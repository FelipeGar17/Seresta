import type { Conversation, Identifier } from '../types.js';
import type { ConversationStore } from './store.js';

export class MemoryConversationStore implements ConversationStore {
  private readonly conversations = new Map<Identifier, Conversation>();

  async get(id: Identifier): Promise<Conversation | null> {
    return this.conversations.get(id) ?? null;
  }

  async getByContact(
    businessId: Identifier,
    contactId: Identifier,
    now: Date = new Date(),
  ): Promise<Conversation | null> {
    return [...this.conversations.values()].find(
      (conversation) =>
        conversation.businessId === businessId &&
        conversation.contactId === contactId &&
        conversation.state !== 'completed' &&
        conversation.state !== 'cancelled' &&
        conversation.state !== 'expired' &&
        (conversation.expiresAt === null || conversation.expiresAt > now),
    ) ?? null;
  }

  async save(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, conversation);
  }

  async update(conversation: Conversation): Promise<void> {
    if (!this.conversations.has(conversation.id)) {
      throw new Error(`Conversation "${conversation.id}" does not exist`);
    }

    this.conversations.set(conversation.id, conversation);
  }

  async delete(id: Identifier): Promise<void> {
    this.conversations.delete(id);
  }

  async deleteExpired(now: Date = new Date()): Promise<number> {
    let deleted = 0;

    for (const [id, conversation] of this.conversations) {
      if (conversation.expiresAt !== null && conversation.expiresAt <= now) {
        this.conversations.delete(id);
        deleted += 1;
      }
    }

    return deleted;
  }
}
