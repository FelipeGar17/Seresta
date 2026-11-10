import type { Identifier } from '../types.js';

export type IncomingMessageStatus =
  | 'pending'
  | 'processing'
  | 'reply-pending'
  | 'sent'
  // Falló demasiadas veces: se conserva para diagnóstico pero deja de
  // bloquear la cola del contacto.
  | 'failed';

export interface IncomingMessageRecord {
  messageId: Identifier;
  businessId: Identifier;
  contactId: Identifier;
  whatsappId: string;
  customerPhone?: string;
  body: string;
  receivedAt: Date;
  status: IncomingMessageStatus;
  reply?: string;
  failedAttempts: number;
}

export type IncomingMessageInput = Pick<
  IncomingMessageRecord,
  'messageId' | 'businessId' | 'contactId' | 'body' | 'receivedAt'
> &
  Partial<Pick<IncomingMessageRecord, 'whatsappId' | 'customerPhone'>>;

export interface IncomingMessageStore {
  enqueue(message: IncomingMessageInput): Promise<boolean>;
  listUndeliveredContactIds(): Promise<Identifier[]>;
  getNextUndelivered(contactId: Identifier  ): Promise<IncomingMessageRecord | null>;
  claim(messageId: Identifier): Promise<IncomingMessageRecord | null>;
  saveReply(messageId: Identifier, reply: string): Promise<void>;
  markSent(messageId: Identifier): Promise<void>;
  retry(messageId: Identifier): Promise<void>;
  // Saca el mensaje de la cola definitivamente (cuarentena).
  markFailed(messageId: Identifier): Promise<void>;
  recoverInterrupted(): Promise<number>;
}
