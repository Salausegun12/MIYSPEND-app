import type { SQLiteDatabase } from "expo-sqlite";
import type {
  ExportedTransaction,
  ExportReport,
  ExportSummary,
  TransactionType,
} from "../types/database";

/**
 * Local financial export. Reads every income and expense from the on-device
 * database, derives a financial summary, and renders two formats: a CSV file
 * (transactions plus summary sections) and a printable PDF report (HTML),
 * which the UI hands to the OS print/share sheet.
 *
 * Privacy model: the database is only ever read here, nothing is uploaded,
 * and no external server is contacted. Every user-entered value is escaped
 * both for CSV and HTML so notes/descriptions never break the output.
 */

const CSV_HEADER =
  "Date,Type,Description/Source,Category,Payment method,Amount (₦),Note";

/** How many top categories / sources appear in the exported summary. */
const TOP_BREAKDOWN = 5;

/* -------------------------------------------------------------------------- */
/*                              Formatting helpers                            */
/* -------------------------------------------------------------------------- */

function formatNaira(kobo: number): string {
  const naira = kobo / 100;
  return naira.toFixed(2);
}

function toLocalDateTimeString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
}

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* -------------------------------------------------------------------------- */
/*                               Reading the data                             */
/* -------------------------------------------------------------------------- */

interface ExpenseRow {
  id: number;
  amount: number;
  description: string;
  payment_method: string;
  note: string;
  date: string;
  category_id: number;
  category_name: string;
  category_icon: string;
  category_color: string;
}

interface IncomeRow {
  id: number;
  amount: number;
  source: string;
  payment_method: string;
  note: string;
  income_date: string;
  income_time: string;
}

/**
 * Loads every transaction (income and expenses with their category) from the
 * local database, newest first. Read-only.
 */
export async function loadExportTransactions(
  db: SQLiteDatabase
): Promise<ExportedTransaction[]> {
  const expenseRows = await db.getAllAsync<ExpenseRow>(
    `SELECT
       e.id AS id,
       e.amount AS amount,
       e.description AS description,
       e.payment_method AS payment_method,
       e.note AS note,
       e.date AS date,
       e.category_id AS category_id,
       COALESCE(c.name, '') AS category_name,
       COALESCE(c.icon, '') AS category_icon,
       COALESCE(c.color, '') AS category_color
     FROM expenses e
     LEFT JOIN categories c ON c.id = e.category_id`
  );

  const incomeRows = await db.getAllAsync<IncomeRow>(
    `SELECT
       id,
       amount,
       source,
       payment_method,
       note,
       income_date,
       income_time
     FROM income`
  );

  const transactions: ExportedTransaction[] = [];

  for (const row of expenseRows) {
    transactions.push({
      type: "expense",
      id: Number(row.id),
      amount: Number(row.amount),
      date: String(row.date ?? ""),
      description: String(row.description ?? ""),
      source: "",
      categoryId: Number(row.category_id),
      categoryName: String(row.category_name ?? ""),
      categoryIcon: String(row.category_icon ?? ""),
      categoryColor: String(row.category_color ?? ""),
      paymentMethod: String(row.payment_method ?? ""),
      note: String(row.note ?? ""),
    });
  }

  for (const row of incomeRows) {
    const time = String(row.income_time ?? "").trim();
    const date =
      String(row.income_date ?? "") + (time ? ` ${time}` : "");
    transactions.push({
      type: "income",
      id: Number(row.id),
      amount: Number(row.amount),
      date,
      description: "",
      source: String(row.source ?? ""),
      categoryId: null,
      categoryName: null,
      categoryIcon: null,
      categoryColor: null,
      paymentMethod: String(row.payment_method ?? ""),
      note: String(row.note ?? ""),
    });
  }

  // Newest first. The stored "YYYY-MM-DD" / "YYYY-MM-DD HH:MM:SS" strings sort
  // correctly lexicographically, so legacy date-only expense rows mix safely
  // with timestamped rows.
  transactions.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return b.id - a.id;
  });

  return transactions;
}

/* -------------------------------------------------------------------------- */
/*                              Building the summary                          */
/* -------------------------------------------------------------------------- */

/**
 * Derives the financial summary (income, expenses, net and the major category
 * / income-source breakdowns) from a list of transactions. Pure and
 * deterministic: breakdown lists are sorted by total descending with names as
 * the tie-breaker.
 */
