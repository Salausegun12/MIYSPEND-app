import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import { computeInsights } from "../src/database/insights.ts";
import type { Insight } from "../src/types/database.ts";

/**
 * A minimal in-memory SQLite database exposing the expo-sqlite methods the
 * insights module uses, so the real SQL runs under Node without a device.
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
}

let db: TestDb;
const asDb = (): SQLiteDatabase => db as unknown as SQLiteDatabase;

beforeEach(async () => {
  db = new TestDb();
});

async function insertCategory(name: string): Promise<number> {
  const result = await db.runAsync(
    "INSERT INTO categories (name) VALUES (?)",
    name
  );
  return result.lastInsertRowId;
}

async function insertExpense(
  amount: number,
  categoryId: number,
  date: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO expenses (amount, category_id, description, date)
     VALUES (?, ?, 'test', ?)`,
    amount,
    categoryId,
    `${date} 12:00:00`
  );
}

async function insertIncome(
  amount: number,
  source: string,
  date: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO income (amount, source, income_date)
     VALUES (?, ?, ?)`,
    amount,
    source,
    date
  );
}

function findInsight(insights: Insight[], id: string): Insight | undefined {
  return insights.find((insight) => insight.id === id);
}

function ids(insights: Insight[]): string[] {
  return insights.map((insight) => insight.id);
}

describe("empty dataset", () => {
  it("returns no insights when nothing is recorded", async () => {
    assert.deepEqual(await computeInsights(asDb(), "2026-09-15"), []);
  });

  it("is deterministic across runs", async () => {
    await insertCategory("Food");
    await insertExpense(100000, 1, "2026-09-01");
    const first = await computeInsights(asDb(), "2026-09-15");
    const second = await computeInsights(asDb(), "2026-09-15");
    assert.deepEqual(first, second);
  });
});

describe("small dataset (single month)", () => {
  it("builds the core insights from one expense and one income", async () => {
    const food = await insertCategory("Food");
    await insertExpense(100000, food, "2026-09-01");
    await insertIncome(500000, "Salary", "2026-09-02");

    const insights = await computeInsights(asDb(), "2026-09-15");

    assert.deepEqual(
      new Set([
        "income-summary",
        "percent-of-income-spent",
        "savings-rate",
        "biggest-expense-category",
        "highest-spending-day",
        "biggest-income-source",
        "highest-income-day",
      ]),
      new Set(ids(insights))
    );

    assert.equal(
      findInsight(insights, "income-summary")?.message,
      "You recorded ₦5,000 income and ₦1,000 expenses this month."
    );
    assert.match(
      findInsight(insights, "percent-of-income-spent")?.message ?? "",
      /spent 20% of your recorded income/
    );
    assert.match(
      findInsight(insights, "savings-rate")?.message ?? "",
      /savings rate is 80%/
    );
    assert.equal(
      findInsight(insights, "biggest-expense-category")?.message,
      "Food is your biggest expense this month: ₦1,000 across 1 transaction."
    );
    assert.match(
      findInsight(insights, "highest-spending-day")?.message ?? "",
      /01 Sep \(₦1,000\)/
    );
    assert.equal(
      findInsight(insights, "biggest-income-source")?.message,
      "Salary is your biggest income source this month: ₦5,000."
    );
    assert.match(
      findInsight(insights, "highest-income-day")?.message ?? "",
      /02 Sep \(₦5,000\)/
    );
  });

  it("never compares against a month that has no recorded spending", async () => {
    const food = await insertCategory("Food");
    await insertExpense(100000, food, "2026-09-01");
    await insertIncome(200000, "Salary", "2026-09-02");

    const insights = await computeInsights(asDb(), "2026-09-15");
    assert.equal(findInsight(insights, "spend-vs-last-month"), undefined);
    assert.equal(findInsight(insights, "category-growth"), undefined);
    assert.equal(findInsight(insights, "unusual-spending"), undefined);
  });

  it("omits savings messages when no income is recorded", async () => {
    const food = await insertCategory("Food");
    await insertExpense(100000, food, "2026-09-01");

    const insights = await computeInsights(asDb(), "2026-09-15");
    const present = ids(insights);
    assert.ok(present.includes("income-summary"));
    assert.ok(present.includes("biggest-expense-category"));
    assert.ok(present.includes("highest-spending-day"));
    assert.equal(findInsight(insights, "savings-rate"), undefined);
    assert.equal(findInsight(insights, "percent-of-income-spent"), undefined);
    assert.equal(findInsight(insights, "biggest-income-source"), undefined);

    assert.equal(
      findInsight(insights, "income-summary")?.message,
      "You recorded ₦1,000 in expenses this month."
    );
  });

  it("reports income-only months without spending claims", async () => {
    await insertIncome(200000, "Salary", "2026-09-02");

    const insights = await computeInsights(asDb(), "2026-09-15");
    const present = ids(insights);
    assert.ok(present.includes("income-summary"));
    assert.ok(present.includes("percent-of-income-spent"));
    assert.ok(present.includes("savings-rate"));
    assert.ok(present.includes("biggest-income-source"));
    assert.ok(present.includes("highest-income-day"));
    assert.ok(!present.includes("biggest-expense-category"));
    assert.ok(!present.includes("highest-spending-day"));

    assert.equal(
      findInsight(insights, "income-summary")?.message,
      "You recorded ₦2,000 in income this month."
    );
    assert.equal(findInsight(insights, "savings-rate")?.tone, "positive");
  });
});

describe("spending change across months", () => {
  it("flags increased spending over the previous month", async () => {
    const food = await insertCategory("Food");
    const transport = await insertCategory("Transport");
    // Previous month: 180,000 + 200,000 = 380,000 (₦3,800)
    await insertExpense(180000, food, "2026-08-05");
    await insertExpense(200000, transport, "2026-08-12");
    // Bonus months so Transport shows a stable "usual" baseline: avg ₦2,000.
    await insertExpense(150000, transport, "2026-06-10");
    await insertExpense(250000, transport, "2026-07-10");
    // This month: 200,000 + 320,000 = 520,000 (₦5,200)
    await insertExpense(200000, food, "2026-09-02");
    await insertExpense(320000, transport, "2026-09-10");

    const insights = await computeInsights(asDb(), "2026-09-15");
    const present = ids(insights);

    assert.ok(present.includes("spend-vs-last-month"), JSON.stringify(present));
    assert.match(
      findInsight(insights, "spend-vs-last-month")?.message ?? "",
      /spent 37% more this month than last month \(₦5,200 vs ₦3,800\)/
    );
    assert.equal(findInsight(insights, "spend-vs-last-month")?.tone, "warning");

    // Food grew only 11% (under the 15% bar); Transport grew 60%.
    assert.equal(
      findInsight(insights, "category-growth")?.message,
      "You spent 60% more on Transport than last month (₦3,200 vs ₦2,000)."
    );

    // Transport is 60% above its 3-month average of ₦2,000.
    assert.match(
      findInsight(insights, "unusual-spending")?.message ?? "",
      /Transport cost ₦3,200 this month — 60% above your usual monthly spend/
    );
  });

  it("reports decreased spending over the previous month", async () => {
    const food = await insertCategory("Food");
    await insertExpense(200000, food, "2026-08-10");
    await insertExpense(100000, food, "2026-09-10");

    const insights = await computeInsights(asDb(), "2026-09-15");
    const insight = findInsight(insights, "spend-vs-last-month");
    assert.ok(insight);
    assert.match(
      insight.message,
      /spent 50% less this month than last month \(₦1,000 vs ₦2,000\)/
    );
    assert.equal(insight.tone, "positive");
  });

  it("says spending matched the previous month when equal", async () => {
    const food = await insertCategory("Food");
    await insertExpense(100000, food, "2026-08-10");
    await insertExpense(100000, food, "2026-09-10");

    const insights = await computeInsights(asDb(), "2026-09-15");
    assert.equal(
      findInsight(insights, "spend-vs-last-month")?.message,
      "Your spending matched last month (₦1,000)."
    );
  });

  it("does not claim a percentage when the baseline is tiny", async () => {
    const food = await insertCategory("Food");
    await insertExpense(1000, food, "2026-08-10");
    await insertExpense(100000, food, "2026-09-10");

    const insights = await computeInsights(asDb(), "2026-09-15");
    assert.equal(findInsight(insights, "spend-vs-last-month"), undefined);
    assert.equal(findInsight(insights, "category-growth"), undefined);
  });
});

describe("unusual spending guards", () => {
  it("requires at least two previous months before calling a month unusual", async () => {
    const transport = await insertCategory("Transport");
    await insertExpense(50000, transport, "2026-08-10");
    await insertExpense(90000, transport, "2026-09-10");

    const insights = await computeInsights(asDb(), "2026-09-15");
    assert.equal(findInsight(insights, "unusual-spending"), undefined);
    // The 80% jump still shows up as ordinary growth.
    const growth = findInsight(insights, "category-growth");
    assert.ok(growth);
    assert.match(growth.message, /spent 80% more on Transport/);
  });
});

describe("savings rate", () => {
  it("warns when recorded expenses exceed recorded income", async () => {
    const food = await insertCategory("Food");
    await insertExpense(150000, food, "2026-09-01");
    await insertIncome(100000, "Salary", "2026-09-02");

    const insights = await computeInsights(asDb(), "2026-09-15");
    const savings = findInsight(insights, "savings-rate");
    assert.ok(savings);
    assert.equal(
      savings.message,
      "Recorded expenses exceeded your recorded income by 50% this month."
    );
    assert.equal(savings.tone, "warning");

    const spent = findInsight(insights, "percent-of-income-spent");
    assert.match(spent?.message ?? "", /spent 150% of your recorded income/);
    assert.equal(spent?.tone, "warning");
  });

  it("reports a 100% savings rate when nothing was spent", async () => {
    await insertIncome(200000, "Salary", "2026-09-02");
    const insights = await computeInsights(asDb(), "2026-09-15");
    assert.match(
      findInsight(insights, "savings-rate")?.message ?? "",
      /savings rate is 100%/
    );
  });
});