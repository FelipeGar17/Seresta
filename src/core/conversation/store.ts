import type { Conversation, Identifier } from '../types.js';

export interface ConversationStore {
  get(id: Identifier): Promise<Conversation | null>;
  getByContact(
    businessId: Identifier,
    contactId: Identifier,
    now?: Date,
  ): Promise<Conversation | null>;
  save(conversation: Conversation): Promise<void>;
  update(conversation: Conversation): Promise<void>;
  delete(id: Identifier): Promise<void>;
  deleteExpired(now?: Date): Promise<number>;
}
