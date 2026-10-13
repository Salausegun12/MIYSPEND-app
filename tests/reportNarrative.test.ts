import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBudgetRows,
  buildReportNarrative,
  countMonthsCovered,
  formatNaira,
  type ReportBudgetRow,
} from "../src/utils/reportNarrative.ts";
import { createSpendingReportHtml } from "../src/utils/reportExport.ts";
import { getReportPeriods } from "../src/utils/reportPeriods.ts";
import type {
  BudgetWithCategory,
  ExpenseWithCategory,
  Income,
  SavingsGoalWithBalance,
} from "../src/types/database.ts";

const REFERENCE_DATE = new Date("2026-10-07T12:00:00");

function makeBudget(
  overrides: Partial<BudgetWithCategory> = {}
): BudgetWithCategory {
  return {
    id: 1,
    category_id: 10,
    limit_amount: 100000,
    created_at: "2026-10-01 00:00:00",
    updated_at: "2026-10-01 00:00:00",
    category_name: "Food",
    category_icon: "🍔",
    category_color: "#FF6B6B",
    spent: 0,
    ...overrides,
  };
}

function makeGoal(
  overrides: Partial<SavingsGoalWithBalance> = {}
): SavingsGoalWithBalance {
  const target = overrides.target_amount ?? 500000;
  const balance = overrides.balance ?? 0;
  return {
    id: 1,
    name: "Emergency fund",
    target_amount: target,
    current_amount: balance,
    target_date: null,
    note: "",
    created_at: "2026-09-01 00:00:00",
    updated_at: "2026-09-01 00:00:00",
    balance,
    remaining: target - balance,
    percent_complete: target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : 0,
    is_reached: balance >= target,
    contribution_count: 0,
    ...overrides,
  };
}

describe("formatNaira", () => {
  it("formats kobo with thousands separators and two decimals", () => {
    assert.equal(formatNaira(123456), "NGN 1,234.56");
  });

  it("formats zero as NGN 0.00", () => {
    assert.equal(formatNaira(0), "NGN 0.00");
  });

  it("keeps negative amounts readable", () => {
    assert.equal(formatNaira(-50000), "NGN -500.00");
  });
});

describe("countMonthsCovered", () => {
  it("counts a single calendar month as 1", () => {
    assert.equal(countMonthsCovered("2026-10-01", "2026-10-31"), 1);
  });

  it("counts a range spanning two months as 2", () => {
    assert.equal(countMonthsCovered("2026-09-15", "2026-10-05"), 2);
  });

  it("counts a six-month range", () => {
    assert.equal(countMonthsCovered("2026-05-01", "2026-10-07"), 6);
  });

  it("falls back to 1 for unparseable input", () => {
    assert.equal(countMonthsCovered("not-a-date", "2026-10-31"), 1);
  });
});

describe("buildBudgetRows", () => {
  it("compares period spend directly with the monthly limit for one month", () => {
    const rows = buildBudgetRows([makeBudget({ spent: 120000 })], 1);
    assert.equal(rows[0].basis, 120000);
    assert.equal(rows[0].percent, 120);
    assert.equal(rows[0].status, "over");
    assert.equal(rows[0].kept, false);
  });

  it("averages spend across multi-month periods before judging status", () => {
    const rows = buildBudgetRows([makeBudget({ spent: 600000 })], 6);
    assert.equal(rows[0].basis, 100000);
    assert.equal(rows[0].status, "reached");
    assert.equal(rows[0].kept, true);
    assert.equal(rows[0].spentInPeriod, 600000);
  });

  it("flags near-limit budgets at 80 percent", () => {
    const rows = buildBudgetRows([makeBudget({ spent: 80000 })], 1);
    assert.equal(rows[0].status, "near");
    assert.equal(rows[0].kept, true);
  });

  it("keeps untouched budgets in normal status", () => {
    const rows = buildBudgetRows([makeBudget({ spent: 0 })], 1);
    assert.equal(rows[0].status, "normal");
    assert.equal(rows[0].kept, true);
  });
});

