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
