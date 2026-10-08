import type {
  BudgetStatus,
  BudgetWithCategory,
  SavingsGoalWithBalance,
} from "../types/database";
import { getBudgetPercent, getBudgetStatus } from "./budget";
import { groupNaira } from "./money";
import { formatReportDate } from "./reportPeriods";

/**
 * Pure helpers that turn a report period's numbers into the prose sections of
 * the generated report: remarks on budgets, savings goals and income/expenses,
 * plus recommendations. No I/O and no clock reads (the caller passes the
 * reference date), so the same input always produces the same text.
 */

export interface ReportBudgetRow {
  name: string;
  icon: string;
  color: string;
  limit: number; // integer kobo, monthly limit
  spentInPeriod: number; // integer kobo spent inside the report period
  basis: number; // integer kobo compared with the limit (average per month
  // for periods longer than a month)
  percent: number;
  status: BudgetStatus;
  kept: boolean; // stayed within the monthly limit
}

export interface ReportNarrativeInput {
  totalExpenses: number;
  expenseCount: number;
  totalIncome: number;
  topCategory: { name: string; amount: number } | null;
  budgetRows: ReportBudgetRow[];
  goals: SavingsGoalWithBalance[];
  contributionsTotal: number;
  contributionsCount: number;
  referenceDate: Date;
}

export interface ReportNarrative {
  incomeExpenseRemarks: string[];
  budgetRemarks: string[];
  goalRemarks: string[];
  recommendations: string[];
}

/** "NGN 1,234.56" — the currency format used throughout the report. */
export function formatNaira(kobo: number): string {
  return `NGN ${groupNaira(kobo / 100, 2)}`;
}

/** Whole percent of `part` in `whole`, guarding against a zero whole. */
function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/** Calendar months spanned by a plain YYYY-MM-DD range, at least 1. */
export function countMonthsCovered(
  startDate: string,
  endDate: string
): number {
  const start = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  const end = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDate);
  if (!start || !end) return 1;
  const months =
    (Number(end[1]) - Number(start[1])) * 12 +
    (Number(end[2]) - Number(start[2])) +
    1;
  return Math.max(1, months);
}

/** Whole months from `from` until `toDate`, at least 1 (overdue counts as 1). */
function monthsUntil(from: Date, toDate: string): number {
  const target = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 1;
  const raw =
    (target.getFullYear() - from.getFullYear()) * 12 +
    (target.getMonth() - from.getMonth());
  const withinMonth = target.getDate() >= from.getDate();
  return Math.max(1, raw + (withinMonth && raw === 0 ? 0 : raw > 0 && !withinMonth ? -1 : 0));
}

/**
 * Flattens stored budgets into the rows the report table and the narrative
 * share. For periods longer than a month the amount compared with the limit
 * is the average per month, so a six-month report does not claim every
 * category blew its monthly budget.
 */
export function buildBudgetRows(
  budgets: BudgetWithCategory[],
  monthsCovered: number
): ReportBudgetRow[] {
  const divisor = Math.max(1, monthsCovered);
  return budgets.map((budget) => {
    const spent = budget.spent ?? 0;
    const basis = Math.round(spent / divisor);
    return {
      name: budget.category_name,
      icon: budget.category_icon,
      color: budget.category_color,
      limit: budget.limit_amount,
      spentInPeriod: spent,
      basis,
      percent: getBudgetPercent(budget.limit_amount, basis),
      status: getBudgetStatus(budget.limit_amount, basis),
      kept: getBudgetStatus(budget.limit_amount, basis) !== "over",
    };
  });
}

