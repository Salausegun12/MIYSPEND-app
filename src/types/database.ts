export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface Expense {
  id: number;
  amount: number; // stored as integer kobo
  category_id: number;
  description: string;
  payment_method: string;
  note: string;
  date: string;
  created_at: string;
  updated_at: string;
}

export interface ExpenseWithCategory extends Expense {
  category_name: string;
  category_icon: string;
  category_color: string;
}

export interface Setting {
  key: string;
  value: string;
}

export interface Budget {
  id: number;
  category_id: number;
  limit_amount: number; // stored as integer kobo
  created_at: string;
  updated_at: string;
}

export interface BudgetWithCategory extends Budget {
  category_name: string;
  category_icon: string;
  category_color: string;
  spent: number; // integer kobo spent so far in the budget's month
}

export interface Income {
  id: number;
  amount: number; // stored as integer kobo
  source: string;
  payment_method: string;
  note: string;
  income_date: string;
  income_time: string;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod =
  | "Cash"
  | "Bank Transfer"
  | "POS"
  | "Debit/Credit Card"
  | "USSD"
  | "Other";

export const PAYMENT_METHODS: PaymentMethod[] = [
  "Cash",
  "Bank Transfer",
  "POS",
  "Debit/Credit Card",
  "USSD",
  "Other",
];

export type IncomeSource =
  | "Salary"
  | "Freelance"
  | "Business"
  | "Allowance"
  | "Commission"
  | "Gift"
  | "Refund"
  | "Other";

export const INCOME_SOURCES: IncomeSource[] = [
  "Salary",
  "Freelance",
  "Business",
  "Allowance",
  "Commission",
  "Gift",
  "Refund",
  "Other",
];

export type BudgetStatus = "normal" | "near" | "reached" | "over";

/**
 * All amounts are integer kobo (NG minor units). Never floats.
 */
export interface SavingsGoal {
  id: number;
  name: string;
  target_amount: number;
  /**
   * Denormalised cache of the goal balance, kept equal to the sum of the
   * goal's contributions. The contributions ledger is the source of truth;
   * read it via SavingsGoalWithBalance.balance.
   */
  current_amount: number;
  /** ISO YYYY-MM-DD, or null when the goal has no deadline. */
  target_date: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface Contribution {
  id: number;
  goal_id: number;
  amount: number;
  /** ISO YYYY-MM-DD, defaults to today. */
  date: string;
  note: string;
  created_at: string;
}

/** A goal joined with its balance derived from the contributions ledger. */
export interface SavingsGoalWithBalance extends SavingsGoal {
  balance: number;
  remaining: number;
  percent_complete: number;
  is_reached: boolean;
  contribution_count: number;
}

export interface CreateSavingsGoalInput {
  name: string;
  target_amount: number;
  /**
   * Optional opening balance for money saved before this goal was tracked.
   * Stored as the goal balance and recorded as a matching opening
   * contribution so the ledger stays complete.
   */
  current_amount?: number;
  target_date?: string | null;
  note?: string;
}

export interface UpdateSavingsGoalInput {
  name?: string;
  target_amount?: number;
  target_date?: string | null;
  note?: string;
}

export interface CreateContributionInput {
  goal_id: number;
  amount: number;
  date?: string;
  note?: string;
}

export interface GoalBalanceReconciliation {
  goal_id: number;
  cached: number;
  derived: number;
  corrected: boolean;
}

export type RecurringType = "income" | "expense";

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";

export const RECURRING_FREQUENCIES: RecurringFrequency[] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

/**
 * A user-configured income or expense that repeats on a schedule. Occurrences
 * are generated locally (never from a bank/network) on app launch and screen
 * focus. Each generated transaction is recorded exactly once in the
 * `recurring_occurrences` ledger, so restarting or processing twice can never
 * duplicate a transaction.
 */
export interface RecurringTransaction {
  id: number;
  type: RecurringType;
  amount: number; // integer kobo
  description: string;
  /** Only used for expense recurring records. Null for income. */
  category_id: number | null;
  payment_method: string;
  frequency: RecurringFrequency;
  /** ISO YYYY-MM-DD of the next scheduled (first pending) occurrence. */
  next_occurrence: string;
  /**
   * Calendar day used to keep monthly/yearly dates stable across short months.
   * e.g. 31 keeps a 31st-of-month schedule on the last day of short months.
   */
  anchor_day: number;
  /** ISO YYYY-MM-DD, or null when the schedule runs forever. */
  end_date: string | null;
  is_active: number; // 0 = paused, 1 = active
  created_at: string;
  updated_at: string;
}

export interface RecurringTransactionWithCategory
  extends RecurringTransaction {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
}

export interface CreateRecurringInput {
  type: RecurringType;
  amount: number;
  description: string;
  category_id?: number | null;
  payment_method?: string;
  frequency: RecurringFrequency;
  next_occurrence: string;
  end_date?: string | null;
}

export interface UpdateRecurringInput {
  type?: RecurringType;
  amount?: number;
  description?: string;
  category_id?: number | null;
  payment_method?: string;
  frequency?: RecurringFrequency;
  next_occurrence?: string;
  end_date?: string | null;
  is_active?: number;
}

export interface RecurringProcessSummary {
  occurrencesProcessed: number;
  incomeGenerated: number;
  expensesGenerated: number;
  recordsProcessed: number;
  recordsDeactivated: number;
}

/**
 * Visual tone used to colour an insight's icon and message.
 */
export type InsightTone = "positive" | "neutral" | "warning";

/**
 * A single offline financial insight: a short, deterministic, user-facing
 * observation computed only from recorded transactions (never the bank).
 * `icon` is an Ionicons name passed through to the UI as-is.
 */
export interface Insight {
  id: string;
  tone: InsightTone;
  icon: string;
  message: string;
}

export type TransactionType = "income" | "expense";

/**
 * Filters for the transaction search. All fields are optional and combined
 * with AND. Amounts are in kobo (NG minor units), dates are YYYY-MM-DD and
 * `query` is a case-insensitive substring match against description, income
 * source, category name and payment method.
 */
export interface TransactionSearchFilters {
  query?: string;
  /** Restricts which record types are searched. Defaults to both. */
  types?: TransactionType[];
  /** Only applies to expense records. */
  categoryId?: number;
  /** Exact payment method match. */
  paymentMethod?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
}

/**
 * A single matched row from either table, normalised so the UI renders income
 * and expenses identically. `date` keeps the full stored value; the UI shows
 * the YYYY-MM-DD part.
 */
export interface TransactionSearchResult {
  type: TransactionType;
  id: number;
  amount: number;
  /** Expense description, or the income source (income has no description). */
  description: string;
  payment_method: string;
  date: string;
  category_id: number | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  /** Income source; empty string for expenses. */
  source: string;
}

/**
 * A single transaction in a local financial export, normalised so income and
 * expenses share one shape. Amounts are integer kobo; `date` keeps the full
 * stored value ("YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"; income always includes
 * the time). All other strings are empty when not applicable.
 */
export interface ExportedTransaction {
  type: TransactionType;
  id: number;
  amount: number;
  date: string;
  /** Expense description. Empty for income. */
  description: string;
  /** Income source. Empty for expenses. */
  source: string;
  categoryId: number | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  paymentMethod: string;
  note: string;
}

/** One row of the "spending by category" breakdown in an export summary. */
export interface ExportCategoryTotal {
  categoryId: number;
  name: string;
  icon: string;
  color: string;
  total: number;
  count: number;
}

/** One row of the "income by source" breakdown in an export summary. */
export interface ExportSourceTotal {
  source: string;
  total: number;
  count: number;
}

/**
 * Financial summary derived only from locally recorded transactions.
 * Amounts are integer kobo. Breakdown lists are sorted by total descending.
 */
export interface ExportSummary {
  income: number;
  expenses: number;
  net: number;
  transactionCount: number;
  categories: ExportCategoryTotal[];
  sources: ExportSourceTotal[];
}

/**
 * A fully built export: the raw normalised rows plus their summary, a CSV
 * (transactions + summary sections) and the PDF report HTML. Everything is
 * generated on-device; nothing is uploaded anywhere.
 */
export interface ExportReport {
  transactions: ExportedTransaction[];
  summary: ExportSummary;
  csv: string;
  pdfHtml: string;
  generatedAt: Date;
}

/* -------------------------------------------------------------------------- */
/*                                Local backup                                */
/* -------------------------------------------------------------------------- */

export interface BackupCategory {
  id: number;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface BackupExpense {
  id: number;
  amount: number;
  category_id: number;
  description: string;
  payment_method: string;
  note: string;
  date: string;
  created_at: string;
  updated_at: string;
}

export interface BackupIncome {
  id: number;
  amount: number;
  source: string;
  payment_method: string;
  note: string;
  income_date: string;
  income_time: string;
  created_at: string;
  updated_at: string;
}

export interface BackupSetting {
  key: string;
  value: string;
}

export interface BackupBudget {
  id: number;
  category_id: number;
  limit_amount: number;
  created_at: string;
  updated_at: string;
}

export interface BackupSavingsGoal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface BackupContribution {
  id: number;
  goal_id: number;
  amount: number;
  date: string;
  note: string;
  created_at: string;
}

export interface BackupRecurringTransaction {
  id: number;
  type: RecurringType;
  amount: number;
  description: string;
  category_id: number | null;
  payment_method: string;
  frequency: RecurringFrequency;
  next_occurrence: string;
  anchor_day: number;
  end_date: string | null;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface BackupRecurringOccurrence {
  id: number;
  recurring_id: number;
  occurrence_date: string;
  created_at: string;
}

/**
 * The versioned, offline backup format. Every record is stored verbatim with
 * its original id so a restore can reproduce the exact database and keep
 * foreign keys valid. All amounts are integer kobo.
 */
export interface MiySpendBackup {
  app: "miyspend";
  format: "miyspend-backup";
  version: 1;
  exportedAt: string;
  collections: {
    categories: BackupCategory[];
    expenses: BackupExpense[];
    income: BackupIncome[];
    settings: BackupSetting[];
    budgets: BackupBudget[];
    savingsGoals: BackupSavingsGoal[];
    contributions: BackupContribution[];
    recurringTransactions: BackupRecurringTransaction[];
    recurringOccurrences: BackupRecurringOccurrence[];
  };
}

/** Counts per collection, used to summarise a backup in the UI. */
export interface BackupCollectionCounts {
  categories: number;
  expenses: number;
  income: number;
  settings: number;
  budgets: number;
  savingsGoals: number;
  contributions: number;
  recurringTransactions: number;
  recurringOccurrences: number;
}

/** Outcome of parsing + validating a prospective backup file. */
export type BackupValidationResult =
  | { ok: true; payload: MiySpendBackup }
  | { ok: false; error: string };
