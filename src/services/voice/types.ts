import type {
  IncomeSource,
  PaymentMethod,
  TransactionType,
} from "../../types/database";

/**
 * A partially- or fully-interpreted voice command. Fields are nullable while
 * the command is still being clarified through follow-up questions; by the
 * time the user confirms, every field required by the target table is set.
 */
export interface VoiceDraft {
  /** "expense" or "income"; null when the command did not say which. */
  type: TransactionType | null;
  /** Integer kobo, or null when no usable amount was found. */
  amountKobo: number | null;
  /** Free-text description (expense) or source phrase (income). */
  description: string;
  /** Resolved expense category, once matched or chosen. */
  categoryId: number | null;
  categoryName: string | null;
  /** Resolved income source, once matched or chosen. */
  source: IncomeSource | null;
  /** Detected or defaulted payment method. */
  paymentMethod: PaymentMethod | null;
  /** ISO YYYY-MM-DD. */
  date: string;
  /** HH:mm, 24-hour. */
  time: string;
  /** The original transcript, kept for the summary and duplicate checks. */
  raw: string;
}

export type VoiceQuestionField = "type" | "amount" | "category" | "source";

export interface VoiceQuestionOption {
  label: string;
  value: string;
  detail?: string;
}

/**
 * A short follow-up the app asks when required information is missing or
 * ambiguous. `kind` tells the UI whether to render choice chips or a numeric
 * field (amount).
 */
export interface VoiceQuestion {
  field: VoiceQuestionField;
  prompt: string;
  kind: "choice" | "amount";
  options?: VoiceQuestionOption[];
}

/** Summary row rendered before the user confirms (label + display value). */
export interface VoiceSummaryRow {
  label: string;
  value: string;
}

export type VoiceRecognitionErrorKind =
  | "unavailable"
  | "no_speech"
  | "permission_denied"
  | "unknown";

export interface VoiceRecognitionError {
  kind: VoiceRecognitionErrorKind;
  message: string;
}

export type VoiceRecognizerEvent =
  | { type: "listening" }
  | { type: "transcript"; text: string; isFinal: boolean }
  | { type: "error"; error: VoiceRecognitionError }
  | { type: "end" };

/**
 * The speech-to-text contract the app depends on. A recognizer may be backed
 * by an on-device engine, but it must never send audio off the device. Only
 * the resulting transcript ever reaches the parser.
 */
export interface VoiceRecognizer {
  readonly id: string;
  readonly label: string;
  /** True when recognition runs entirely on the device. */
  readonly offline: boolean;
  isAvailable(): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
  subscribe(listener: (event: VoiceRecognizerEvent) => void): () => void;
}

/* ------------------------------------------------- planning (budget/goals) */

/**
 * Which family of command a transcript belongs to. The transaction flow
 * records expenses and income; budget and goal commands change a monthly
 * category limit or a savings goal instead.
 */
export type VoiceIntent = "transaction" | "budget" | "goal";

/**
 * A partially- or fully-interpreted request to create or update a monthly
 * category budget. `categoryId` and `amountKobo` are null until clarified.
 */
export interface BudgetDraft {
  intent: "budget";
  /** Integer kobo, or null when no usable limit was found. */
  amountKobo: number | null;
  categoryId: number | null;
  categoryName: string | null;
  /** The original transcript, kept for the summary and duplicate checks. */
  raw: string;
}

/**
 * A partially- or fully-interpreted savings-goal request. `mode` is "update"
 * when the command asked to change an existing goal (or named one that already
 * exists), and "create" otherwise.
 */
export interface GoalDraft {
  intent: "goal";
  mode: "create" | "update";
  /** Resolved goal id when the command named an existing goal. */
  goalId: number | null;
  goalName: string | null;
  /** Integer kobo, or null when no usable target was found. */
  targetAmountKobo: number | null;
  /** The original transcript, kept for the summary and duplicate checks. */
  raw: string;
}

export type PlanningQuestionField =
  | "amount"
  | "category"
  | "goal"
  | "goalName";

/**
 * A follow-up for a budget or goal command. `kind` tells the UI whether to
 * render choice chips, a numeric field ("amount"), or a free-text field
 * ("text", used for the goal name).
 */
export interface PlanningQuestion {
  field: PlanningQuestionField;
  prompt: string;
  kind: "choice" | "amount" | "text";
  options?: VoiceQuestionOption[];
}

/**
 * Result of saving a budget or goal draft. Besides the shared saved/duplicate/
 * incomplete states, goal updates can reference a goal that no longer exists
 * ("unknown_goal") or try to create one whose name is already taken
 * ("duplicate_goal").
 */
export type PlanningSaveStatus =
  | "saved"
  | "duplicate"
  | "incomplete"
  | "unknown_goal"
  | "duplicate_goal";

export interface PlanningSaveResult {
  status: PlanningSaveStatus;
  message: string;
  /** Row id of the affected record when status is "saved". */
  id?: number;
  /** True when an existing record was updated rather than created. */
  updated?: boolean;
}
