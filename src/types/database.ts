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
