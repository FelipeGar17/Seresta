import qrcode from 'qrcode-terminal';
import whatsapp from 'whatsapp-web.js';
import { isMessageReceivedAfterReady } from '../../core/messaging/incoming-message-policy.js';
import { extractPhoneFromContactId } from '../../core/messaging/whatsapp-contact.js';
import type { ReceivedWhatsAppMessage } from '../../core/messaging/incoming-message-processor.js';
import type { WhatsAppConnector } from './whatsapp-connector.js';

const { Client, LocalAuth } = whatsapp;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const getTextMessageBody = (body: unknown): string | undefined =>
  typeof body === 'string' && body.trim().length > 0 ? body : undefined;

export const getWhatsAppMessageId = (
  value: unknown,
  remoteFallback: string,
): string | undefined => {
  if (!isRecord(value)) return undefined;

  if (
    typeof value._serialized === 'string' &&
    value._serialized.trim().length > 0
  ) {
    return value._serialized;
  }

  const messagePart = value.id;
  const remote =
    typeof value.remote === 'string' && value.remote.trim().length > 0
      ? value.remote
      : remoteFallback;
  if (
    typeof messagePart !== 'string' ||
    messagePart.trim().length === 0 ||
    remote.trim().length === 0
  ) {
    return undefined;
  }

  const participant =
    typeof value.participant === 'string' ? value.participant : '';
  const fromMe = typeof value.fromMe === 'boolean' ? value.fromMe : false;
  return `wa:${JSON.stringify([fromMe, remote, participant, messagePart])}`;
};

export interface WhatsAppWebConnectorOptions {
  headless?: boolean;
  // Intentos de reconexión tras una caída ya estando listos. Con 0 no se
  // reintenta y se informa el fallo de inmediato.
  reconnectAttempts?: number;
  // Espera del primer reintento; se duplica en cada intento posterior.
  reconnectBaseDelayMs?: number;
  // Se invoca cuando se agotan los reintentos y hace falta intervención.
  onFatalError?: (error: Error) => void;
}

export class WhatsAppWebConnector implements WhatsAppConnector {
  private readonly client: InstanceType<typeof Client>;
  private readonly reconnectAttempts: number;
  private readonly reconnectBaseDelayMs: number;
  private readonly onFatalError?: (error: Error) => void;
  private readyAt?: Date;
  private intakeQueue: Promise<void> = Promise.resolve();
  private readinessTask: Promise<void> = Promise.resolve();
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private closing = false;

