import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import { searchTransactions } from "../src/database/search.ts";
import type {
  TransactionSearchResult,
  TransactionType,
} from "../src/types/database.ts";

/**
 * A minimal in-memory SQLite database exposing the expo-sqlite methods the
 * search module uses, so the real SQL runs under Node without a device.
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

/** Seed a fixed, deterministic dataset. Returns refs "type:id" in insert order. */
async function seed(): Promise<Record<string, string>> {
  const food = await db.runAsync("INSERT INTO categories (name) VALUES (?)", "Food");
  const transport = await db.runAsync(
    "INSERT INTO categories (name) VALUES (?)",
    "Transport"
  );
  const foodId = food.lastInsertRowId;
  const transportId = transport.lastInsertRowId;

  const expense = (description: string, date: string, payment: string, amount: number, categoryId: number) =>
    db.runAsync(
      `INSERT INTO expenses (amount, category_id, description, payment_method, date)
       VALUES (?, ?, ?, ?, ?)`,
      amount,
      categoryId,
      description,
      payment,
      date
    );
  const income = (source: string, date: string, time: string, payment: string, amount: number) =>
    db.runAsync(
      `INSERT INTO income (amount, source, payment_method, income_date, income_time)
       VALUES (?, ?, ?, ?, ?)`,
      amount,
      source,
      payment,
      date,
      time
    );

  const e1 = await expense("Lunch at work", "2026-09-01 12:00:00", "POS", 150000, foodId);
  const e2 = await expense("Groceries", "2026-09-02 13:00:00", "Cash", 1200000, foodId);
  const e3 = await expense("Taxi to Ikeja", "2026-08-25 09:00:00", "Cash", 200000, transportId);
  // Legacy expense: date stores no time component.
  const e4 = await expense("100% off groceries", "2026-09-05", "POS", 50000, foodId);

  const i1 = await income("Salary", "2026-09-01", "09:00:00", "Bank Transfer", 5000000);
  const i2 = await income("Freelance", "2026-09-15", "14:30:00", "Bank Transfer", 750000);
  const i3 = await income("Salary", "2026-08-30", "08:00:00", "Cash", 400000);

  return {
    e1: `expense:${e1.lastInsertRowId}`,
    e2: `expense:${e2.lastInsertRowId}`,
    e3: `expense:${e3.lastInsertRowId}`,
    e4: `expense:${e4.lastInsertRowId}`,
    i1: `income:${i1.lastInsertRowId}`,
    i2: `income:${i2.lastInsertRowId}`,
    i3: `income:${i3.lastInsertRowId}`,
  };
}

function refs(results: TransactionSearchResult[]): string[] {
  return results.map((result) => `${result.type}:${result.id}`);
}

