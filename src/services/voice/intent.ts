import { normalizeTranscript } from "./parser";
import type { VoiceIntent } from "./types";

/**
 * Words that only ever appear in a budget command. "budget" is the anchor;
 * the phrases catch a couple of common paraphrases.
 */
const BUDGET_PATTERNS: RegExp[] = [
  /\bbudgets?\b/,
  /\bmonthly limit\b/,
  /\bspending limit\b/,
];

/**
 * Words that signal a savings goal. "savings"/"saving" cover the update
 * phrasing ("change my laptop savings target") as well as the create phrasing
 * ("create a savings goal").
 */
const GOAL_PATTERNS: RegExp[] = [
  /\bgoals?\b/,
  /\bsavings?\b/,
  /\bsaving\b/,
  /\bsave up\b/,
  /\bsaving up\b/,
  /\bsaving towards?\b/,
];

/**
 * Classifies a transcript before parsing so a budget or goal command is never
 * mistaken for an expense or income entry. Budget wins over goal because a
 * sentence can mention both ("budget for my savings goal").
 */
export function detectVoiceIntent(transcript: string): VoiceIntent {
  const text = normalizeTranscript(transcript);
  if (BUDGET_PATTERNS.some((pattern) => pattern.test(text))) return "budget";
  if (GOAL_PATTERNS.some((pattern) => pattern.test(text))) return "goal";
  return "transaction";
}
