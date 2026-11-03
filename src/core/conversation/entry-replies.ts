import type { ConversationIntent } from '../types.js';

const ENTRY_MENU_INSTRUCTION = 'Responde 1, 2 o 3.';

export const getInitialWelcomeReply = (businessName: string): string =>
  `¡Hola! 👋 Bienvenido a ${businessName}.\n\n${getEntryOptionsReply()}`;

export const getEntryOptionsReply = (): string =>
  [
    '¿Qué quieres hacer?',
    '1. 📅 Iniciar una reserva (agendar una cita)',
    '2. 💰 Consultar servicios y precios',
    '3. ❌ Cancelar una cita confirmada',
    ENTRY_MENU_INSTRUCTION,
  ].join('\n');

export const getUnrecognizedEntryReply = (): string =>
  [
    'No alcancé a identificar qué necesitas 😅.',
    getEntryOptionsReply(),
  ].join('\n');

const ENTRY_MENU_SELECTIONS: readonly ConversationIntent[] = [
  'book-appointment',
  'check-prices',
  'cancel-appointment',
];

export const getEntryMenuSelectionIntent = (
  normalizedMessage: string,
  lastBotReply: string | undefined,
): ConversationIntent | undefined => {
  if (!lastBotReply?.includes(ENTRY_MENU_INSTRUCTION)) return undefined;

  const match = /^(?:opcion(?: numero)? )?([1-3])$/u.exec(normalizedMessage);
  return match
    ? ENTRY_MENU_SELECTIONS[Number(match[1]) - 1]
    : undefined;
};

const ACTION_LABELS: Partial<Record<ConversationIntent, string>> = {
  'book-appointment': 'agendar una cita',
  'cancel-appointment': 'cancelar una cita',
  'reschedule-appointment': 'cambiar una cita',
  'confirm-appointment': 'confirmar la cita',
  'reject-appointment': 'no confirmar la cita',
};

export const getIntentClarificationReply = (
  intents: readonly ConversationIntent[],
): string =>
  [
    'Veo acciones distintas y no quiero equivocarme 🤔.',
    '¿Cuál quieres realizar?',
    ...intents
      .map((intent) => ACTION_LABELS[intent])
      .filter((label): label is string => label !== undefined)
      .map((label) => `• ${label}.`),
    'No he confirmado ni cancelado nada.',
  ].join('\n');

export const getCatalogFollowUpReply = (): string => getEntryOptionsReply();