export function summarizeExportTransactions(
  transactions: ExportedTransaction[]
): ExportSummary {
  const categoryMap = new Map<
    number,
    { name: string; icon: string; color: string; total: number; count: number }
  >();
  const sourceMap = new Map<
    string,
    { total: number; count: number }
  >();

  let income = 0;
  let expenses = 0;

  for (const tx of transactions) {
    if (tx.type === "income") {
      income += tx.amount;
      const entry = sourceMap.get(tx.source) ?? { total: 0, count: 0 };
      entry.total += tx.amount;
      entry.count += 1;
      sourceMap.set(tx.source, entry);
    } else {
      expenses += tx.amount;
      const id = tx.categoryId ?? 0;
      const entry = categoryMap.get(id) ?? {
        name: tx.categoryName ?? "",
        icon: tx.categoryIcon ?? "",
        color: tx.categoryColor ?? "",
        total: 0,
        count: 0,
      };
      entry.total += tx.amount;
      entry.count += 1;
      categoryMap.set(id, entry);
    }
  }

  const categories = Array.from(categoryMap.entries())
    .map(([categoryId, entry]) => ({
      categoryId,
      name: entry.name,
      icon: entry.icon,
      color: entry.color,
      total: entry.total,
      count: entry.count,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const sources = Array.from(sourceMap.entries())
    .map(([source, entry]) => ({
      source,
      total: entry.total,
      count: entry.count,
    }))
    .sort((a, b) => b.total - a.total || a.source.localeCompare(b.source));

  return {
    income,
    expenses,
    net: income - expenses,
    transactionCount: transactions.length,
    categories,
    sources,
  };
}

/* -------------------------------------------------------------------------- */
/*                                   CSV                                       */
/* -------------------------------------------------------------------------- */

/**
 * Renders transactions + summary as a UTF-8 CSV string (CRLF line endings).
 * The first section holds one row per transaction; a final section appends
 * the financial summary (income / expenses / net) and the top categories and
 * income sources so the file is still a useful one-page report.
 */
export function exportTransactionsToCsv(
  transactions: ExportedTransaction[],
  summary: ExportSummary
): string {
  const lines: string[] = [];

  lines.push(CSV_HEADER);
  for (const tx of transactions) {
    lines.push(
      [
        escapeCsv(tx.date),
        escapeCsv(tx.type === "income" ? "Income" : "Expense"),
        escapeCsv(tx.type === "income" ? tx.source : tx.description),
        escapeCsv(tx.type === "income" ? "" : (tx.categoryName ?? "")),
        escapeCsv(tx.paymentMethod),
        formatNaira(tx.amount),
        escapeCsv(tx.note),
      ].join(",")
    );
  }

  lines.push("");
  lines.push("Summary");
  lines.push("Key,Value");
  lines.push(`Income (₦),${formatNaira(summary.income)}`);
  lines.push(`Expenses (₦),${formatNaira(summary.expenses)}`);
  lines.push(`Net (₦),${formatNaira(summary.net)}`);
  lines.push(`Transactions,${summary.transactionCount}`);

  lines.push("");
  lines.push("Major Categories");
  lines.push("Category,Amount (₦)");
  for (const total of summary.categories.slice(0, TOP_BREAKDOWN)) {
    lines.push(
      [escapeCsv(total.name), formatNaira(total.total)].join(",")
    );
  }

  lines.push("");
  lines.push("Major Income Sources");
  lines.push("Source,Amount (₦)");
  for (const total of summary.sources.slice(0, TOP_BREAKDOWN)) {
    lines.push(
      [escapeCsv(total.source), formatNaira(total.total)].join(",")
    );
  }

  return lines.join("\r\n");
}

/* -------------------------------------------------------------------------- */
/*                                  PDF report                                */
/* -------------------------------------------------------------------------- */

/**
 * Renders the export as a self-contained HTML document that expo-print can
 * turn into a PDF. All user-entered values are HTML-escaped and the document
 * uses no external resources, so it prints fully offline.
 */
export function exportTransactionsToPdfHtml(
  transactions: ExportedTransaction[],
  summary: ExportSummary,
  generatedAt = new Date()
): string {
  const categoryRows =
    summary.categories.length === 0
      ? '<tr><td colspan="3" class="empty">No expenses recorded.</td></tr>'
      : summary.categories
          .slice(0, TOP_BREAKDOWN)
          .map(
            (total) =>
              `<tr><td>${escapeHtml(total.icon)} ${escapeHtml(
                total.name
              )}</td><td class="amount">NGN ${formatNaira(
                total.total
              )}</td><td class="amount">${total.count}</td></tr>`
          )
          .join("");

  const sourceRows =
    summary.sources.length === 0
      ? '<tr><td colspan="3" class="empty">No income recorded.</td></tr>'
      : summary.sources
          .slice(0, TOP_BREAKDOWN)
          .map(
            (total) =>
              `<tr><td>${escapeHtml(total.source)}</td><td class="amount">NGN ${formatNaira(
                total.total
              )}</td><td class="amount">${total.count}</td></tr>`
          )
          .join("");

  const transactionRows =
    transactions.length === 0
      ? '<tr><td colspan="7" class="empty">No transactions recorded.</td></tr>'
      : transactions
          .map((tx) => {
            const [date, time = ""] = tx.date.split(" ");
            return `<tr>
              <td>${escapeHtml(date)}</td>
              <td>${escapeHtml(time || "—")}</td>
              <td>${escapeHtml(tx.type === "income" ? "Income" : "Expense")}</td>
              <td>${escapeHtml(
                tx.type === "income" ? tx.source : tx.description
              )}</td>
              <td>${escapeHtml(
                tx.type === "income" ? "" : (tx.categoryName ?? "")
              )}</td>
              <td>${escapeHtml(tx.paymentMethod)}</td>
              <td class="amount">NGN ${formatNaira(tx.amount)}</td>
              <td class="note">${escapeHtml(tx.note || "—")}</td>
            </tr>`;
          })
          .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MiySpend financial export</title>
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
      table { border-collapse: collapse; width: 100%; margin-top: 12px; }
      th, td { border-bottom: 1px solid #dce5e1; padding: 7px 6px; text-align: left; vertical-align: top; }
      th { color: #46645c; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
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
        <h1>Financial export</h1>
        <p class="subtitle">All on-device income and expense records</p>
      </div>
      <p class="generated">Generated<br /><strong>${escapeHtml(
        toLocalDateTimeString(generatedAt)
      )}</strong></p>
    </header>

    <section class="summary-grid">
      <div class="summary-card">
        <span class="summary-label">Income</span>
        <span class="summary-value">NGN ${formatNaira(summary.income)}</span>
      </div>
      <div class="summary-card">
        <span class="summary-label">Expenses</span>
        <span class="summary-value">NGN ${formatNaira(summary.expenses)}</span>
      </div>
      <div class="summary-card">
        <span class="summary-label">Net</span>
        <span class="summary-value">NGN ${formatNaira(summary.net)}</span>
      </div>
      <div class="summary-card">
        <span class="summary-label">Transactions</span>
        <span class="summary-value">${summary.transactionCount}</span>
      </div>
    </section>

    <h2>Major categories</h2>
    <table>
      <thead><tr><th>Category</th><th class="amount">Amount (NGN)</th><th class="amount">Count</th></tr></thead>
      <tbody>${categoryRows}</tbody>
    </table>

    <h2>Major income sources</h2>
    <table>
      <thead><tr><th>Source</th><th class="amount">Amount (NGN)</th><th class="amount">Count</th></tr></thead>
      <tbody>${sourceRows}</tbody>
    </table>

    <h2>Transactions</h2>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Time</th>
          <th>Type</th>
          <th>Description/Source</th>
          <th>Category</th>
          <th>Payment method</th>
          <th class="amount">Amount (NGN)</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>${transactionRows}</tbody>
    </table>

    <p class="footer-note">Generated locally on your device. No data leaves the device — nothing is uploaded to any server.</p>
  </body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/*                                   Report                                   */
/* -------------------------------------------------------------------------- */

/**
 * One read of the local database: builds the transactions, the summary, the
 * CSV and the PDF HTML for the export screen. Never writes to the database.
 */
export async function buildExportReport(
  db: SQLiteDatabase,
  generatedAt = new Date()
): Promise<ExportReport> {
  const transactions = await loadExportTransactions(db);
  const summary = summarizeExportTransactions(transactions);
  return {
    transactions,
    summary,
    csv: exportTransactionsToCsv(transactions, summary),
    pdfHtml: exportTransactionsToPdfHtml(transactions, summary, generatedAt),
    generatedAt,
  };
}

/** Re-exported for callers that only need the summary. */
export { summarizeExportTransactions as computeExportSummary };

/**
 * Keep the module self-consistent: this helper exposes the transaction type
 * union so screens can type their state without importing the types module.
 */
export type { TransactionType };