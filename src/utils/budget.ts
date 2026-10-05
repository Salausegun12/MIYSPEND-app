import type { BudgetStatus, BudgetWithCategory } from "../types/database";
import { formatKoboAmount } from "./money";

/**
 * Percentage of a budget at which the "near limit" warning begins.
 * 80% is the conventional budgeting threshold.
 */
export const BUDGET_NEAR_LIMIT_PERCENT = 80;

export interface BudgetProgress {
  budget: BudgetWithCategory;
  limit: number; // integer kobo
  spent: number; // integer kobo
  remaining: number; // integer kobo, negative when over budget
  percent: number; // whole percent, may exceed 100 when over budget
  status: BudgetStatus;
}

/**
 * Percentage of a budget that has been spent, rounded to a whole percent.
 * A limit of 0 cannot be divided into, so it reports 0 rather than NaN; the
 * form layer rejects zero limits before a budget is ever saved.
 * 72000 of 80000 → 90
 */
export function getBudgetPercent(limitKobo: number, spentKobo: number): number {
  if (limitKobo <= 0) return 0;
  return Math.round((spentKobo / limitKobo) * 100);
}

/**
 * Classify a budget into a warning state.
 *
 * "reached" and "over" are decided by comparing kobo amounts rather than the
 * rounded percentage. At 80001 of 80000 the percentage is 100.000125, which
 * rounds to 100 and would otherwise be reported as merely "reached" when the
 * user is in fact over the limit.
 *
 * normal  → under 80% used
 * near    → 80% or more, still under the limit
 * reached → spending is exactly the limit
 * over    → spending is more than the limit
 */
export function getBudgetStatus(
  limitKobo: number,
  spentKobo: number
): BudgetStatus {
  // A zero limit cannot be reached, it can only be blown through. Without this
  // guard a 0-of-0 budget falls into the "exactly the limit" branch and claims
  // to be reached when nothing has been spent at all.
  if (limitKobo <= 0) return spentKobo > 0 ? "over" : "normal";
  if (spentKobo > limitKobo) return "over";
  if (spentKobo === limitKobo) return "reached";
  if (getBudgetPercent(limitKobo, spentKobo) >= BUDGET_NEAR_LIMIT_PERCENT) {
    return "near";
  }
  return "normal";
}

/**
 * Turn a stored budget plus the amount already spent on it this month into
 * everything the UI needs to render it. Pure and local: no I/O, no clock, so
 * the same input always produces the same output.
 */
export function calculateBudgetProgress(
  budget: BudgetWithCategory
): BudgetProgress {
  const limit = budget.limit_amount;
  const spent = budget.spent ?? 0;

  return {
    budget,
    limit,
    spent,
    remaining: limit - spent,
    percent: getBudgetPercent(limit, spent),
    status: getBudgetStatus(limit, spent),
  };
}

/**
 * A short label describing how a budget is tracking, used next to the amount.
 */
export function getBudgetStatusLabel(status: BudgetStatus): string {
  switch (status) {
    case "over":
      return "Over budget";
    case "reached":
      return "Limit reached";
    case "near":
      return "Near limit";
    default:
      return "On track";
  }
}

/**
 * How far the progress bar should be filled, as a 0-1 fraction. Spending past
 * the limit fills the bar completely but the percentage text keeps rising, so
 * an over-budget category still shows how far past the limit it is.
 */
export function getBudgetProgressFraction(percent: number): number {
  if (percent <= 0) return 0;
  return Math.min(percent, 100) / 100;
}

/**
 * The remaining line for a budget. When spending has passed the limit the
 * remaining amount is negative, which reads as "Over by ..." instead of a
 * minus sign in front of a currency amount.
 */
export function getBudgetRemainingText(progress: BudgetProgress): string {
  if (progress.remaining < 0) {
    return `Over by ${formatKoboAmount(Math.abs(progress.remaining))}`;
  }
  return `${formatKoboAmount(progress.remaining)} left`;
}
