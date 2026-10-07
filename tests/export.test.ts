import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  buildExportReport,
  summarizeExportTransactions,
  loadExportTransactions,
  exportTransactionsToCsv,
  exportTransactionsToPdfHtml,
} from "../src/database/export.ts";
import type { ExportedTransaction } from "../src/types/database.ts";

/**
 * A minimal in-memory SQLite database exposing the expo-sqlite methods the
 * export module uses, so the real SQL runs under Node without a device.
 */
class TestDb {
  private sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec(`
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '📦',
        color TEXT NOT NULL DEFAULT '#006B5B',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE income (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'Other',
        payment_method TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        income_date TEXT NOT NULL,
        income_time TEXT NOT NULL DEFAULT '12:00:00',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        payment_method TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  async runAsync(sql: string, ...params: Array<string | number | null>) {
    const result = this.sqlite.prepare(sql).run(...params);
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: Number(result.changes),
    };
  }

  async getFirstAsync<T>(
    sql: string,
    ...params: Array<string | number | null>
  ): Promise<T | null> {
    const row = this.sqlite.prepare(sql).get(...params);
    return row === undefined ? null : (row as T);
  }

  async getAllAsync<T>(
    sql: string,
    ...params: Array<string | number | null>
  ): Promise<T[]> {
    return this.sqlite.prepare(sql).all(...params) as T[];
  }

  async execAsync(sql: string): Promise<void> {
    this.sqlite.exec(sql);
  }

  async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
    this.sqlite.exec("BEGIN");
    try {
      await fn();
      this.sqlite.exec("COMMIT");
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.sqlite.close();
  }

  countRows(table: string): number {
    const row = this.sqlite
      .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
      .get() as { count: number };
    return Number(row.count);
  }
}

let db: TestDb;
const asDb = (): SQLiteDatabase => db as unknown as SQLiteDatabase;

beforeEach(async () => {
  db = new TestDb();
});

afterEach(() => {
  db.close();
});

/** Fixed deterministic dataset (all amounts in kobo). */
async function seed(): Promise<void> {
  const food = await db.runAsync(
    "INSERT INTO categories (name, icon, color) VALUES ('Food', '🍔', '#F59E0B')"
  );
  await db.runAsync(
    "INSERT INTO categories (name, icon, color) VALUES ('Transport', '🚌', '#3B82F6')"
  );
  const foodId = food.lastInsertRowId;
  const transportId = foodId + 1;

  await db.runAsync(
    `INSERT INTO expenses (amount, category_id, description, payment_method, note, date)
     VALUES (150000, ?, 'Lunch at work', 'POS', '', '2026-09-01 12:00:00')`,
    foodId
  );
  await db.runAsync(
    `INSERT INTO expenses (amount, category_id, description, payment_method, note, date)
     VALUES (1200000, ?, 'Groceries', 'Cash', 'Weekly shop', '2026-09-02 13:00:00')`,
    foodId
  );
  await db.runAsync(
    `INSERT INTO expenses (amount, category_id, description, payment_method, note, date)
     VALUES (200000, ?, 'Taxi to Ikeja', 'Cash', '', '2026-08-25 09:00:00')`,
    transportId
  );
  // Legacy expense row: date stored without a time component.
  await db.runAsync(
    `INSERT INTO expenses (amount, category_id, description, payment_method, note, date)
     VALUES (50000, ?, '100% off groceries', 'POS', ?, '2026-09-05')`,
    foodId,
    'Note with "quotes", comma and line\nbreak'
  );

  await db.runAsync(
    `INSERT INTO income (amount, source, payment_method, note, income_date, income_time)
     VALUES (5000000, 'Salary', 'Bank Transfer', 'September pay <script>', '2026-09-01', '09:00:00')`
  );
  await db.runAsync(
    `INSERT INTO income (amount, source, payment_method, note, income_date, income_time)
     VALUES (750000, 'Freelance', 'Bank Transfer', '', '2026-09-15', '14:30:00')`
  );
  await db.runAsync(
    `INSERT INTO income (amount, source, payment_method, note, income_date, income_time)
     VALUES (400000, 'Salary', 'Cash', 'Cash gift', '2026-08-30', '08:00:00')`
  );
}

function txKey(tx: ExportedTransaction): string {
  return `${tx.type}:${tx.type === "income" ? tx.source : tx.description}`;
}

const EXPECTED_ORDER = [
  "income:Freelance",
  "expense:100% off groceries",
  "expense:Groceries",
  "expense:Lunch at work",
  "income:Salary",
  "income:Salary",
  "expense:Taxi to Ikeja",
];

describe("empty dataset", () => {
  it("loads no transactions", async () => {
    assert.deepEqual(await loadExportTransactions(asDb()), []);
  });

  it("builds a zeroed summary", async () => {
    const summary = summarizeExportTransactions([]);
    assert.deepEqual(summary, {
      income: 0,
      expenses: 0,
      net: 0,
      transactionCount: 0,
      categories: [],
      sources: [],
    });
  });

  it("renders a CSV with the header and a zeroed summary section", async () => {
    const report = await buildExportReport(asDb());
    const lines = report.csv.split("\r\n");
    assert.equal(
      lines[0],
      "Date,Type,Description/Source,Category,Payment method,Amount (₦),Note"
    );
    assert.ok(lines.includes("Income (₦),0.00"));
    assert.ok(lines.includes("Expenses (₦),0.00"));
    assert.ok(lines.includes("Net (₦),0.00"));
    assert.ok(lines.includes("Transactions,0"));
  });

  it("renders an empty PDF report", async () => {
    const report = await buildExportReport(asDb());
    assert.match(report.pdfHtml, /Financial export/);
    assert.match(report.pdfHtml, /No transactions recorded\./);
    assert.match(report.pdfHtml, /No data leaves the device/);
  });
});

describe("populated dataset", () => {
  it("loads transactions newest first with normalised fields", async () => {
    await seed();
    const transactions = await loadExportTransactions(asDb());
    assert.equal(transactions.length, 7);
    assert.deepEqual(transactions.map(txKey), EXPECTED_ORDER);

    const freelance = transactions[0];
    assert.equal(freelance.amount, 750000);
    assert.equal(freelance.date, "2026-09-15 14:30:00");
    assert.equal(freelance.categoryId, null);
    assert.equal(freelance.paymentMethod, "Bank Transfer");
    assert.equal(freelance.note, "");

    const legacy = transactions[1];
    assert.equal(legacy.date, "2026-09-05");
    assert.equal(legacy.categoryName, "Food");
    assert.equal(legacy.categoryIcon, "🍔");
    assert.equal(legacy.categoryColor, "#F59E0B");
  });

  it("computes income, expenses, net and sorted breakdowns", async () => {
    await seed();
    const transactions = await loadExportTransactions(asDb());
    const summary = summarizeExportTransactions(transactions);

    assert.equal(summary.income, 6150000);
    assert.equal(summary.expenses, 1600000);
    assert.equal(summary.net, 4550000);
    assert.equal(summary.transactionCount, 7);

    assert.deepEqual(
      summary.categories.map((c) => [c.name, c.total, c.count]),
      [
        ["Food", 1400000, 3],
        ["Transport", 200000, 1],
      ]
    );
    assert.deepEqual(
      summary.sources.map((s) => [s.source, s.total, s.count]),
      [
        ["Salary", 5400000, 2],
        ["Freelance", 750000, 1],
      ]
    );
  });

  it("renders a fully escaped CSV", async () => {
    await seed();
    const report = await buildExportReport(asDb());
    const lines = report.csv.split("\r\n");

    assert.equal(
      lines[0],
      "Date,Type,Description/Source,Category,Payment method,Amount (₦),Note"
    );
    assert.equal(
      lines[1],
      "2026-09-15 14:30:00,Income,Freelance,,Bank Transfer,7500.00,"
    );
    // The legacy row's note contains a comma, quotes and a newline; the whole
    // field must be quoted with internal quotes doubled.
    assert.equal(
      lines[2],
      '2026-09-05,Expense,100% off groceries,Food,POS,500.00,"Note with ""quotes"", comma and line\nbreak"'
    );
    assert.equal(
      lines[3],
      "2026-09-02 13:00:00,Expense,Groceries,Food,Cash,12000.00,Weekly shop"
    );
    assert.equal(
      lines[4],
      "2026-09-01 12:00:00,Expense,Lunch at work,Food,POS,1500.00,"
    );
    assert.equal(
      lines[5],
      "2026-09-01 09:00:00,Income,Salary,,Bank Transfer,50000.00,September pay <script>"
    );
    assert.equal(
      lines[6],
      "2026-08-30 08:00:00,Income,Salary,,Cash,4000.00,Cash gift"
    );
    assert.equal(
      lines[7],
      "2026-08-25 09:00:00,Expense,Taxi to Ikeja,Transport,Cash,2000.00,"
    );

    assert.equal(lines[9], "Summary");
    assert.equal(lines[11], "Income (₦),61500.00");
    assert.equal(lines[12], "Expenses (₦),16000.00");
    assert.equal(lines[13], "Net (₦),45500.00");
    assert.equal(lines[14], "Transactions,7");

    assert.equal(lines[16], "Major Categories");
    assert.equal(lines[17], "Category,Amount (₦)");
    assert.equal(lines[18], "Food,14000.00");
    assert.equal(lines[19], "Transport,2000.00");

    assert.equal(lines[21], "Major Income Sources");
    assert.equal(lines[22], "Source,Amount (₦)");
    assert.equal(lines[23], "Salary,54000.00");
    assert.equal(lines[24], "Freelance,7500.00");
  });

  it("caps the summary breakdown at the top five entries", async () => {
    for (let i = 0; i < 8; i++) {
      await db.runAsync(
        `INSERT INTO categories (name, icon, color) VALUES ('Cat ${i}', '📦', '#000000')`
      );
      await db.runAsync(
        `INSERT INTO expenses (amount, category_id, description, date)
         VALUES (${1000 + i}, ${10 + i}, 'Rows aimed at breakdown cap', '2026-10-0${(i % 9) + 1}')`
      );
    }
    const report = await buildExportReport(asDb());
    const lines = report.csv.split("\r\n");
    const categorySectionStart = lines.indexOf("Major Categories");
    const categorySectionEnd = lines.indexOf("Major Income Sources");
    const categoriesShown = lines.slice(categorySectionStart + 2, categorySectionEnd - 1);
    assert.equal(categoriesShown.length, 5);
  });

  it("renders a PDF report with the summary, breakdowns and escaped notes", async () => {
    await seed();
    const report = await buildExportReport(asDb());

    assert.match(report.pdfHtml, /NGN 61500\.00/); // income
    assert.match(report.pdfHtml, /NGN 16000\.00/); // expenses
    assert.match(report.pdfHtml, /NGN 45500\.00/); // net
    assert.match(report.pdfHtml, /7<\/span>/); // transaction count card
    assert.match(report.pdfHtml, />🍔 Food<\/td>/);
    assert.match(report.pdfHtml, />Salary<\/td>/);
    assert.match(report.pdfHtml, />Lunch at work<\/td>/);
    // HTML must escape user-entered markup in notes.
    assert.ok(report.pdfHtml.includes("September pay &lt;script&gt;"));
    assert.ok(!report.pdfHtml.includes("September pay <script>"));
  });

  it("is deterministic across repeated builds", async () => {
    await seed();
    const first = await buildExportReport(asDb());
    const second = await buildExportReport(asDb());
    assert.equal(first.csv, second.csv);
    assert.equal(first.pdfHtml, second.pdfHtml);
    assert.deepEqual(first.summary, second.summary);
  });

  it("never mutates the database", async () => {
    await seed();
    const beforeExpenses = db.countRows("expenses");
    const beforeIncome = db.countRows("income");
    const beforeCategories = db.countRows("categories");

    await buildExportReport(asDb());
    await buildExportReport(asDb());

    assert.equal(db.countRows("expenses"), beforeExpenses);
    assert.equal(db.countRows("income"), beforeIncome);
    assert.equal(db.countRows("categories"), beforeCategories);
  });
});

describe("pure builders", () => {
  it("buildExportReport ties the pure functions together", async () => {
    await seed();
    const report = await buildExportReport(asDb());
    const expectedCsv = exportTransactionsToCsv(
      report.transactions,
      report.summary
    );
    const expectedHtml = exportTransactionsToPdfHtml(
      report.transactions,
      report.summary,
      report.generatedAt
    );
    assert.equal(report.csv, expectedCsv);
    assert.equal(report.pdfHtml, expectedHtml);
  });

  it("produces a BOM-free plain text CSV with CRLF line endings", async () => {
    const csv = exportTransactionsToCsv([], {
      income: 0,
      expenses: 0,
      net: 0,
      transactionCount: 0,
      categories: [],
      sources: [],
    });
    assert.ok(csv.includes("\r\n"));
    assert.ok(!csv.includes("\ufeff"));
  });
});