  constructor(options: WhatsAppWebConnectorOptions = {}) {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'sistema-citas',
        dataPath: '.wwebjs_auth',
      }),
      puppeteer: { headless: options.headless ?? false },
    });
    this.reconnectAttempts = options.reconnectAttempts ?? 5;
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 5_000;
    if (
      !Number.isSafeInteger(this.reconnectAttempts) ||
      this.reconnectAttempts < 0
    ) {
      throw new Error('reconnectAttempts debe ser un entero no negativo');
    }
    if (
      !Number.isFinite(this.reconnectBaseDelayMs) ||
      this.reconnectBaseDelayMs <= 0
    ) {
      throw new Error('reconnectBaseDelayMs debe ser un número mayor que cero');
    }
    this.onFatalError = options.onFatalError;
  }

  async start(
    onMessage: (message: ReceivedWhatsAppMessage) => Promise<void>,
    onReady: () => Promise<void>,
  ): Promise<void> {
    let resolveReadiness: (() => void) | undefined;
    let rejectReadiness: ((error: Error) => void) | undefined;
    let readinessSettled = false;
    let hasBeenReady = false;
    let reconnectAttempt = 0;
    const readiness = new Promise<void>((resolve, reject) => {
      resolveReadiness = resolve;
      rejectReadiness = reject;
    });

    const settleReadiness = (): void => {
      if (readinessSettled) return;
      readinessSettled = true;
      resolveReadiness?.();
    };

    const failBeforeReady = (error: Error): void => {
      if (readinessSettled) return;
      readinessSettled = true;
      rejectReadiness?.(error);
    };

    const scheduleReconnect = (reason: string): void => {
      if (this.closing || this.reconnectTimer) return;

      if (reconnectAttempt >= this.reconnectAttempts) {
        const error = new Error(
          `WhatsApp se desconectó (${reason}) y no se pudo reconectar tras ${reconnectAttempt} intentos.`,
        );
        console.error(error.message);
        if (this.onFatalError) {
          this.onFatalError(error);
        } else {
          process.exitCode = 1;
        }
        return;
      }

      reconnectAttempt += 1;
      const delayMs =
        this.reconnectBaseDelayMs * 2 ** (reconnectAttempt - 1);
      console.warn(
        `Reintentando conexión con WhatsApp en ${Math.round(delayMs / 1000)} s (intento ${reconnectAttempt}/${this.reconnectAttempts}).`,
      );

      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = undefined;
        if (this.closing) return;
        // whatsapp-web.js llama a destroy() al desconectarse; initialize()
        // vuelve a abrir el navegador con la sesión local ya guardada.
        this.client.initialize().catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          console.error(`Falló el intento de reconexión con WhatsApp: ${detail}`);
          scheduleReconnect(detail);
        });
      }, delayMs);
      this.reconnectTimer.unref?.();
    };

    this.client.on('qr', (qr: string) => {
      console.log('Escanea este código QR con WhatsApp:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('authenticated', () => {
      console.log('Sesión de WhatsApp autenticada.');
    });

    this.client.on('ready', () => {
      this.readyAt = new Date();
      hasBeenReady = true;
      reconnectAttempt = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
      }
      console.log(
        `WhatsApp listo para ${this.client.info.pushname ?? 'la cuenta autenticada'}.`,
      );

      this.readinessTask = this.readinessTask
        .catch(() => undefined)
        .then(onReady)
        .then(settleReadiness)
        .catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          console.error(`No se pudo recuperar la cola de WhatsApp: ${detail}`);
          failBeforeReady(error instanceof Error ? error : new Error(detail));
        });
    });

    this.client.on('message', (message) => {
      this.intakeQueue = this.intakeQueue
        .then(async () => {
          const contactId = message.from;
          if (typeof contactId !== 'string' || contactId.trim().length === 0) {
            console.error(
              'WhatsApp entregó un mensaje sin identificador de chat; se ignoró.',
            );
            return;
          }

          if (
            message.fromMe ||
            contactId.endsWith('@g.us') ||
            contactId.endsWith('@newsletter') ||
            contactId.endsWith('@broadcast')
          ) {
            return;
          }

          const body = getTextMessageBody(message.body);
          if (!body) {
            console.info(
              `Mensaje sin contenido de texto ignorado (tipo ${message.type ?? 'desconocido'}).`,
            );
            return;
          }

          const messageId = getWhatsAppMessageId(message.id, contactId);
          if (
            typeof messageId !== 'string' ||
            messageId.trim().length === 0
          ) {
            console.error(
              `WhatsApp entregó un mensaje de ${contactId} sin ID serializado; no se puede deduplicar y se ignoró.`,
            );
            return;
          }

          if (
            !this.readyAt ||
            !isMessageReceivedAfterReady(
              message.timestamp,
              this.readyAt,
            )
          ) {
            console.info(
              `Mensaje anterior a la conexión lista ignorado: ${contactId}. Envía un mensaje nuevo después de que WhatsApp esté listo.`,
            );
            return;
          }

          let whatsappId = contactId;
          let customerPhone: string | undefined;
          try {
            const contact = await message.getContact();
            whatsappId = contact.id._serialized;
            customerPhone = extractPhoneFromContactId(whatsappId);
            if (!customerPhone) {
              console.info(
                `No se obtuvo un teléfono internacional para ${contactId}; se conservarán sus identificadores de WhatsApp.`,
              );
            }
          } catch (error) {
            const detail =
              error instanceof Error ? error.message : String(error);
            console.error(
              `No se pudieron leer los datos del contacto ${contactId}; continuaré usando su id de chat: ${detail}`,
            );
          }

          await onMessage({
            messageId,
            contactId,
            whatsappId,
            ...(customerPhone ? { customerPhone } : {}),
            body,
            receivedAt: new Date(message.timestamp * 1000),
          });
        })
        .catch((error: unknown) => {
          const detail =
            error instanceof Error
              ? (error.stack ?? error.message)
              : String(error);
          console.error(`No se pudo registrar un mensaje de WhatsApp: ${detail}`);
        });
    });

    this.client.on('auth_failure', (message: string) => {
      console.error(`Falló la autenticación de WhatsApp: ${message}`);
      failBeforeReady(
        new Error(`Falló la autenticación de WhatsApp: ${message}`),
      );
    });

    this.client.on('disconnected', (reason: string) => {
      console.error(`WhatsApp se desconectó: ${reason}`);
      if (!hasBeenReady) {
        failBeforeReady(
          new Error(`WhatsApp se desconectó antes de estar listo: ${reason}`),
        );
        return;
      }
      if (this.closing) return;
      scheduleReconnect(reason);
    });

    await Promise.all([this.client.initialize(), readiness]);
  }

  async sendMessage(chatId: string, body: string): Promise<void> {
    await this.client.sendMessage(chatId, body);
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    await this.client.destroy();
    await this.intakeQueue;
    await this.readinessTask;
  }
}
