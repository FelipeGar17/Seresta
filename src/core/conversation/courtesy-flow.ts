import type {
  ConfiguracionNegocio,
  Conversation,
  ConversationIntent,
} from '../types.js';
import { getEntryOptionsReply } from './entry-replies.js';
import { appendTurnMessages, type FlowReply } from './turn-utils.js';

// Flujo de cortesía: saludo, agradecimiento y despedida. Solo actúa fuera de
// una reserva en curso: los saludos ocurren antes de iniciarla y las
// despedidas después de confirmar o cancelar (la conversación ya cerró y el
// siguiente mensaje llega como una conversación nueva). No persiste.

export interface CourtesyFlowInput {
  conversation: Conversation;
  intent: ConversationIntent;
  business: ConfiguracionNegocio;
  message: string;
  now: Date;
}

const getReply = (
  intent: ConversationIntent,
  business: ConfiguracionNegocio,
): string => {
  if (intent === 'greeting') {
    return `¡Hola! 👋 Bienvenido a ${business.name}.\n\n${getEntryOptionsReply()}`;
  }
  if (intent === 'thanks') {
    return `😊 ¡Con gusto!\n\n${getEntryOptionsReply()}`;
  }
  return '¡Hasta luego! 👋 Cuando quieras, aquí estaré.';
};

export function handleCourtesyFlow(input: CourtesyFlowInput): FlowReply {
  const { conversation, intent, business, message, now } = input;
  const reply = getReply(intent, business);

  conversation.intent = intent;
  conversation.updatedAt = now;
  appendTurnMessages(conversation, message, reply, now);

  return { reply, nextField: null };
}

export const isCourtesyTurn = (
  intent: ConversationIntent,
  activeBooking: boolean,
): boolean =>
  !activeBooking &&
  (intent === 'greeting' || intent === 'thanks' || intent === 'goodbye');
