import type { ConversationIntent } from '../types.js';

export type IntentDecisionAction = 'accept' | 'clarify' | 'offer-options';

export interface IntentPolicyDecision {
  action: IntentDecisionAction;
  // The intent consumers may safely route without asking the user.
  effectiveIntent: ConversationIntent;
  // Conflicting actionable intents, in detector priority order.
  candidates: ConversationIntent[];
}

const MUTUALLY_EXCLUSIVE_ACTIONS: ReadonlySet<ConversationIntent> = new Set([
  'book-appointment',
  'cancel-appointment',
  'reschedule-appointment',
  'confirm-appointment',
  'reject-appointment',
]);

const getConflictingActions = (
  intents: readonly ConversationIntent[],
): ConversationIntent[] => {
  const actions = intents.filter((intent) =>
    MUTUALLY_EXCLUSIVE_ACTIONS.has(intent),
  );
  const containsConflict = actions.some((intent, index) =>
    actions.slice(index + 1).some((other) => other !== intent),
  );

  return containsConflict ? actions : [];
};

/**
 * Routes deterministic rule evidence without presenting its match count as a
 * probability. Compatible secondary requests (for example, booking + price)
 * remain accepted; contradictory reservation actions require clarification.
 */
export const decideIntent = (
  intent: ConversationIntent,
  intents: readonly ConversationIntent[],
): IntentPolicyDecision => {
  if (intent === 'unknown') {
    return {
      action: 'offer-options',
      effectiveIntent: 'unknown',
      candidates: [],
    };
  }

  const candidates = getConflictingActions(intents);
  if (candidates.length > 1) {
    return {
      action: 'clarify',
      effectiveIntent: 'unknown',
      candidates,
    };
  }

  return {
    action: 'accept',
    effectiveIntent: intent,
    candidates: [],
  };
};