export function buildReportNarrative(
  input: ReportNarrativeInput
): ReportNarrative {
  const {
    totalExpenses,
    expenseCount,
    totalIncome,
    topCategory,
    budgetRows,
    goals,
    contributionsTotal,
    contributionsCount,
    referenceDate,
  } = input;

  const net = totalIncome - totalExpenses;

  /* ------------------------------ Income & expenses ------------------------------ */
  const incomeExpenseRemarks: string[] = [];
  if (totalIncome === 0 && totalExpenses === 0) {
    incomeExpenseRemarks.push(
      "No income or spending was recorded during this period."
    );
  } else if (totalIncome > 0 && totalExpenses > 0) {
    if (net >= 0) {
      incomeExpenseRemarks.push(
        `Income of ${formatNaira(totalIncome)} exceeded spending of ${formatNaira(
          totalExpenses
        )}, leaving a surplus of ${formatNaira(net)} (${percentOf(
          net,
          totalIncome
        )}% of income).`
      );
    } else {
      incomeExpenseRemarks.push(
        `Spending of ${formatNaira(
          totalExpenses
        )} exceeded income of ${formatNaira(totalIncome)} by ${formatNaira(
          Math.abs(net)
        )}.`
      );
    }
  } else if (totalIncome > 0) {
    incomeExpenseRemarks.push(
      `Income of ${formatNaira(
        totalIncome
      )} was recorded with no spending during this period.`
    );
  } else {
    incomeExpenseRemarks.push(
      `Spending totalled ${formatNaira(
        totalExpenses
      )} during the period with no income recorded.`
    );
  }

  if (topCategory && totalExpenses > 0) {
    incomeExpenseRemarks.push(
      `${topCategory.name} was the largest spending category at ${formatNaira(
        topCategory.amount
      )} (${percentOf(topCategory.amount, totalExpenses)}% of total spending).`
    );
  }

  if (expenseCount > 0) {
    incomeExpenseRemarks.push(
      `${expenseCount} transaction${expenseCount === 1 ? "" : "s"} ${
        expenseCount === 1 ? "was" : "were"
      } recorded during the period.`
    );
  }

  /* --------------------------------- Budgets --------------------------------- */
  const budgetRemarks: string[] = [];
  const overBudgets = budgetRows.filter((row) => row.status === "over");
  const nearBudgets = budgetRows.filter((row) => row.status === "near");
  const untouchedBudgets = budgetRows.filter(
    (row) => row.spentInPeriod === 0
  );

  if (budgetRows.length === 0) {
    budgetRemarks.push(
      "No budgets have been created yet, so there is nothing to assess for this period."
    );
  } else {
    const keptCount = budgetRows.filter((row) => row.kept).length;
    budgetRemarks.push(
      `${keptCount} of ${budgetRows.length} budget${
        budgetRows.length === 1 ? "" : "s"
      } stayed within the monthly limit during this period.`
    );
    for (const row of overBudgets) {
      budgetRemarks.push(
        `${row.name} went over its monthly limit: ${formatNaira(
          row.basis - row.limit
        )} above the ${formatNaira(row.limit)} cap (${row.percent}% used).`
      );
    }
    for (const row of nearBudgets) {
      budgetRemarks.push(
        `${row.name} reached ${row.percent}% of its monthly limit — close to the cap.`
      );
    }
    if (untouchedBudgets.length === budgetRows.length) {
      budgetRemarks.push(
        "No spending was recorded in any of the budgeted categories during this period."
      );
    }
  }

  /* ------------------------------ Savings goals ------------------------------ */
  const goalRemarks: string[] = [];
  const reachedGoals = goals.filter((goal) => goal.is_reached);
  const inProgressGoals = goals
    .filter((goal) => !goal.is_reached)
    .sort((a, b) => b.percent_complete - a.percent_complete);

  if (goals.length === 0) {
    goalRemarks.push("No savings goals have been created yet.");
  } else {
    if (reachedGoals.length > 0) {
      goalRemarks.push(
        `Achievement: ${reachedGoals.length} of ${goals.length} savings goal${
          goals.length === 1 ? "" : "s"
        } reached — ${reachedGoals.map((goal) => goal.name).join(", ")}.`
      );
    } else {
      goalRemarks.push(
        `No savings goals have been reached yet; ${goals.length} goal${
          goals.length === 1 ? " is" : "s are"
        } still in progress.`
      );
    }
    for (const goal of inProgressGoals.slice(0, 2)) {
      goalRemarks.push(
        `${goal.name} is ${goal.percent_complete}% funded — ${formatNaira(
          goal.balance
        )} saved of the ${formatNaira(goal.target_amount)} target.`
      );
    }
    const datedGoal = inProgressGoals.find((goal) => goal.target_date);
    if (datedGoal?.target_date) {
      goalRemarks.push(
        `${datedGoal.name} is due by ${formatReportDate(
          datedGoal.target_date
        )} and still needs ${formatNaira(datedGoal.remaining)}.`
      );
    }
    if (contributionsCount > 0) {
      goalRemarks.push(
        `You saved ${formatNaira(
          contributionsTotal
        )} across ${contributionsCount} contribution${
          contributionsCount === 1 ? "" : "s"
        } during this period.`
      );
    } else {
      goalRemarks.push(
        "No contributions toward savings goals were recorded during this period."
      );
    }
  }

  /* ----------------------------- Recommendations ----------------------------- */
  const recommendations: string[] = [];

  for (const row of overBudgets.slice(0, 2)) {
    recommendations.push(
      `Cut back on ${row.name}: it exceeded its monthly limit by ${formatNaira(
        row.basis - row.limit
      )}. Aim for ${formatNaira(row.limit)} next period.`
    );
  }
  for (const row of nearBudgets.slice(0, 2)) {
    recommendations.push(
      `Watch ${row.name}: ${row.percent}% of the monthly limit is already used.`
    );
  }
  if (budgetRows.length === 0) {
    recommendations.push(
      "Create category budgets so future reports can show whether you stay within your limits."
    );
  }

  if (totalIncome > 0 && totalExpenses > 0 && net < 0) {
    recommendations.push(
      `Spending exceeded income by ${formatNaira(
        Math.abs(net)
      )}. Set a spending cap${
        topCategory ? ` for ${topCategory.name}, your largest category` : ""
      } and review daily expenses.`
    );
  } else if (totalIncome > 0 && net >= 0) {
    const suggested = Math.round((net * 0.1) / 100) * 100;
    if (suggested > 0) {
      recommendations.push(
        `Consider moving ${formatNaira(
          suggested
        )} — 10% of your surplus — into your savings goals.`
      );
    }
  }

  if (topCategory && totalExpenses > 0) {
    const share = percentOf(topCategory.amount, totalExpenses);
    if (share >= 40) {
      recommendations.push(
        `${topCategory.name} made up ${share}% of your spending — review whether that matches your priorities.`
      );
    }
  }

  const datedBehind = inProgressGoals
    .filter((goal) => goal.target_date)
    .sort((a, b) => b.remaining - a.remaining);
  const soonestGoal = datedBehind[0];
  if (soonestGoal?.target_date) {
    const months = monthsUntil(referenceDate, soonestGoal.target_date);
    const perMonth = Math.ceil(soonestGoal.remaining / months);
    recommendations.push(
      `Save about ${formatNaira(perMonth)} per month toward ${
        soonestGoal.name
      } to reach its target by ${formatReportDate(soonestGoal.target_date)}.`
    );
  }
  const undatedBehind = inProgressGoals
    .filter((goal) => !goal.target_date)
    .sort((a, b) => b.remaining - a.remaining);
  if (undatedBehind[0]) {
    const goal = undatedBehind[0];
    recommendations.push(
      `Increase contributions to ${goal.name} — ${formatNaira(
        goal.remaining
      )} more is needed to reach its target.`
    );
  }
  if (goals.length === 0) {
    recommendations.push(
      "Create a savings goal so future reports can track your progress toward a concrete target."
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Keep recording income, expenses and contributions regularly so future reports can give more specific guidance."
    );
  }

  return {
    incomeExpenseRemarks,
    budgetRemarks,
    goalRemarks,
    recommendations: recommendations.slice(0, 8),
  };
}