describe("buildReportNarrative", () => {
  function baseInput(overrides: Partial<Parameters<typeof buildReportNarrative>[0]> = {}) {
    return {
      totalExpenses: 150000,
      expenseCount: 5,
      totalIncome: 200000,
      topCategory: { name: "Food", amount: 80000 },
      budgetRows: [] as ReportBudgetRow[],
      goals: [] as SavingsGoalWithBalance[],
      contributionsTotal: 0,
      contributionsCount: 0,
      referenceDate: REFERENCE_DATE,
      ...overrides,
    };
  }

  it("reports a surplus and suggests saving part of it", () => {
    const result = buildReportNarrative(baseInput());
    const incomeRemarks = result.incomeExpenseRemarks.join(" ");
    assert.match(incomeRemarks, /surplus of NGN 500\.00/);
    assert.match(result.recommendations.join(" "), /10% of your surplus/);
  });

  it("reports a deficit and recommends a spending cap", () => {
    const result = buildReportNarrative(
      baseInput({ totalExpenses: 300000, totalIncome: 200000 })
    );
    assert.match(
      result.incomeExpenseRemarks.join(" "),
      /exceeded income of NGN 2,000\.00 by NGN 1,000\.00/
    );
    assert.match(
      result.recommendations.join(" "),
      /Set a spending cap.*Food/
    );
  });

  it("remarks on over-budget categories and recommends cutting back", () => {
    const budgetRows = buildBudgetRows(
      [makeBudget({ spent: 180000, category_name: "Transport" })],
      1
    );
    const result = buildReportNarrative(baseInput({ budgetRows }));
    assert.match(
      result.budgetRemarks.join(" "),
      /Transport went over its monthly limit: NGN 800\.00 above the NGN 1,000\.00 cap/
    );
    assert.match(
      result.recommendations.join(" "),
      /Cut back on Transport/
    );
  });

  it("says no budgets exist when none are configured", () => {
    const result = buildReportNarrative(baseInput());
    assert.match(
      result.budgetRemarks.join(" "),
      /No budgets have been created yet/
    );
    assert.match(
      result.recommendations.join(" "),
      /Create category budgets/
    );
  });

  it("celebrates reached savings goals as achievements", () => {
    const goals = [
      makeGoal({ name: "Vacation", target_amount: 100000, balance: 100000 }),
    ];
    const result = buildReportNarrative(baseInput({ goals }));
    assert.match(
      result.goalRemarks.join(" "),
      /Achievement: 1 of 1 savings goal reached — Vacation/
    );
  });

  it("summarises contributions made during the period", () => {
    const goals = [makeGoal({ balance: 40000 })];
    const result = buildReportNarrative(
      baseInput({
        goals,
        contributionsTotal: 25000,
        contributionsCount: 3,
      })
    );
    assert.match(
      result.goalRemarks.join(" "),
      /You saved NGN 250\.00 across 3 contributions during this period/
    );
  });

  it("falls back cleanly with no goals at all", () => {
    const result = buildReportNarrative(baseInput());
    assert.match(
      result.goalRemarks.join(" "),
      /No savings goals have been created yet/
    );
    assert.match(
      result.recommendations.join(" "),
      /Create a savings goal/
    );
  });

  it("always produces at least one recommendation", () => {
    const result = buildReportNarrative(
      baseInput({
        totalExpenses: 0,
        totalIncome: 0,
        expenseCount: 0,
        topCategory: null,
      })
    );
    assert.ok(result.recommendations.length > 0);
    assert.ok(result.recommendations.length <= 8);
  });
});

describe("createSpendingReportHtml", () => {
  const period = getReportPeriods(new Date("2026-10-07T12:00:00"))[0];

  const expense: ExpenseWithCategory = {
    id: 1,
    amount: 45000,
    category_id: 10,
    description: "Lunch",
    payment_method: "Cash",
    note: "",
    date: "2026-10-06 12:30:00",
    attachment_uri: null,
    created_at: "2026-10-06 12:31:00",
    updated_at: "2026-10-06 12:31:00",
    category_name: "Food",
    category_icon: "🍔",
    category_color: "#FF6B6B",
  };

  const income: Income = {
    id: 1,
    amount: 250000,
    source: "Salary",
    payment_method: "Bank transfer",
    note: "",
    income_date: "2026-10-05",
    income_time: "09:00:00",
    created_at: "2026-10-05 09:01:00",
    updated_at: "2026-10-05 09:01:00",
  };

  it("includes budgets, goals, achievements, remarks and recommendations", () => {
    const html = createSpendingReportHtml(
      period,
      [expense],
      "2026-09-01",
      {
        incomes: [income],
        budgets: [makeBudget({ spent: 45000 })],
        goals: [makeGoal({ balance: 100000 })],
        contributionsTotal: 100000,
        contributionsCount: 2,
      },
      REFERENCE_DATE
    );

    assert.match(html, /<h2>Remarks<\/h2>/);
    assert.match(html, /<h2>Recommendations<\/h2>/);
    assert.match(html, /<h2>Period achievements<\/h2>/);
    assert.match(html, /<h2>Budgets<\/h2>/);
    assert.match(html, /<h2>Savings goals<\/h2>/);
    assert.match(html, /<h2>Income by source<\/h2>/);
    assert.match(html, /Total income/);
    assert.match(html, /NGN 2,500\.00/);
    assert.match(html, /Food/);
    assert.match(html, /Emergency fund/);
    assert.match(html, /Saved this period/);
    assert.match(html, /NGN 1,000\.00/);
    assert.match(html, /class="status status-/);
  });

  it("still renders useful sections when nothing is configured", () => {
    const html = createSpendingReportHtml(
      period,
      [],
      null,
      {
        incomes: [],
        budgets: [],
        goals: [],
        contributionsTotal: 0,
        contributionsCount: 0,
      },
      REFERENCE_DATE
    );

    assert.match(html, /No budgets have been created yet/);
    assert.match(html, /No savings goals have been created yet/);
    assert.match(html, /No income was recorded for this period/);
    assert.match(html, /No transactions were recorded for this period/);
    assert.match(html, /No income or spending was recorded during this period/);
    assert.match(html, /None/);
  });

  it("shows an average-per-month column for multi-month periods", () => {
    const multiMonthPeriod = getReportPeriods(new Date("2026-10-07T12:00:00"))[5];
    assert.equal(multiMonthPeriod.id, "last-6-months");
    const html = createSpendingReportHtml(
      multiMonthPeriod,
      [expense],
      "2026-04-01",
      {
        incomes: [income],
        budgets: [makeBudget({ spent: 600000 })],
        goals: [],
        contributionsTotal: 0,
        contributionsCount: 0,
      },
      REFERENCE_DATE
    );

    assert.match(html, /Average \/ month \(NGN\)/);
    // The app's "last 6 months" period runs 1 Apr - 31 Aug: 5 calendar months.
    assert.match(html, /This period covers 5 months/);
  });
});
