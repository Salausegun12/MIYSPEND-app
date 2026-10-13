import type { SQLiteDatabase } from "expo-sqlite";
import type { Category, SavingsGoal } from "../../types/database";
import {
  addBudget,
  getBudgetByCategory,
  updateBudgetLimit,
} from "../../database/budget";
import {
  createGoal,
  getAllGoals,
  updateGoal,
} from "../../database/savingsGoals";
import { formatKoboAmount, nairaToKobo } from "../../utils/money";
import {
  extractAmount,
  matchCategory,
  normalizeTranscript,
} from "./parser";
import type { VoiceDuplicateGuard } from "./duplicateGuard";
import type {
  BudgetDraft,
  GoalDraft,
  PlanningQuestion,
  PlanningSaveResult,
  VoiceSummaryRow,
} from "./types";

/* ----------------------------------------------------------------- helpers */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word match that also tolerates a trailing plural "s". */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return new RegExp(`\\b${escapeRegExp(needle)}(?:s)?\\b`, "i").test(haystack);
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Best-effort match of an existing goal by name. Longest names are checked
 * first so "Car maintenance" wins over a goal simply called "Car".
 */
export function matchGoal(text: string, goals: SavingsGoal[]): SavingsGoal | null {
  const ordered = [...goals].sort((a, b) => b.name.length - a.name.length);
  for (const goal of ordered) {
    if (containsWord(text, goal.name.toLowerCase())) return goal;
  }
  return null;
}

/* ---------------------------------------------------------- budget parsing */

export interface BudgetParseContext {
  categories: Category[];
}

/** Interprets a budget command into a draft with the limit and category set. */
export function parseBudgetCommand(
  transcript: string,
  context: BudgetParseContext
): BudgetDraft {
  const text = normalizeTranscript(transcript);
  const amount = extractAmount(text);
  const category = matchCategory(text, context.categories);

  return {
    intent: "budget",
    amountKobo: amount.kobo,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    raw: transcript,
  };
}

/** True once a budget draft has everything the budget table needs. */
export function isBudgetDraftReady(draft: BudgetDraft): boolean {
  return (
    draft.categoryId !== null &&
    draft.amountKobo !== null &&
    draft.amountKobo > 0
  );
}

/** The next question needed to complete a budget draft, or null when ready. */
export function buildBudgetQuestion(
  draft: BudgetDraft,
  categories: Category[]
): PlanningQuestion | null {
  if (draft.amountKobo === null || draft.amountKobo <= 0) {
    return {
      field: "amount",
      prompt: "How much should the monthly budget be?",
      kind: "amount",
    };
  }

  if (draft.categoryId === null) {
    return {
      field: "category",
      prompt: "Which category is this budget for?",
      kind: "choice",
      options: categories.map((category) => ({
        label: category.name,
        value: String(category.id),
        detail: category.icon,
      })),
    };
  }

  return null;
}

/** Applies the user's answer to a budget question, returning a new draft. */
export function applyBudgetAnswer(
  draft: BudgetDraft,
  field: string,
  value: string,
  categories: Category[]
): BudgetDraft {
  if (field === "amount") {
    const parsed = Number(value.replace(/[₦,\s]/g, ""));
    const kobo = Number.isFinite(parsed) && parsed > 0 ? nairaToKobo(parsed) : null;
    return { ...draft, amountKobo: kobo };
  }

  if (field === "category") {
    const category = categories.find((item) => String(item.id) === value) ?? null;
    return {
      ...draft,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
    };
  }

  return draft;
}

/* ------------------------------------------------------------ goal parsing */

export interface GoalParseContext {
  goals: SavingsGoal[];
}

const GOAL_UPDATE_PATTERNS: RegExp[] = [
  /\bchange\b/,
  /\bupdate\b/,
  /\bincrease\b/,
  /\bdecrease\b/,
  /\breduce\b/,
  /\badjust\b/,
  /\braise\b/,
  /\blower\b/,
  /\btop up\b/,
];

const GOAL_NAME_FILLERS =
  /\b(savings?|saving|goals?|target|monthly|budget|amount|of|to|for|a|an|the|my|our|named|called|new|create|set|add|change|update|make|please|naira)\b/gi;