describe("searchTransactions", () => {
  it("returns everything newest first with no filters", async () => {
    const ids = await seed();
    const results = await searchTransactions(asDb());
    assert.deepEqual(refs(results), [
      ids.i2,
      ids.e4,
      ids.e2,
      ids.e1,
      ids.i1,
      ids.i3,
      ids.e3,
    ]);
  });

  it("ignores blank queries", async () => {
    const ids = await seed();
    const blank = await searchTransactions(asDb(), { query: "   " });
    assert.deepEqual(refs(blank), [
      ids.i2,
      ids.e4,
      ids.e2,
      ids.e1,
      ids.i1,
      ids.i3,
      ids.e3,
    ]);
  });

  it("returns an empty array when no type is included", async () => {
    await seed();
    assert.deepEqual(
      await searchTransactions(asDb(), { types: [] }),
      []
    );
  });

  it("matches expense descriptions case-insensitively", async () => {
    const ids = await seed();
    for (const query of ["lunch", "LUNCH", "Lunch At"]) {
      assert.deepEqual(
        refs(await searchTransactions(asDb(), { query })),
        [ids.e1]
      );
    }
  });

  it("matches income sources", async () => {
    const ids = await seed();
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { query: "salary" })),
      [ids.i1, ids.i3]
    );
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { query: "freelance" })),
      [ids.i2]
    );
  });

  it("matches payment methods", async () => {
    const ids = await seed();
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { query: "cash" })),
      [ids.e2, ids.i3, ids.e3]
    );
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { query: "CASH" })),
      [ids.e2, ids.i3, ids.e3]
    );
  });

  it("matches category names for expenses", async () => {
    const ids = await seed();
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { query: "food" })),
      [ids.e4, ids.e2, ids.e1]
    );
  });

  it("escapes LIKE wildcards in queries", async () => {
    const ids = await seed();
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { query: "%" })),
      [ids.e4]
    );
    assert.deepEqual(
      await searchTransactions(asDb(), { query: "_" }),
      []
    );
    assert.deepEqual(
      await searchTransactions(asDb(), { query: "l\\nch" }),
      []
    );
  });

  it("filters by type", async () => {
    const ids = await seed();
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { types: ["income"] })),
      [ids.i2, ids.i1, ids.i3]
    );
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { types: ["expense"] })),
      [ids.e4, ids.e2, ids.e1, ids.e3]
    );
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { types: ["income", "expense"] })),
      [ids.i2, ids.e4, ids.e2, ids.e1, ids.i1, ids.i3, ids.e3]
    );
  });

  it("filters by category for expenses", async () => {
    const ids = await seed();
    const food = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM categories WHERE name = 'Food'"
    );
    const expenseOnly = await searchTransactions(asDb(), {
      categoryId: food!.id,
      types: ["expense"],
    });
    assert.deepEqual(refs(expenseOnly), [ids.e4, ids.e2, ids.e1]);
  });

  it("leaves income unaffected by a category filter", async () => {
    const ids = await seed();
    const food = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM categories WHERE name = 'Food'"
    );
    const results = await searchTransactions(asDb(), {
      categoryId: food!.id,
    });
    assert.deepEqual(refs(results), [
      ids.i2,
      ids.e4,
      ids.e2,
      ids.e1,
      ids.i1,
      ids.i3,
    ]);
  });

  it("filters by exact payment method", async () => {
    const ids = await seed();
    const results = await searchTransactions(asDb(), {
      paymentMethod: "Bank Transfer",
    });
    assert.deepEqual(refs(results), [ids.i2, ids.i1]);
  });

  it("filters by date range across income and legacy expenses", async () => {
    const ids = await seed();
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { dateFrom: "2026-09-01" })),
      [ids.i2, ids.e4, ids.e2, ids.e1, ids.i1]
    );
    assert.deepEqual(
      refs(
        await searchTransactions(asDb(), {
          dateFrom: "2026-09-01",
          dateTo: "2026-09-30",
        })
      ),
      [ids.i2, ids.e4, ids.e2, ids.e1, ids.i1]
    );
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { dateTo: "2026-09-01" })),
      [ids.e1, ids.i1, ids.i3, ids.e3]
    );
  });

  it("filters by amount range in kobo", async () => {
    const ids = await seed();
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { minAmount: 500000 })),
      [ids.i2, ids.e2, ids.i1]
    );
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { maxAmount: 100000 })),
      [ids.e4]
    );
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { minAmount: 150000, maxAmount: 200000 })),
      [ids.e1, ids.e3]
    );
  });

  it("combines independent filters with AND", async () => {
    const ids = await seed();
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { query: "cash", types: ["expense"], categoryId: 1 })),
      [ids.e2]
    );
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { query: "salary", paymentMethod: "Bank Transfer" })),
      [ids.i1]
    );
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { query: "salary", types: ["income"], minAmount: 1000000 })),
      [ids.i1]
    );
    assert.deepEqual(
      refs(await searchTransactions(asDb(), { types: ["income"], categoryId: 1 })),
      [ids.i2, ids.i1, ids.i3]
    );
  });

  it("limited searches return only the newest rows", async () => {
    const ids = await seed();
    assert.deepEqual(refs(await searchTransactions(asDb(), { limit: 1 })), [ids.i2]);
    assert.deepEqual(refs(await searchTransactions(asDb(), { limit: 2 })), [ids.i2, ids.e4]);
    assert.deepEqual(refs(await searchTransactions(asDb(), { limit: 3, types: ["expense"] })), [
      ids.e4,
      ids.e2,
      ids.e1,
    ]);
  });

  it("normalises result fields per record type", async () => {
    const ids = await seed();

    const expense = (await searchTransactions(asDb(), { query: "ikeja" }))[0];
    assert.equal(expense.type, "expense");
    assert.equal(expense.id, Number(ids.e3.replace("expense:", "")));
    assert.equal(expense.amount, 200000);
    assert.equal(expense.description, "Taxi to Ikeja");
    assert.equal(expense.payment_method, "Cash");
    assert.equal(expense.date, "2026-08-25 09:00:00");
    assert.equal(expense.category_name, "Transport");
    assert.equal(expense.category_icon, "📦");
    assert.equal(expense.category_color, "#006B5B");
    assert.equal(expense.source, "");

    const income = (await searchTransactions(asDb(), { query: "freelance" }))[0];
    assert.equal(income.type, "income");
    assert.equal(income.amount, 750000);
    assert.equal(income.description, "Freelance");
    assert.equal(income.payment_method, "Bank Transfer");
    assert.equal(income.date, "2026-09-15 14:30:00");
    assert.equal(income.category_id, null);
    assert.equal(income.category_name, null);
    assert.equal(income.source, "Freelance");
  });

  it("is deterministic across repeated runs", async () => {
    const ids = await seed();
    const first = await searchTransactions(asDb(), { query: "salary" });
    const second = await searchTransactions(asDb(), { query: "salary" });
    assert.deepEqual(refs(first), refs(second));
    assert.deepEqual(refs(first), [ids.i1, ids.i3]);
  });

  it("never mutates the database", async () => {
    await seed();
    const beforeExpenses = db.countRows("expenses");
    const beforeIncome = db.countRows("income");
    const beforeCategories = db.countRows("categories");

    await searchTransactions(asDb(), { query: "salary" });
    await searchTransactions(asDb(), { minAmount: 1000000 });
    await searchTransactions(asDb(), { query: "nonexistent-term" });

    assert.equal(db.countRows("expenses"), beforeExpenses);
    assert.equal(db.countRows("income"), beforeIncome);
    assert.equal(db.countRows("categories"), beforeCategories);
  });

  it("throws on invalid filter values", async () => {
    await seed();
    await assert.rejects(
      searchTransactions(asDb(), { types: ["savings"] as unknown as TransactionType[] }),
      /Invalid type/
    );
    await assert.rejects(searchTransactions(asDb(), { dateFrom: "2026-13-01" }), /Invalid start date/);
    await assert.rejects(searchTransactions(asDb(), { dateFrom: "2026/09/01" }), /Invalid start date/);
    await assert.rejects(searchTransactions(asDb(), { dateFrom: "2026-02-30" }), /not a real calendar date/);
    await assert.rejects(searchTransactions(asDb(), { minAmount: -1 }), /minimum amount/);
    await assert.rejects(searchTransactions(asDb(), { minAmount: 100, maxAmount: 99 }), /Minimum amount/);
    await assert.rejects(searchTransactions(asDb(), { dateFrom: "2026-10-01", dateTo: "2026-09-01" }), /Start date/);
    await assert.rejects(searchTransactions(asDb(), { limit: 0 }), /positive integer/);
    await assert.rejects(searchTransactions(asDb(), { limit: -5 }), /positive integer/);
    await assert.rejects(searchTransactions(asDb(), { categoryId: 0 }), /category id/);
    await assert.rejects(searchTransactions(asDb(), { minAmount: 100.5 }), /minimum amount/);
  });
});