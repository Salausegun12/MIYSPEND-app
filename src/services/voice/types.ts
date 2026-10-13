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
