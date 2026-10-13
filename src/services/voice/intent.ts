import { normalizeTranscript } from "./parser";
import type { ReadAloudTopic, VoiceIntent } from "./types";

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
 * Read-only clues: a question or a request to show/read/summarise. These come
 * first so "what's my food budget?" is treated as a question instead of a
 * budget edit, while "change my food budget" (no question word) still edits.
 */
const READ_ONLY_PATTERNS: RegExp[] = [
  /\bhow (much|many)\b/,
  // normalizeTranscript turns apostrophes into spaces, so "what's" arrives as
  // "what s" and a bare "what" is the reliable anchor.
  /\bwhat\b/,
  /\bshow me\b/,
  /\btell me\b/,
  /\bwalk me through\b/,
  /\bsummar(y|ise|ize)\b/,
  /\bread\b/,
];

const SPENDING_TOPIC_PATTERNS: RegExp[] = [
  /\bhow much\b.*\b(spend|spent|spending|expenses?)\b/,
  /\bmy (spending|expenses?)\b/,
  /\bspending summary\b/,
  /\bhow much.*\bspent\b/,
];

/**
 * Classifies a transcript before parsing so a budget or goal command is never
 * mistaken for an expense or income entry. Read-only questions win over edits
 * so a genuine question cannot silently change a record; budget wins over goal
 * because a sentence can mention both ("budget for my savings goal").
 */
export function detectVoiceIntent(transcript: string): VoiceIntent {
  const text = normalizeTranscript(transcript);
  if (READ_ONLY_PATTERNS.some((pattern) => pattern.test(text))) return "insight";
  if (BUDGET_PATTERNS.some((pattern) => pattern.test(text))) return "budget";
  if (GOAL_PATTERNS.some((pattern) => pattern.test(text))) return "goal";
  return "transaction";
}

/**
 * Picks which recorded data a read-only question is asking about. Returns
 * "insights" as the safe default, so an unrecognised question still reads back
 * the deterministic insights rather than guessing.
 */
export function detectReadAloudTopic(transcript: string): ReadAloudTopic {
  const text = normalizeTranscript(transcript);
  if (BUDGET_PATTERNS.some((pattern) => pattern.test(text))) return "budgets";
  if (GOAL_PATTERNS.some((pattern) => pattern.test(text))) return "goals";
  if (SPENDING_TOPIC_PATTERNS.some((pattern) => pattern.test(text))) {
    return "spending";
  }
  return "insights";
}
