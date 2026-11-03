import type { ConversationIntent, ServiceCatalogEntry } from '../types.js';
import { normalizeIntent } from './normalize.js';
import {
  detectCatalogFrames,
  detectGenericFrames,
  type IntentFrame,
} from './intent-frames.js';
import {
  intentNegations,
  intentSynonyms,
  type IntentRuleName,
} from './synonyms.js';
import {
  decideIntent,
  type IntentPolicyDecision,
} from './intent-policy.js';

export interface IntentDetectionOptions {
  lastBotQuestion?: string;
  shortReplyContext?: 'booking-confirmation';
  // Catálogo de servicios del negocio. Cuando está presente (incluso vacío)
  // el catálogo es la única fuente de verdad sobre qué es un servicio; sin
  // catálogo el detector solo puede usar patrones genéricos.
  services?: ServiceCatalogEntry[];
}

export interface DetailedIntentDetection {
  intent: ConversationIntent;
  // Todas las intenciones reconocidas, con la principal primero. Permite no
  // perder una solicitud secundaria (por ejemplo, reservar y consultar
  // precios en el mismo mensaje).
  intents: ConversationIntent[];
  score: number;
  matched: string[];
  // Marcos de intención detectados ("quiero un ___"). Son evidencia de
  // respaldo: pueden no determinar la intención principal.
  frames: IntentFrame[];
  // Reglas mencionadas pero anuladas por una negación explícita.
  negated: boolean;
  negatedIntents: ConversationIntent[];
  normalized: string;
  decision: IntentPolicyDecision;
}

type RuleName = IntentRuleName;

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


const negationsByRule: Partial<Record<RuleName, readonly string[]>> =
  intentNegations;

const isNegated = (message: string, ruleName: RuleName): boolean =>
  matches(message, negationsByRule[ruleName] ?? []).length > 0;

const AFFIRMATIVE_REPLY =
  /^(si|sí|claro|claro que si|por supuesto|acepto|ok|okay|dale|dale pues|de una|listo|perfecto|vale|bueno|con gusto|si se[nñ]or|si se[nñ]ora)(\s+gracias)?$/u;
const NEGATIVE_REPLY = /^(no|nunca|no se[nñ]or|no se[nñ]ora)(\s+gracias)?$/u;

const CONFIRMATION_QUESTION = /\b(?:confirm\w*|acept\w*)/u;

const contextualShortReply = (
  normalized: string,
  shortReplyContext: IntentDetectionOptions['shortReplyContext'],
  lastBotQuestion: string | undefined,
): ConversationIntent | undefined => {
  const isAffirmative = AFFIRMATIVE_REPLY.test(normalized);
  const isNegative = NEGATIVE_REPLY.test(normalized);
  if (!isAffirmative && !isNegative) return undefined;

  if (shortReplyContext === 'booking-confirmation') {
    return isNegative ? 'reject-appointment' : 'confirm-appointment';
  }

  if (!lastBotQuestion) return undefined;

  const question = normalizeIntent(lastBotQuestion);
  if (CONFIRMATION_QUESTION.test(question)) {
    return isNegative ? 'reject-appointment' : 'confirm-appointment';
  }
  return undefined;
};

// Niveles de evidencia. El orden define la prioridad:
// 1. reglas de sinónimos (expresiones generales del negocio),
// 2. marcos respaldados por el catálogo (mención de un servicio configurado),
// 3. marcos genéricos (estructura sin saber qué servicios existen).
const TIER_SYNONYM = 1;
const TIER_CATALOG_FRAME = 2;
const TIER_GENERIC_FRAME = 3;

interface IntentCandidate {
  intent: ConversationIntent;
  matched: string[];
  score: number;
  priority: number;
  tier: number;
}

