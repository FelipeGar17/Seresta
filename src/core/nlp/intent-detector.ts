import type { ConversationIntent } from '../types.js';
import { normalizeIntent } from './normalize.js';
import {
  intentNegations,
  intentSynonyms,
} from './synonyms.js';

export interface IntentDetectionOptions {
  lastBotQuestion?: string;
}

export interface DetailedIntentDetection {
  intent: ConversationIntent;
  // Todas las intenciones reconocidas, con la principal primero. Permite no
  // perder una solicitud secundaria (por ejemplo, reservar y consultar
  // precios en el mismo mensaje).
  intents: ConversationIntent[];
  score: number;
  matched: string[];
  // Reglas mencionadas pero anuladas por una negación explícita.
  negated: boolean;
  negatedIntents: ConversationIntent[];
  normalized: string;
}

type RuleName = keyof typeof intentSynonyms;

// El orden define la prioridad ante empates: las acciones sobre la reserva
// (cancelar, reprogramar, confirmar, rechazar, reservar) mandan sobre las
// consultas informativas; la despedida y el agradecimiento van antes que el
// saludo y la ayuda para que "gracias por la ayuda" se interprete como
// agradecimiento y no como solicitud de ayuda.
const RULES: Array<{ name: RuleName; intent: ConversationIntent }> = [
  { name: 'cancel', intent: 'cancel-appointment' },
  { name: 'reschedule', intent: 'reschedule-appointment' },
  { name: 'confirm', intent: 'confirm-appointment' },
  { name: 'reject', intent: 'reject-appointment' },
  { name: 'booking', intent: 'book-appointment' },
  { name: 'prices', intent: 'check-prices' },
  { name: 'availability', intent: 'check-availability' },
  { name: 'services', intent: 'list-services' },
  { name: 'appointment', intent: 'check-appointment' },
  { name: 'goodbye', intent: 'goodbye' },
  { name: 'thanks', intent: 'thanks' },
  { name: 'greeting', intent: 'greeting' },
  { name: 'help', intent: 'help' },
];

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const containsPhrase = (message: string, phrase: string): boolean => {
  const pattern = `(^|[^\\p{Letter}\\p{Number}])${escapeRegExp(
    phrase,
  )}([^\\p{Letter}\\p{Number}]|$)`;
  return new RegExp(pattern, 'u').test(message);
};


const matches = (message: string, phrases: readonly string[]): string[] => {
  const found = phrases
    .map(normalizeIntent)
    .filter(
      (phrase) =>
        phrase.length >= 3 && containsPhrase(message, phrase),
    );

  // Si una frase más específica ya coincide, descarta la frase
  // más corta que esté contenida en ella.
  return found.filter(
    (phrase) =>
      !found.some(
        (other) =>
          other !== phrase &&
          other.length > phrase.length &&
          other.includes(phrase),
      ),
  );
};


const isNegated = (
  message: string,
  ruleName: RuleName,
): boolean =>
  ruleName in intentNegations &&
  matches(
    message,
    intentNegations[ruleName as keyof typeof intentNegations],
  ).length > 0;

const AFFIRMATIVE_REPLY = /^(si|sí|claro|acepto|ok|okay|dale)(\s+gracias)?$/u;
const NEGATIVE_REPLY = /^(no|nunca)(\s+gracias)?$/u;

const contextualShortReply = (
  normalized: string,
  lastBotQuestion: string | undefined,
): ConversationIntent | undefined => {
  if (!lastBotQuestion) return undefined;

  const isAffirmative = AFFIRMATIVE_REPLY.test(normalized);
  const isNegative = NEGATIVE_REPLY.test(normalized);
  if (!isAffirmative && !isNegative) return undefined;

  const question = normalizeIntent(lastBotQuestion);
  if (/(confirm|acept)/u.test(question)) {
    return isNegative ? 'reject-appointment' : 'confirm-appointment';
  }
  return undefined;
};

// Devuelve trazabilidad para saber qué regla produjo la interpretación.
export function detectIntentDetailed(
  message: string,
  options: IntentDetectionOptions = {},
): DetailedIntentDetection {
  const normalized = normalizeIntent(message);
  const contextualIntent = contextualShortReply(
    normalized,
    options.lastBotQuestion,
  );
  if (contextualIntent) {
    return {
      intent: contextualIntent,
      intents: [contextualIntent],
      score: 1,
      matched: [normalized],
      negated: false,
      negatedIntents: [],
      normalized,
    };
  }

  const negatedIntents: ConversationIntent[] = [];
  const candidates = RULES.map((rule, priority) => {
    const negated = isNegated(normalized, rule.name);
    if (negated) negatedIntents.push(rule.intent);
    const matched = negated ? [] : matches(normalized, intentSynonyms[rule.name]);
    return { ...rule, matched, score: matched.length, priority };
  }).filter(({ score }) => score > 0);

  const ranked = candidates.sort(
    (left, right) =>
      right.score - left.score || left.priority - right.priority,
  );

  return {
    intent: ranked[0]?.intent ?? 'unknown',
    intents: ranked.map(({ intent }) => intent),
    score: ranked[0]?.score ?? 0,
    matched: ranked[0]?.matched ?? [],
    negated: negatedIntents.length > 0,
    negatedIntents,
    normalized,
  };
}

export function detectIntent(
  message: string,
  options: IntentDetectionOptions = {},
): ConversationIntent {
  return detectIntentDetailed(message, options).intent;
}
