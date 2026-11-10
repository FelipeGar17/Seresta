import type { Conversation } from '../types.js';
import { getLastBotQuestion } from './turn-utils.js';

// Listas numeradas de servicios y horarios. La selección numérica solo es
// válida cuando el bot acaba de ofrecer la lista y el flujo está en el paso
// correspondiente; nunca se interpreta durante una confirmación ni como hora.

export type OfferedOptionKind = 'service' | 'time';

export const OPTION_SELECTION_INSTRUCTION =
  'Responde solo con el número de la opción.';

// Un dígito por mensaje: evita listas enormes y selecciones ambiguas.
export const MAX_NUMBERED_OPTIONS = 9;

const SELECTION_PATTERN = /^(?:opcion(?: numero)? )?([1-9])$/u;

export const parseOptionSelection = (
  normalizedMessage: string,
): number | undefined => {
  const match = SELECTION_PATTERN.exec(normalizedMessage.trim());
  return match ? Number(match[1]) : undefined;
};

export const clearOfferedOptions = (conversation: Conversation): void => {
  delete conversation.offeredOptions;
};

export const setOfferedOptions = (
  conversation: Conversation,
  kind: OfferedOptionKind,
  values: readonly string[],
): void => {
  const shown = values.slice(0, MAX_NUMBERED_OPTIONS);
  if (shown.length === 0) {
    clearOfferedOptions(conversation);
    return;
  }

  conversation.offeredOptions = { kind, values: shown };
};

// Devuelve el valor asociado al número elegido, si el último mensaje del bot
// ofreció esa lista y el usuario respondió solo con un número válido.
export const resolveOfferedOption = (
  conversation: Conversation,
  normalizedMessage: string,
  kind: OfferedOptionKind,
): string | undefined => {
  const options = conversation.offeredOptions;
  if (!options || options.kind !== kind) return undefined;
  if (
    !getLastBotQuestion(conversation)?.includes(
      OPTION_SELECTION_INSTRUCTION,
    )
  ) {
    return undefined;
  }

  const selection = parseOptionSelection(normalizedMessage);
  return selection === undefined ? undefined : options.values[selection - 1];
};
