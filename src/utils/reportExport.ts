import type { ExpenseWithCategory } from "../types/database";
import {
  formatReportDate,
  formatReportDateTime,
  type ReportPeriod,
} from "./reportPeriods";

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

function formatAmount(kobo: number): string {
  return (kobo / 100).toFixed(2);
}

function formatGeneratedAt(date: Date): string {
  return formatReportDateTime(toLocalDateTimeString(date));
}

export function createSpendingReportHtml(
  period: ReportPeriod,
  expenses: ExpenseWithCategory[],
  oldestExpenseDate: string | null,
  generatedAt = new Date()
): string {
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
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
  const categoryRows =
    sortedCategoryTotals.length === 0
      ? '<tr><td colspan="2" class="empty">No category spending was recorded for this period.</td></tr>'
      : sortedCategoryTotals
          .map(
            ([category, amount]) =>
              `<tr><td>${escapeHtml(category)}</td><td class="amount">NGN ${formatAmount(
                amount
              )}</td></tr>`
          )
          .join("");
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
              <td class="amount">NGN ${formatAmount(expense.amount)}</td>
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
      h2 { color: #12372f; font-size: 15px; margin: 22px 0 8px; }
      .subtitle, .generated { color: #5f6b76; margin: 0; }
      .generated { text-align: right; }
      .summary-grid { display: flex; gap: 10px; margin-top: 16px; }
      .summary-card { background: #e8f5f1; border-radius: 8px; flex: 1; padding: 11px 12px; }
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
      <div class="summary-card">
        <span class="summary-label">Total spending</span>
        <span class="summary-value">NGN ${formatAmount(total)}</span>
      </div>
      <div class="summary-card">
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

    <h2>Category totals</h2>
    <table class="category-table">
      <thead><tr><th>Category</th><th class="amount">Amount (NGN)</th></tr></thead>
      <tbody>${categoryRows}</tbody>
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

    <p class="footer-note">This report includes the spending records available in MiySpend for the selected period.</p>
  </body>
</html>`;
}
