import type { ConversationIntent } from '../types.js';
import { normalizeText } from './normalize.js';
import { intentSynonyms } from './synonyms.js';

const containsAny = (message: string, phrases: readonly string[]): boolean =>
  phrases.some((phrase) => message.includes(phrase));

// Detecta la intención con reglas ordenadas para resolver frases con varias
// palabras clave, por ejemplo "quiero cancelar mi cita".
export function detectIntent(message: string): ConversationIntent {
  const normalizedMessage = normalizeText(message);

  if (!normalizedMessage) return 'unknown';
  if (containsAny(normalizedMessage, intentSynonyms.cancel)) {
    return 'cancel-appointment';
  }
  if (containsAny(normalizedMessage, intentSynonyms.reschedule)) {
    return 'reschedule-appointment';
  }
  if (containsAny(normalizedMessage, intentSynonyms.prices)) {
    return 'check-prices';
  }
  if (containsAny(normalizedMessage, intentSynonyms.availability)) {
    return 'check-availability';
  }
  if (containsAny(normalizedMessage, intentSynonyms.services)) {
    return 'list-services';
  }
  if (containsAny(normalizedMessage, intentSynonyms.appointment)) {
    return 'check-appointment';
  }
  if (containsAny(normalizedMessage, intentSynonyms.reject)) {
    return 'reject-appointment';
  }
  if (containsAny(normalizedMessage, intentSynonyms.confirm)) {
    return 'confirm-appointment';
  }
  if (containsAny(normalizedMessage, intentSynonyms.booking)) {
    return 'book-appointment';
  }
  if (containsAny(normalizedMessage, intentSynonyms.greeting)) {
    return 'greeting';
  }
  if (containsAny(normalizedMessage, intentSynonyms.goodbye)) {
    return 'goodbye';
  }
  if (containsAny(normalizedMessage, intentSynonyms.help)) {
    return 'help';
  }

  return 'unknown';
}