// Devuelve trazabilidad para saber qué regla produjo la interpretación.
export function detectIntentDetailed(
  message: string,
  options: IntentDetectionOptions = {},
): DetailedIntentDetection {
  const normalized = normalizeIntent(message);
  const contextualIntent = contextualShortReply(
    normalized,
    options.shortReplyContext,
    options.lastBotQuestion,
  );
  if (contextualIntent) {
    const intents = [contextualIntent];
    return {
      intent: contextualIntent,
      intents,
      score: 1,
      matched: [normalized],
      frames: [],
      negated: false,
      negatedIntents: [],
      normalized,
      decision: decideIntent(contextualIntent, intents),
    };
  }

  const negatedIntents: ConversationIntent[] = [];
  const candidates: IntentCandidate[] = RULES.map((rule, priority) => {
    const negated = isNegated(normalized, rule.name);
    if (negated) negatedIntents.push(rule.intent);
    const matched = negated ? [] : matches(normalized, intentSynonyms[rule.name]);
    return {
      intent: rule.intent,
      matched,
      score: matched.length,
      priority,
      tier: TIER_SYNONYM,
    };
  }).filter(({ score }) => score > 0);

  // Una frase más larga de otra regla absorbe a la más corta que contiene
  // ("que servicios tienen disponibles" no es una consulta de disponibilidad).
  const longestMatches = candidates.flatMap(({ matched }) => matched);
  for (const candidate of candidates) {
    candidate.matched = candidate.matched.filter(
      (phrase) =>
        !longestMatches.some(
          (other) => other.length > phrase.length && other.includes(phrase),
        ),
    );
    candidate.score = candidate.matched.length;
  }
  const activeCandidates = candidates.filter(({ score }) => score > 0);

  // El catálogo es la fuente de verdad sobre qué servicios existen: sus
  // marcos solo se activan con una ranura que sea un servicio configurado.
  const hasCatalog = options.services !== undefined;
  const catalogDetection = hasCatalog
    ? detectCatalogFrames(message, options.services ?? [])
    : { frames: [], negatedIntents: [] };
  const genericDetection = detectGenericFrames(message);

  for (const intent of [
    ...catalogDetection.negatedIntents,
    ...genericDetection.negatedIntents,
  ]) {
    if (!negatedIntents.includes(intent)) negatedIntents.push(intent);
  }

  // Los marcos genéricos son un respaldo de menor nivel: se reportan como
  // intención secundaria, pero nunca desplazan a una regla de sinónimos ni a
  // un marco respaldado por el catálogo.
  const frameCandidates: IntentCandidate[] = [
    ...catalogDetection.frames.map((frame) => ({
      intent: frame.intent,
      matched: [frame.phrase],
      score: 1,
      priority: RULES.findIndex((rule) => rule.intent === frame.intent),
      tier: TIER_CATALOG_FRAME,
    })),
    ...genericDetection.frames.map((frame) => ({
      intent: frame.intent,
      matched: [frame.phrase],
      score: 1,
      priority: RULES.findIndex((rule) => rule.intent === frame.intent),
      tier: TIER_GENERIC_FRAME,
    })),
  ];

  // Un marco no duplica una intención ya detectada por sinónimos o por otro
  // marco: solo la refuerza.
  const seenIntents = new Set(activeCandidates.map(({ intent }) => intent));
  const uniqueFrameCandidates = frameCandidates.filter((frame) => {
    if (seenIntents.has(frame.intent)) return false;
    seenIntents.add(frame.intent);
    return true;
  });

  const ranked = [...activeCandidates, ...uniqueFrameCandidates].sort(
    (left, right) =>
      left.tier - right.tier ||
      right.score - left.score ||
      left.priority - right.priority,
  );

  const intent = ranked[0]?.intent ?? 'unknown';
  const intents = ranked.map(({ intent }) => intent);

  return {
    intent,
    intents,
    score: ranked[0]?.score ?? 0,
    matched: ranked[0]?.matched ?? [],
    frames: [...catalogDetection.frames, ...genericDetection.frames],
    negated: negatedIntents.length > 0,
    negatedIntents,
    normalized,
    decision: decideIntent(intent, intents),
  };
}

export function detectIntent(
  message: string,
  options: IntentDetectionOptions = {},
): ConversationIntent {
  return detectIntentDetailed(message, options).intent;
}
