import type {
  BudgetStatus,
  BudgetWithCategory,
  ExpenseWithCategory,
  Income,
  SavingsGoalWithBalance,
} from "../types/database";
import { getBudgetStatusLabel } from "./budget";
import {
  formatReportDate,
  formatReportDateTime,
  type ReportPeriod,
} from "./reportPeriods";
import {
  buildBudgetRows,
  buildReportNarrative,
  countMonthsCovered,
  formatNaira,
} from "./reportNarrative";

export interface ReportSupportData {
  incomes: Income[];
  budgets: BudgetWithCategory[];
  goals: SavingsGoalWithBalance[];
  contributionsTotal: number;
  contributionsCount: number;
}

function toLocalDateTimeString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatGeneratedAt(date: Date): string {
  return formatReportDateTime(toLocalDateTimeString(date));
}

function remarkList(items: string[]): string {
  if (items.length === 0) return "<ul><li>None.</li></ul>";
  return `<ul>${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

function budgetStatusClass(status: BudgetStatus): string {
  if (status === "over") return "status-bad";
  if (status === "near") return "status-warn";
  return "status-ok";
}

export function createSpendingReportHtml(
  period: ReportPeriod,
  expenses: ExpenseWithCategory[],
  oldestExpenseDate: string | null,
  support: ReportSupportData,
  generatedAt = new Date()
): string {
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalIncome = support.incomes.reduce(
    (sum, income) => sum + income.amount,
    0
  );
  const net = totalIncome - total;
  const categoryTotals = new Map<string, number>();
  const sortedExpenses = [...expenses].sort((a, b) => {
    const aSortValue = `${a.date} ${a.created_at}`;
    const bSortValue = `${b.date} ${b.created_at}`;
    return aSortValue.localeCompare(bSortValue);
  });

  for (const expense of expenses) {
    categoryTotals.set(
      expense.category_name,
      (categoryTotals.get(expense.category_name) ?? 0) + expense.amount
    );
  }

  const sortedCategoryTotals = Array.from(categoryTotals.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  const sourceTotals = new Map<string, number>();
  for (const income of support.incomes) {
    sourceTotals.set(
      income.source,
      (sourceTotals.get(income.source) ?? 0) + income.amount
    );
  }
  const sortedSourceTotals = Array.from(sourceTotals.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  const monthsCovered = countMonthsCovered(period.startDate, period.endDate);
  const budgetRows = buildBudgetRows(support.budgets, monthsCovered);
  const showAvg = monthsCovered > 1;
  const periodStart = new Date(`${period.startDate}T00:00:00`);
  const periodEnd = new Date(`${period.endDate}T00:00:00`);
  const periodDays =
    Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())
      ? 30
      : Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000) +
        1;
  const shortPeriod = periodDays < 28;

  const budgetNote =
    budgetRows.length === 0
      ? "No budgets have been created yet."
      : showAvg
      ? `This period covers ${monthsCovered} months, so status compares average monthly spending with each monthly limit.`
      : shortPeriod
      ? "Budget status compares spending recorded during this period with your monthly limits; a full month's spending may fall outside this range."
      : "";

  const narrative = buildReportNarrative({
    totalExpenses: total,
    expenseCount: expenses.length,
    totalIncome,
    topCategory:
      sortedCategoryTotals.length > 0
        ? {
            name: sortedCategoryTotals[0][0],
            amount: sortedCategoryTotals[0][1],
          }
        : null,
    budgetRows,
    goals: support.goals,
    contributionsTotal: support.contributionsTotal,
    contributionsCount: support.contributionsCount,
    referenceDate: generatedAt,
  });

  const categoryRows =
    sortedCategoryTotals.length === 0
      ? '<tr><td colspan="2" class="empty">No category spending was recorded for this period.</td></tr>'
      : sortedCategoryTotals
          .map(
            ([category, amount]) =>
              `<tr><td>${escapeHtml(
                category
              )}</td><td class="amount">${formatNaira(amount)}</td></tr>`
          )
          .join("");

  const incomeSourceRows =
    sortedSourceTotals.length === 0
      ? '<tr><td colspan="2" class="empty">No income was recorded for this period.</td></tr>'
      : sortedSourceTotals
          .map(
            ([source, amount]) =>
              `<tr><td>${escapeHtml(
                source
              )}</td><td class="amount">${formatNaira(amount)}</td></tr>`
          )
          .join("");

  const budgetColSpan = showAvg ? 5 : 4;
  const budgetTableRows =
    budgetRows.length === 0
      ? `<tr><td colspan="${budgetColSpan}" class="empty">No budgets have been created yet.</td></tr>`
      : budgetRows
          .map(
            (row) => `<tr>
              <td>${escapeHtml(row.name)}</td>
              <td class="amount">${formatNaira(row.limit)}</td>
              <td class="amount">${formatNaira(row.spentInPeriod)}</td>
              ${
                showAvg
                  ? `<td class="amount">${formatNaira(row.basis)}</td>`
                  : ""
              }
              <td><span class="status ${budgetStatusClass(
                row.status
              )}">${escapeHtml(
              getBudgetStatusLabel(row.status)
            )} (${row.percent}%)</span></td>
            </tr>`
          )
          .join("");

  const goalTableRows =
    support.goals.length === 0
      ? '<tr><td colspan="6" class="empty">No savings goals have been created yet.</td></tr>'
      : support.goals
          .map((goal) => {
            const statusClass = goal.is_reached ? "status-ok" : "status-neutral";
            const statusLabel = goal.is_reached ? "Achieved" : "In progress";
            const progressNote = goal.is_reached
              ? '<span class="cell-note">Target complete</span>'
              : `<span class="cell-note">${escapeHtml(
                  formatNaira(goal.remaining)
                )} to go</span>`;
            return `<tr>
              <td>${escapeHtml(goal.name)}</td>
              <td class="amount">${formatNaira(goal.target_amount)}</td>
              <td class="amount">${formatNaira(goal.balance)}</td>
              <td>${goal.percent_complete}%${progressNote}</td>
              <td>${
                goal.target_date
                  ? escapeHtml(formatReportDate(goal.target_date))
                  : "—"
              }</td>
              <td><span class="status ${statusClass}">${statusLabel}</span></td>
            </tr>`;
          })
          .join("");

  const keptCount = budgetRows.filter((row) => row.kept).length;
  const reachedCount = support.goals.filter((goal) => goal.is_reached).length;
  const budgetCardValue = budgetRows.length
    ? `${keptCount} of ${budgetRows.length}`
    : "None";
  const goalCardValue = support.goals.length
    ? `${reachedCount} of ${support.goals.length}`
    : "None";

  const transactionRows =
    sortedExpenses.length === 0
      ? '<tr><td colspan="7" class="empty">No transactions were recorded for this period.</td></tr>'
      : sortedExpenses
          .map((expense) => {
            const [date, time = ""] = expense.date.split(" ");
            return `<tr>
              <td>${escapeHtml(date)}</td>
              <td>${escapeHtml(time || "—")}</td>
              <td>${escapeHtml(expense.description || "—")}</td>
              <td>${escapeHtml(expense.category_name)}</td>
              <td>${escapeHtml(expense.payment_method)}</td>
              <td class="amount">${formatNaira(expense.amount)}</td>
              <td class="note">${escapeHtml(expense.note || "—")}</td>
            </tr>`;
          })
          .join("");
  const recordedDataStart = oldestExpenseDate
    ? formatReportDate(oldestExpenseDate)
    : "Not recorded";
  const periodDescription = `${period.label} · ${period.rangeLabel}${
    period.isCurrentWeek ? " · so far" : ""
  }`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MiySpend spending report</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 11px; line-height: 1.4; }
      .report-header { align-items: flex-start; border-bottom: 2px solid #006b5b; display: flex; justify-content: space-between; padding-bottom: 14px; }
      .brand { color: #006b5b; font-size: 10px; font-weight: 700; letter-spacing: 1.5px; }
      h1 { color: #12372f; font-size: 24px; margin: 4px 0 2px; }
      h2 { color: #12372f; font-size: 15px; margin: 22px 0 8px; border-left: 4px solid #006b5b; padding-left: 8px; }
      h3 { color: #334155; font-size: 12px; font-weight: 600; margin: 14px 0 4px; }
      .subtitle, .generated { color: #5f6b76; margin: 0; }
      .generated { text-align: right; }
      .summary-grid { display: flex; gap: 10px; margin-top: 16px; }
      .summary-card { border-radius: 8px; flex: 1; padding: 11px 12px; border-top: 3px solid transparent; }
      .card-spend { background: #FFF1F2; border-top-color: #F43F5E; }
      .card-spend .summary-value { color: #E11D48; }
      .card-income { background: #ECFDF5; border-top-color: #16B364; }
      .card-income .summary-value { color: #047857; }
      .card-net { background: #EEF2FF; border-top-color: #6366F1; }
      .card-net .summary-value { color: #4338CA; }
      .card-net.is-neg .summary-value { color: #DC2626; }
      .card-count { background: #FFF7ED; border-top-color: #F59E0B; }
      .card-count .summary-value { color: #C2410C; }
      .summary-label { color: #46645c; display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
      .summary-value { color: #12372f; display: block; font-size: 17px; font-weight: 700; margin-top: 2px; }
      .details-table { margin-top: 12px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border-bottom: 1px solid #dce5e1; padding: 7px 6px; text-align: left; vertical-align: top; }
      th { color: #46645c; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
      .details-table th { width: 28%; }
      .category-table { max-width: 430px; }
      .amount { text-align: right; white-space: nowrap; }
      .note { max-width: 150px; overflow-wrap: anywhere; white-space: pre-wrap; }
      .empty { color: #6b7280; font-style: italic; text-align: center; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      ul { margin: 4px 0 10px; padding-left: 18px; }
      li { margin-bottom: 3px; }
      .table-note { color: #6b7280; font-size: 9px; margin: 5px 0 0; }
      .status { font-weight: 600; white-space: nowrap; }
      .status-ok { color: #15803d; }
      .status-warn { color: #b45309; }
      .status-bad { color: #b91c1c; }
      .status-neutral { color: #46645c; }
      .cell-note { color: #6b7280; display: block; font-size: 9px; margin-top: 1px; }
      .achieve-grid { display: flex; gap: 10px; margin-top: 8px; }
      .achieve-card { background: #f0faf6; border: 1px solid #d8efe6; border-radius: 8px; flex: 1; padding: 10px 12px; }
      .ach-blue { background: #EFF6FF; border-color: #BFDBFE; }
      .ach-blue .summary-value { color: #1D4ED8; }
      .ach-amber { background: #FFF8EC; border-color: #FDE3BE; }
      .ach-amber .summary-value { color: #B45309; }
      .ach-mint { background: #ECFDF3; border-color: #C7F0DB; }
      .ach-mint .summary-value { color: #047857; }
      .footer-note { color: #6b7280; font-size: 9px; margin-top: 18px; }
    </style>
  </head>
  <body>
    <header class="report-header">
      <div>
        <div class="brand">MIYSPEND</div>
        <h1>Spending report</h1>
        <p class="subtitle">${escapeHtml(periodDescription)}</p>
      </div>
      <p class="generated">Generated<br /><strong>${escapeHtml(
        formatGeneratedAt(generatedAt)
      )}</strong></p>
    </header>

    <section class="summary-grid">
      <div class="summary-card card-spend">
        <span class="summary-label">Total spending</span>
        <span class="summary-value">${formatNaira(total)}</span>
      </div>
      <div class="summary-card card-income">
        <span class="summary-label">Total income</span>
        <span class="summary-value">${formatNaira(totalIncome)}</span>
      </div>
      <div class="summary-card card-net${net < 0 ? " is-neg" : ""}">
        <span class="summary-label">Net</span>
        <span class="summary-value">${formatNaira(net)}</span>
      </div>
      <div class="summary-card card-count">
        <span class="summary-label">Transactions</span>
        <span class="summary-value">${expenses.length}</span>
      </div>
    </section>

    <table class="details-table">
      <tbody>
        <tr><th>Report period</th><td>${escapeHtml(period.label)}</td></tr>
        <tr><th>Requested range</th><td>${escapeHtml(period.rangeLabel)}</td></tr>
        <tr><th>Data through</th><td>${escapeHtml(
          formatReportDateTime(period.dataEndDateTime)
        )}</td></tr>
        <tr><th>Recorded data starts</th><td>${escapeHtml(
          recordedDataStart
        )}</td></tr>
        <tr><th>Generated at</th><td>${escapeHtml(
          formatGeneratedAt(generatedAt)
        )}</td></tr>
      </tbody>
    </table>

    <h2>Remarks</h2>
    <h3>Budgets</h3>
    ${remarkList(narrative.budgetRemarks)}
    <h3>Savings goals</h3>
    ${remarkList(narrative.goalRemarks)}
    <h3>Income &amp; expenses</h3>
    ${remarkList(narrative.incomeExpenseRemarks)}

    <h2>Recommendations</h2>
    ${remarkList(narrative.recommendations)}

    <h2>Period achievements</h2>
    <section class="achieve-grid">
      <div class="achieve-card ach-blue">
        <span class="summary-label">Budgets kept</span>
        <span class="summary-value">${budgetCardValue}</span>
      </div>
      <div class="achieve-card ach-amber">
        <span class="summary-label">Goals reached</span>
        <span class="summary-value">${goalCardValue}</span>
      </div>
      <div class="achieve-card ach-mint">
        <span class="summary-label">Saved this period</span>
        <span class="summary-value">${formatNaira(
          support.contributionsTotal
        )}</span>
      </div>
    </section>

    <h2>Budgets</h2>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th class="amount">Monthly limit (NGN)</th>
          <th class="amount">Spent in period (NGN)</th>
          ${
            showAvg
              ? '<th class="amount">Average / month (NGN)</th>'
              : ""
          }
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${budgetTableRows}</tbody>
    </table>
    ${budgetNote ? `<p class="table-note">${escapeHtml(budgetNote)}</p>` : ""}

    <h2>Savings goals</h2>
    <table>
      <thead>
        <tr>
          <th>Goal</th>
          <th class="amount">Target (NGN)</th>
          <th class="amount">Saved (NGN)</th>
          <th>Progress</th>
          <th>Due date</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${goalTableRows}</tbody>
    </table>

    <h2>Category totals</h2>
    <table class="category-table">
      <thead><tr><th>Category</th><th class="amount">Amount (NGN)</th></tr></thead>
      <tbody>${categoryRows}</tbody>
    </table>

    <h2>Income by source</h2>
    <table class="category-table">
      <thead><tr><th>Source</th><th class="amount">Amount (NGN)</th></tr></thead>
      <tbody>${incomeSourceRows}</tbody>
    </table>

    <h2>Transactions</h2>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Time</th>
          <th>Description</th>
          <th>Category</th>
          <th>Payment method</th>
          <th class="amount">Amount (NGN)</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>${transactionRows}</tbody>
    </table>

    <p class="footer-note">This report includes the spending, income, budget and savings goal records available in MiySpend for the selected period.</p>
  </body>
</html>`;
}
