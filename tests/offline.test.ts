import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SQLiteDatabase } from "expo-sqlite";

import { addCategory } from "../src/database/categories.ts";
import {
  addExpense,
  updateExpense,
  deleteExpense,
  getExpenseById,
  getAllExpenses,
  getTotalExpenses,
} from "../src/database/expenses.ts";
import {
  addIncome,
  updateIncome,
  deleteIncome,
  getIncomeById,
  getAllIncome,
  getTotalIncome,
} from "../src/database/income.ts";
import {
  addBudget,
  getBudgetsWithSpending,
  getCategorySpentInPeriod,
  getCurrentBudgetPeriod,
} from "../src/database/budget.ts";
import {
  createGoal,
  createContribution,
  getGoalsWithBalances,
} from "../src/database/savingsGoals.ts";
import {
  createRecurringTransaction,
  processDueRecurringTransactions,
} from "../src/database/recurring.ts";
import { computeInsights } from "../src/database/insights.ts";
import { searchTransactions } from "../src/database/search.ts";
import { buildExportReport } from "../src/database/export.ts";
import {
  buildBackupPayload,
  restoreBackup,
  parseBackupJson,
} from "../src/database/backup.ts";

const SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '📦',
    color TEXT NOT NULL DEFAULT '#006B5B',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT (date('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'Other',
    payment_method TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    income_date TEXT NOT NULL DEFAULT (date('now')),
    income_time TEXT NOT NULL DEFAULT (time('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL UNIQUE,
    limit_amount INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS savings_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target_amount INTEGER NOT NULL,
    current_amount INTEGER NOT NULL DEFAULT 0,
    target_date TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (length(trim(name)) > 0),
    CHECK (typeof(target_amount) = 'integer' AND target_amount > 0),
    CHECK (typeof(current_amount) = 'integer' AND current_amount >= 0),
    CHECK (
      target_date IS NULL OR
      target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    )
  );
  CREATE TABLE IF NOT EXISTS contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    date TEXT NOT NULL DEFAULT (date('now')),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (typeof(amount) = 'integer' AND amount > 0),
    FOREIGN KEY (goal_id) REFERENCES savings_goals(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS recurring_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount > 0),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    category_id INTEGER,
    payment_method TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
    next_occurrence TEXT NOT NULL,
    anchor_day INTEGER NOT NULL DEFAULT 1 CHECK (anchor_day BETWEEN 1 AND 31),
    end_date TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS recurring_occurrences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recurring_id INTEGER NOT NULL,
    occurrence_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (recurring_id, occurrence_date),
    FOREIGN KEY (recurring_id) REFERENCES recurring_transactions(id) ON DELETE CASCADE
  );
`;

/**
 * A real SQLite database on disk (no expo runtime, no network) with the exact
 * production schema. Lets the whole app journey run under Node and lets a
 * second connection simulate an app restart.
 */
class TestDb {
  private sqlite: DatabaseSync;

  constructor(path: string) {
    this.sqlite = new DatabaseSync(path);
    this.sqlite.exec(SCHEMA);
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

  count(table: string): number {
    const row = this.sqlite
      .prepare(`SELECT COUNT(*) AS c FROM ${table}`)
      .get() as { c: number };
    return Number(row.c);
  }

  close() {
    this.sqlite.close();
  }
}

const dir = mkdtempSync(join(tmpdir(), "miyspend-offline-test-"));
const dbPath = join(dir, "miyspend.db");
let db: TestDb;
const asDb = (): SQLiteDatabase => db as unknown as SQLiteDatabase;

afterEach(() => {
  try {
    db.close();
  } catch {
    /* already closed by a restart scenario */
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("complete offline walkthrough (airplane mode)", () => {
  it("runs every feature against local data and survives a restart", async () => {
    // Fresh device: no network, no seed data.
    db = new TestDb(dbPath);
    const d = asDb();

    // ------------------------------------------------------------------ setup
    const foodId = await addCategory(d, { name: "Food", icon: "🍔", color: "#F59E0B" });
    const transportId = await addCategory(d, { name: "Transport", icon: "🚌", color: "#3B82F6" });

    // ---------------------------------------------------------- add an income
    const incomeId = await addIncome(d, {
      amount: 5000000,
      source: "Salary",
      payment_method: "Bank Transfer",
      note: "September pay",
      income_date: "2026-09-01",
      income_time: "09:00:00",
    });
    assert.equal((await getIncomeById(d, incomeId))?.amount, 5000000);

    // ---------------------------------------------------------- add an expense
    const expenseId = await addExpense(d, {
      amount: 150000,
      category_id: foodId,
      description: "Lunch at work",
      payment_method: "POS",
      note: "",
      date: "2026-09-01 12:00:00",
    });
    assert.equal((await getExpenseById(d, expenseId))?.description, "Lunch at work");

    // ------------------------------------------------------- edit income + expense
    await updateIncome(d, incomeId, { source: "Salary top-up", amount: 5200000 });
    assert.equal((await getIncomeById(d, incomeId))?.amount, 5200000);
    assert.equal((await getIncomeById(d, incomeId))?.source, "Salary top-up");

    await updateExpense(d, expenseId, {
      amount: 180000,
      description: "Lunch (updated)",
      note: "Edited",
    });
    assert.equal((await getExpenseById(d, expenseId))?.amount, 180000);

    // ------------------------------------------------------- delete income + expense
    await deleteIncome(d, incomeId);
    await deleteExpense(d, expenseId);
    assert.equal(await getIncomeById(d, incomeId), null);
    assert.equal(await getExpenseById(d, expenseId), null);

    // Re-add fresh rows to power the remaining features.
    const freshIncomeId = await addIncome(d, {
      amount: 1800000,
      source: "Freelance",
      payment_method: "Bank Transfer",
      note: "",
      income_date: "2026-09-05",
      income_time: "12:00:00",
    });
    await addExpense(d, {
      amount: 250000,
      category_id: foodId,
      description: "Groceries",
      payment_method: "Cash",
      note: "weekend",
      date: "2026-09-06 10:00:00",
    });
    await addExpense(d, {
      amount: 95000,
      category_id: transportId,
      description: "Taxi",
      payment_method: "POS",
      note: "",
      date: "2026-09-07 08:30:00",
    });

    // ------------------------------------------------------------- create budget
    const budgetId = await addBudget(d, {
      category_id: foodId,
      limit_amount: 500000,
    });
    assert.ok(budgetId > 0);
    const period = getCurrentBudgetPeriod("2026-09-01", "2026-09-30");
    assert.equal(await getCategorySpentInPeriod(d, foodId, period), 250000);
    const budgets = await getBudgetsWithSpending(d, period);
    assert.equal(budgets.length, 1);
    assert.equal(budgets[0].limit_amount, 500000);

    // --------------------------------------------------- create the savings goal
    const goal = await createGoal(d, {
      name: "Emergency fund",
      target_amount: 2000000,
      current_amount: 500000,
    });
    assert.equal(goal.current_amount, 500000);

    // -------------------------------------------------- add a contribution
    await createContribution(d, {
      goal_id: goal.id,
      amount: 300000,
      date: "2026-09-08",
      note: "first bonus",
    });
    const [withBalance] = await getGoalsWithBalances(d);
    assert.equal(withBalance.balance, 800000);
    assert.equal(withBalance.contribution_count, 2);

    // ------------------------------------------- create the recurring transaction
    await createRecurringTransaction(d, {
      type: "expense",
      amount: 50000,
      description: "Daily coffee",
      category_id: foodId,
      payment_method: "POS",
      frequency: "daily",
      next_occurrence: "2026-09-01",
    });

    // Process due occurrences (as the app does at launch / on focus).
    const summary1 = await processDueRecurringTransactions(d, "2026-09-10");
    assert.equal(summary1.expensesGenerated, 10);
    const expensesBefore = await getAllExpenses(d);
    assert.equal(expensesBefore.length, 12); // 2 manual + 10 recurring

    // The ledger prevents duplicates when processing runs again.
    const summary2 = await processDueRecurringTransactions(d, "2026-09-10");
    assert.equal(summary2.expensesGenerated, 0);
    assert.equal((await getAllExpenses(d)).length, 12);

    // ------------------------------------------------------------- dashboard sums
    assert.equal(await getTotalIncome(d, "2026-09-01", "2026-09-30"), 1800000);
    assert.equal(await getTotalExpenses(d, "2026-09-01", "2026-09-30"), 250000 + 95000 + 500000);

    // --------------------------------------------------------------- insights
    const insights = await computeInsights(d, "2026-09-10");
    assert.equal(Array.isArray(insights), true);
    assert.ok(insights.length > 0);

    // -------------------------------------------------------------- reports
    const report = await buildExportReport(d);
    assert.equal(report.transactions.length, 13); // 12 expenses + 1 income
    assert.match(report.csv, /Daily coffee/);
    assert.match(report.pdfHtml, /Financial export/);

    // ---------------------------------------------------------------- search
    const coffeeHits = await searchTransactions(d, { query: "coffee" });
    assert.equal(coffeeHits.length, 10);
    assert.ok(coffeeHits.every((hit) => hit.description.includes("coffee")));
    const incomeHits = await searchTransactions(d, { query: "freelance" });
    assert.equal(incomeHits.length, 1);
    assert.equal(incomeHits[0].type, "income");

    // ---------------------------------------------------------------- export + backup
    const backup = await buildBackupPayload(d);
    const serialized = JSON.stringify(backup);
    const parsed = parseBackupJson(serialized);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.ok);

    // "Delete test data" then restore from the backup.
    for (const table of [
      "contributions",
      "budgets",
      "expenses",
      "income",
      "recurring_occurrences",
      "recurring_transactions",
      "savings_goals",
      "settings",
      "categories",
    ]) {
      await d.runAsync(`DELETE FROM ${table}`);
    }
    assert.equal(db.count("expenses"), 0);
    assert.equal(db.count("categories"), 0);

    const restored = await restoreBackup(d, parsed.payload);
    assert.equal(restored.categories, 2);
    assert.equal(restored.expenses, 12);
    assert.equal(restored.income, 1);
    assert.equal(restored.budgets, 1);
    assert.equal(restored.savingsGoals, 1);
    assert.equal(restored.contributions, 2);
    assert.equal(restored.recurringTransactions, 1);
    assert.equal(restored.recurringOccurrences, 10);
    assert.equal((await getAllIncome(d)).length, 1);
    assert.equal((await getAllExpenses(d)).length, 12);

    // --------------------------------------------------------- restart the app
    db.close();
    db = new TestDb(dbPath);
    const d2 = asDb();

    // Data is still there after a restart...
    assert.equal(db.count("expenses"), 12);
    assert.equal(db.count("income"), 1);
    assert.equal(db.count("budgets"), 1);
    assert.equal(db.count("recurring_transactions"), 1);
    assert.equal((await getIncomeById(d2, freshIncomeId))?.source, "Freelance");

    // ...and running the launch-time recurring pass again creates nothing new.
    const afterRestart = await processDueRecurringTransactions(d2, "2026-09-10");
    assert.equal(afterRestart.expensesGenerated, 0);
    assert.equal(db.count("expenses"), 12);

    const [goalAfter] = await getGoalsWithBalances(d2);
    assert.equal(goalAfter?.balance, 800000);
  });
});