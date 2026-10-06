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
