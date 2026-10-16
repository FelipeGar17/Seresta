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
  score: number;
  matched: string[];
  normalized: string;
}

type RuleName = keyof typeof intentSynonyms;

const RULES: Array<{ name: RuleName; intent: ConversationIntent }> = [
  { name: 'cancel', intent: 'cancel-appointment' },
  { name: 'reschedule', intent: 'reschedule-appointment' },
  { name: 'confirm', intent: 'confirm-appointment' },
  { name: 'reject', intent: 'reject-appointment' },
  { name: 'prices', intent: 'check-prices' },
  { name: 'availability', intent: 'check-availability' },
  { name: 'services', intent: 'list-services' },
  { name: 'booking', intent: 'book-appointment' },
  { name: 'appointment', intent: 'check-appointment' },
  { name: 'help', intent: 'help' },
  { name: 'goodbye', intent: 'goodbye' },
  { name: 'greeting', intent: 'greeting' },
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

const contextualShortReply = (
  normalized: string,
  lastBotQuestion: string | undefined,
): ConversationIntent | undefined => {
  if (!lastBotQuestion || !/^(si|sí|claro|acepto|ok|okay|dale)$/u.test(normalized)) {
    if (!lastBotQuestion || !/^(no|nunca)$/u.test(normalized)) return undefined;
  }

  const question = normalizeIntent(lastBotQuestion);
  if (/(confirm|acept)/u.test(question)) {
    return /^(no|nunca)$/u.test(normalized)
      ? 'reject-appointment'
      : 'confirm-appointment';
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
      score: 1,
      matched: [normalized],
      normalized,
    };
  }

  const candidates = RULES.map((rule, priority) => {
    const matched = isNegated(normalized, rule.name)
      ? []
      : matches(normalized, intentSynonyms[rule.name]);
    return { ...rule, matched, score: matched.length, priority };
  }).filter(({ score }) => score > 0);

  const winner = candidates.sort(
    (left, right) =>
      right.score - left.score || left.priority - right.priority,
  )[0];

  return {
    intent: winner?.intent ?? 'unknown',
    score: winner?.score ?? 0,
    matched: winner?.matched ?? [],
    normalized,
  };
}

export function detectIntent(
  message: string,
  options: IntentDetectionOptions = {},
): ConversationIntent {
  return detectIntentDetailed(message, options).intent;
}
