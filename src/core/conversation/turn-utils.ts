import type { Conversation, ConversationMessage } from '../types.js';
import type { ReservationProgressField } from './reservation-progress.js';

// Resultado común de un flujo: el coordinador se encarga de persistir.
export interface FlowReply {
  reply: string;
  nextField: ReservationProgressField | null;
}

export const getLastBotQuestion = (
  conversation: Conversation,
): string | undefined =>
  [...conversation.messages]
    .reverse()
    .find((message) => message.direction === 'outgoing')?.text;

export const getShortReplyContext = (
  conversation: Conversation,
): 'booking-confirmation' | undefined =>
  conversation.state === 'awaiting-confirmation' ||
  conversation.state === 'awaiting-final-confirmation'
    ? 'booking-confirmation'
    : undefined;

export const appendTurnMessages = (
  conversation: Conversation,
  incomingText: string,
  reply: string,
  now: Date,
): void => {
  const nextIndex = conversation.messages.length + 1;
  const messages: ConversationMessage[] = [
    {
      id: `${conversation.id}:message:${nextIndex}`,
      direction: 'incoming',
      text: incomingText,
      createdAt: now,
    },
    {
      id: `${conversation.id}:message:${nextIndex + 1}`,
      direction: 'outgoing',
      text: reply,
      createdAt: now,
    },
  ];

  conversation.messages.push(...messages);
};
