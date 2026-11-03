import type {
  IncomingMessageTransport,
  ReceivedWhatsAppMessage,
} from '../../core/messaging/incoming-message-processor.js';

export interface WhatsAppConnector extends IncomingMessageTransport {
  start(
    onMessage: (message: ReceivedWhatsAppMessage) => Promise<void>,
    onReady: () => Promise<void>,
  ): Promise<void>;
  close(): Promise<void>;
}