/** Cleans a raw goal-name phrase by dropping amounts and command filler words. */
function cleanGoalName(value: string | undefined): string | null {
  if (!value) return null;
  const withoutAmount = value.replace(
    /(?:₦\s*)?\d[\d,]*(?:\.\d+)?\s*(?:k|thousand|million|m|billion|bn|hundred)?/gi,
    " "
  );
  const withoutFillers = withoutAmount.replace(GOAL_NAME_FILLERS, " ");
  const cleaned = withoutFillers
    .replace(/[^a-z0-9\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? titleCase(cleaned) : null;
}

function extractGoalName(
  text: string,
  goals: SavingsGoal[]
): string | null {
  const matched = matchGoal(text, goals);
  if (matched) return matched.name;

  const candidates: Array<string | undefined> = [
    text.match(/\b(?:called|named)\s+(.+)$/)?.[1],
    text.match(/\bsavings?\s+(?:for|towards?|on)\s+(?:a\s+|an\s+|the\s+)?(.+)$/)?.[1],
    text.match(/\bfor\s+(?:a\s+|an\s+|the\s+)?(.+)$/)?.[1],
    text.match(/\bmy\s+(.+?)\s+(?:savings?|goal|target)\b/)?.[1],
    text.match(/\b(?:a\s+|an\s+|the\s+)?(.+?)\s+(?:savings?\s+)?goal\b/)?.[1],
    text.match(/\b(?:goal|target)\s+(?:of|for)\s+(.+)$/)?.[1],
  ];

  for (const candidate of candidates) {
    const name = cleanGoalName(candidate);
    if (name) return name;
  }

  return null;
}

/** Interprets a savings-goal command into a draft. */
export function parseGoalCommand(
  transcript: string,
  context: GoalParseContext
): GoalDraft {
  const text = normalizeTranscript(transcript);
  const amount = extractAmount(text);
  const matched = matchGoal(text, context.goals);
  const wantsUpdate = GOAL_UPDATE_PATTERNS.some((pattern) => pattern.test(text));
  const name = matched?.name ?? extractGoalName(text, context.goals);

  return {
    intent: "goal",
    mode: matched || wantsUpdate ? "update" : "create",
    goalId: matched?.id ?? null,
    goalName: name,
    targetAmountKobo: amount.kobo,
    raw: transcript,
  };
}

/** True once a goal draft has everything the savings_goals table needs. */
export function isGoalDraftReady(draft: GoalDraft): boolean {
  return (
    draft.goalName !== null &&
    draft.goalName.trim().length > 0 &&
    draft.targetAmountKobo !== null &&
    draft.targetAmountKobo > 0
  );
}

/** The next question needed to complete a goal draft, or null when ready. */
export function buildGoalQuestion(
  draft: GoalDraft,
  goals: SavingsGoal[]
): PlanningQuestion | null {
  if (draft.goalId === null && !draft.goalName) {
    if (draft.mode === "update" && goals.length > 0) {
      return {
        field: "goal",
        prompt: "Which goal do you want to change?",
        kind: "choice",
        options: goals.map((goal) => ({
          label: goal.name,
          value: String(goal.id),
        })),
      };
    }
    return {
      field: "goalName",
      prompt:
        draft.mode === "update"
          ? "Which goal do you want to change?"
          : "What should I call this goal?",
      kind: "text",
    };
  }

  if (draft.targetAmountKobo === null || draft.targetAmountKobo <= 0) {
    return {
      field: "amount",
      prompt: "What is the target amount?",
      kind: "amount",
    };
  }

  return null;
}

/** Applies the user's answer to a goal question, returning a new draft. */
export function applyGoalAnswer(
  draft: GoalDraft,
  field: string,
  value: string,
  goals: SavingsGoal[]
): GoalDraft {
  if (field === "amount") {
    const parsed = Number(value.replace(/[₦,\s]/g, ""));
    const kobo = Number.isFinite(parsed) && parsed > 0 ? nairaToKobo(parsed) : null;
    return { ...draft, targetAmountKobo: kobo };
  }

  if (field === "goal") {
    const goal = goals.find((item) => String(item.id) === value) ?? null;
    return {
      ...draft,
      mode: "update",
      goalId: goal?.id ?? null,
      goalName: goal?.name ?? draft.goalName,
    };
  }

  if (field === "goalName") {
    const name = value.trim();
    const matched = matchGoal(normalizeTranscript(name), goals);
    return {
      ...draft,
      goalName: name,
      goalId: matched?.id ?? draft.goalId,
    };
  }

  return draft;
}

/* ---------------------------------------------------------------- summaries */

/**
 * Human-readable rows shown before the user confirms a budget change. When
 * `existing` is true the category already has a limit, so the summary says the
 * limit will be replaced rather than created.
 */
export function summarizeBudgetDraft(
  draft: BudgetDraft,
  existing = false
): VoiceSummaryRow[] {
  return [
    { label: "Type", value: "Monthly budget" },
    { label: "Category", value: draft.categoryName ?? "Not set" },
    {
      label: "Monthly limit",
      value:
        draft.amountKobo !== null && draft.amountKobo > 0
          ? formatKoboAmount(draft.amountKobo)
          : "Not set",
    },
    { label: "Action", value: existing ? "Update existing budget" : "New budget" },
  ];
}

/** Human-readable rows shown before the user confirms a savings-goal change. */
export function summarizeGoalDraft(draft: GoalDraft): VoiceSummaryRow[] {
  return [
    {
      label: "Type",
      value: draft.mode === "update" ? "Update savings goal" : "New savings goal",
    },
    { label: "Goal", value: draft.goalName ?? "Not set" },
    {
      label: "Target amount",
      value:
        draft.targetAmountKobo !== null && draft.targetAmountKobo > 0
          ? formatKoboAmount(draft.targetAmountKobo)
          : "Not set",
    },
  ];
}

/* -------------------------------------------------------------- fingerprints */

/** Stable identity of a budget change, used to block accidental double saves. */
export function budgetDraftFingerprint(draft: BudgetDraft): string {
  return ["budget", draft.categoryId ?? "?", draft.amountKobo ?? 0].join("|");
}

/** Stable identity of a goal change, used to block accidental double saves. */
export function goalDraftFingerprint(draft: GoalDraft): string {
  return [
    "goal",
    draft.mode,
    draft.goalId ?? "?",
    draft.goalName?.trim().toLowerCase() ?? "?",
    draft.targetAmountKobo ?? 0,
  ].join("|");
}

/* ------------------------------------------------------------------- saving */

async function findGoalByName(
  db: SQLiteDatabase,
  name: string
): Promise<SavingsGoal | null> {
  const target = name.trim().toLowerCase();
  const goals = await getAllGoals(db);
  return goals.find((goal) => goal.name.trim().toLowerCase() === target) ?? null;
}

/**
 * Creates a monthly budget for the draft's category, or replaces the limit when
 * one already exists. Reuses the same budget services and validation as the
 * manual budget screen, and records the fingerprint so a double tap cannot
 * apply the change twice.
 */
export async function confirmAndSaveBudgetDraft(
  db: SQLiteDatabase,
  draft: BudgetDraft,
  guard: VoiceDuplicateGuard
): Promise<PlanningSaveResult> {
  if (!isBudgetDraftReady(draft) || draft.amountKobo === null || draft.categoryId === null) {
    return {
      status: "incomplete",
      message: "Some details are still missing. Please answer the questions.",
    };
  }

  const fingerprint = budgetDraftFingerprint(draft);
  if (guard.isDuplicate(fingerprint)) {
    return {
      status: "duplicate",
      message: "This budget change was already saved a moment ago.",
    };
  }

  const existing = await getBudgetByCategory(db, draft.categoryId);
  if (existing) {
    await updateBudgetLimit(db, existing.id, draft.amountKobo);
    guard.record(fingerprint);
    return {
      status: "saved",
      updated: true,
      id: existing.id,
      message: `${draft.categoryName ?? "That category"} monthly budget updated`,
    };
  }

  const id = await addBudget(db, {
    category_id: draft.categoryId,
    limit_amount: draft.amountKobo,
  });
  guard.record(fingerprint);
  return {
    status: "saved",
    updated: false,
    id,
    message: `${draft.categoryName ?? "Budget"} budget created`,
  };
}

/**
 * Creates a savings goal, or updates the target of an existing one. Update
 * commands that name a goal the user does not have fail with a clear message
 * instead of creating a stray goal, and creating a goal whose name is already
 * taken is refused so the ledger is never duplicated.
 */
export async function confirmAndSaveGoalDraft(
  db: SQLiteDatabase,
  draft: GoalDraft,
  guard: VoiceDuplicateGuard
): Promise<PlanningSaveResult> {
  if (
    !isGoalDraftReady(draft) ||
    draft.targetAmountKobo === null ||
    !draft.goalName
  ) {
    return {
      status: "incomplete",
      message: "Some details are still missing. Please answer the questions.",
    };
  }

  const fingerprint = goalDraftFingerprint(draft);
  if (guard.isDuplicate(fingerprint)) {
    return {
      status: "duplicate",
      message: "This goal change was already saved a moment ago.",
    };
  }

  if (draft.mode === "update" || draft.goalId !== null) {
    let goalId = draft.goalId;
    if (goalId === null) {
      const match = await findGoalByName(db, draft.goalName);
      if (!match) {
        return {
          status: "unknown_goal",
          message: `I couldn't find a savings goal called "${draft.goalName}".`,
        };
      }
      goalId = match.id;
    }

    const updated = await updateGoal(db, goalId, {
      target_amount: draft.targetAmountKobo,
    });
    if (!updated) {
      return {
        status: "unknown_goal",
        message: "I couldn't find that savings goal.",
      };
    }
    guard.record(fingerprint);
    return {
      status: "saved",
      updated: true,
      id: updated.id,
      message: `${updated.name} target updated`,
    };
  }

  const existing = await findGoalByName(db, draft.goalName);
  if (existing) {
    return {
      status: "duplicate_goal",
      message: `A savings goal called "${existing.name}" already exists. Say "change my ${existing.name} savings target" to update it.`,
    };
  }

  const goal = await createGoal(db, {
    name: draft.goalName,
    target_amount: draft.targetAmountKobo,
  });
  guard.record(fingerprint);
  return {
    status: "saved",
    updated: false,
    id: goal.id,
    message: `Savings goal "${goal.name}" created`,
  };
}
