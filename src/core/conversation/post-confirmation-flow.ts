import type {
  Conversation,
  ConversationIntent,
} from '../types.js';
import { appendTurnMessages, type FlowReply } from './turn-utils.js';

export const POST_CONFIRMATION_ACK_TIMEOUT_MS = 60_000;

const ACKNOWLEDGMENT_PATTERN =
  /^(?:gracias|muchas gracias|mil gracias|ok|okay|listo|perfecto|de acuerdo|alla estare|alli estare|ahi estare|alla nos vemos|ahi nos vemos|nos vemos|entendido|confirmado|si)$/u;

export const isPostConfirmationAcknowledgment = (
  intent: ConversationIntent,
  normalized: string,
): boolean =>
  intent === 'thanks' ||
  intent === 'goodbye' ||
  intent === 'confirm-appointment' ||
  ACKNOWLEDGMENT_PATTERN.test(normalized);

export const handlePostConfirmationAcknowledgment = (
  conversation: Conversation,
  intent: ConversationIntent,
  message: string,
  now: Date,
): FlowReply => {
  const customerName = conversation.data.customerName?.trim();
  const reply = customerName
    ? `¡Con gusto, ${customerName}! Te esperamos.`
    : '¡Con gusto! Te esperamos.';

  conversation.state = 'completed';
  conversation.intent = intent;
  conversation.updatedAt = now;
  appendTurnMessages(conversation, message, reply, now);

  return { reply, nextField: null };
};
