import type {
  ConfiguracionNegocio,
  Identifier,
} from '../types.js';
import type {
  ConversationCoordinator,
  IncomingConversationMessage,
  ConversationTurnResult,
} from '../conversation/coordinator.js';
import type { IncomingMessageStore } from './incoming-message-store.js';

export interface IncomingMessageTransport {
  sendMessage(chatId: string, body: string): Promise<void>;
}

export interface IncomingConversationHandler {
  handleMessage(
    input: IncomingConversationMessage,
  ): Promise<ConversationTurnResult>;
}

export interface ReceivedWhatsAppMessage {
  messageId: Identifier;
  contactId: Identifier;
  whatsappId: string;
  customerPhone?: string;
  body: string;
  receivedAt: Date;
}

// Tras estos intentos fallidos el mensaje sale de la cola para no bloquear al
// contacto. El runtime lo reintenta periódicamente mientras esté pendiente.
export const DEFAULT_MAX_FAILED_ATTEMPTS = 5;

export interface IncomingMessageProcessorOptions {
  maxFailedAttempts?: number;
}

export class IncomingMessageProcessor {
  private readonly contactTasks = new Map<Identifier, Promise<void>>();
  private readonly maxFailedAttempts: number;

  constructor(
    private readonly store: IncomingMessageStore,
    private readonly coordinator: IncomingConversationHandler,
    private readonly transport: IncomingMessageTransport,
    private readonly business: ConfiguracionNegocio,
    options: IncomingMessageProcessorOptions = {},
  ) {
    const maxFailedAttempts =
      options.maxFailedAttempts ?? DEFAULT_MAX_FAILED_ATTEMPTS;
    if (!Number.isSafeInteger(maxFailedAttempts) || maxFailedAttempts < 1) {
      throw new Error('maxFailedAttempts debe ser un entero mayor que cero');
    }
    this.maxFailedAttempts = maxFailedAttempts;
  }

  async recover(): Promise<void> {
    const recovered = await this.store.recoverInterrupted();
    if (recovered > 0) {
      console.info(`Mensajes interrumpidos recuperados: ${recovered}.`);
    }

    await this.drainPending();
  }

  async drainPending(): Promise<void> {
    await Promise.all(
      (await this.store.listUndeliveredContactIds()).map((contactId) =>
        this.processContact(contactId),
      ),
    );
  }

  async waitForCurrentWork(): Promise<void> {
    await Promise.all(this.contactTasks.values());
  }

  async accept(message: ReceivedWhatsAppMessage): Promise<void> {
    await this.store.enqueue({
      messageId: message.messageId,
      businessId: this.business.businessId,
      contactId: message.contactId,
      whatsappId: message.whatsappId,
      ...(message.customerPhone
        ? { customerPhone: message.customerPhone }
        : {}),
      body: message.body,
      receivedAt: message.receivedAt,
    });

    void this.processContact(message.contactId).catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(
        `No se pudo procesar la cola de mensajes del contacto ${message.contactId}: ${detail}`,
      );
    });
  }

  private async processContact(contactId: Identifier): Promise<void> {
    const active = this.contactTasks.get(contactId);
    if (active) return active;

    const task = this.drainContact(contactId);
    this.contactTasks.set(contactId, task);
    try {
      await task;
    } finally {
      if (this.contactTasks.get(contactId) === task) {
        this.contactTasks.delete(contactId);
      }
    }
  }

  private async drainContact(contactId: Identifier): Promise<void> {
    while (true) {
      let record = await this.store.getNextUndelivered(contactId);
      if (!record) return;

      if (record.status === 'pending') {
        record = await this.store.claim(record.messageId);
        if (!record) continue;

        try {
          const result = await this.coordinator.handleMessage({
            business: this.business,
            contactId: record.contactId,
            whatsappId: record.whatsappId,
            ...(record.customerPhone
              ? { customerPhone: record.customerPhone }
              : {}),
            messageId: record.messageId,
            receivedAt: record.receivedAt,
            message: record.body,
          });
          await this.store.saveReply(record.messageId, result.reply);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          console.error(
            `No se pudo procesar el mensaje ${record.messageId}: ${detail}`,
          );

          const nextAttempts = record.failedAttempts + 1;
          if (nextAttempts >= this.maxFailedAttempts) {
            try {
              await this.store.markFailed(record.messageId);
              console.error(
                `Mensaje ${record.messageId} en cuarentena tras ${nextAttempts} intentos fallidos.`,
              );
            } catch (quarantineError) {
              const quarantineDetail =
                quarantineError instanceof Error
                  ? quarantineError.message
                  : String(quarantineError);
              console.error(
                `No se pudo poner en cuarentena el mensaje ${record.messageId}: ${quarantineDetail}`,
              );
              return;
            }
            // Continúa con el siguiente mensaje del contacto.
            continue;
          }

          try {
            await this.store.retry(record.messageId);
          } catch (retryError) {
            const retryDetail =
              retryError instanceof Error
                ? retryError.message
                : String(retryError);
            console.error(
              `No se pudo reponer el mensaje ${record.messageId} en la cola: ${retryDetail}`,
            );
          }
          return;
        }

        record = await this.store.getNextUndelivered(contactId);
        if (!record) return;
      }

      if (record.status === 'reply-pending') {
        try {
          if (record.reply === undefined) {
            throw new Error(
              `El mensaje ${record.messageId} no contiene una respuesta pendiente.`,
            );
          }
          await this.transport.sendMessage(record.contactId, record.reply);
          await this.store.markSent(record.messageId);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          console.error(
            `No se pudo enviar la respuesta del mensaje ${record.messageId}: ${detail}`,
          );
          return;
        }
      } else {
        return;
      }
    }
  }
}
