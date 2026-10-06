import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  RECURRING_SCHEMA_SQL,
  advanceOccurrence,
  enumerateDueOccurrences,
  createRecurringTransaction,
  updateRecurringTransaction,
  setRecurringActive,
  getRecurringById,
  getAllRecurringTransactions,
  processDueRecurringTransactions,
  deleteRecurringTransaction,
} from "../src/database/recurring.ts";
import type { CreateRecurringInput } from "../src/types/database.ts";

/**
 * A minimal in-memory SQLite database that exposes the expo-sqlite methods
 * the recurring module uses. Lets us run the real SQL without a device.
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
    this.sqlite.exec(RECURRING_SCHEMA_SQL);
  }

  async runAsync(sql: string, ...params: Array<string | number | null>) {
    const result = this.sqlite.prepare(sql).run(...params);
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: Number(result.changes),
    };
  }

  async getFirstAsync<T>(sql: string, ...params: Array<string | number | null>): Promise<T | null> {
    const row = this.sqlite.prepare(sql).get(...params);
    return row === undefined ? null : (row as T);
  }

  async getAllAsync<T>(sql: string, ...params: Array<string | number | null>): Promise<T[]> {
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

async function insertCategory(name = "Housing"): Promise<number> {
  const result = await db.runAsync(
    "INSERT INTO categories (name) VALUES (?)",
    name
  );
  return result.lastInsertRowId;
}

async function incomeRows(): Promise<Array<Record<string, unknown>>> {
  return db.getAllAsync(
    "SELECT * FROM income ORDER BY income_date ASC, id ASC"
  );
}

async function expenseRows(): Promise<Array<Record<string, unknown>>> {
  return db.getAllAsync(
    "SELECT * FROM expenses ORDER BY date ASC, id ASC"
  );
}

async function incomeDateSet(): Promise<string[]> {
  const rows = await incomeRows();
  return rows.map((r) => String(r.income_date));
}

describe("date math", () => {
  it("advances dates daily and weekly", () => {
    assert.equal(advanceOccurrence("2026-10-01", "daily", 1), "2026-10-02");
    assert.equal(advanceOccurrence("2026-10-31", "daily", 31), "2026-11-01");
    assert.equal(advanceOccurrence("2026-10-01", "weekly", 1), "2026-10-08");
    assert.equal(advanceOccurrence("2026-10-01", "yearly", 1), "2027-10-01");
  });

  it("keeps a 31st-of-month schedule stable across short months", () => {
    assert.equal(advanceOccurrence("2026-01-31", "monthly", 31), "2026-02-28");
    assert.equal(advanceOccurrence("2026-02-28", "monthly", 31), "2026-03-31");
    assert.equal(advanceOccurrence("2026-04-30", "monthly", 30), "2026-05-30");
  });

  it("clamps Feb 29 on non-leap years", () => {
    assert.equal(advanceOccurrence("2024-02-29", "yearly", 29), "2025-02-28");
    // 2028 is a leap year, so 29 Feb survives the roll-over.
    assert.equal(advanceOccurrence("2028-02-29", "yearly", 29), "2029-02-28");
  });

  it("enumerates occurrences up to a cap date", () => {
    const due = enumerateDueOccurrences(
      "2026-01-05",
      "2026-01-10",
      "daily",
      5,
      "2026-01-07"
    );
    assert.deepEqual(due, ["2026-01-05", "2026-01-06", "2026-01-07"]);
  });
});

describe("create / validation", () => {
  it("creates an active recurring record with an anchor day", async () => {
    const record = await createRecurringTransaction(asDb(), {
      type: "income",
      amount: 250000,
      description: "Monthly salary",
      frequency: "monthly",
      next_occurrence: "2026-01-31",
    });
    assert.equal(record.id, 1);
    assert.equal(record.anchor_day, 31);
    assert.equal(record.is_active, 1);
    assert.equal(record.end_date, null);
  });

  it("rejects bad amounts, missing descriptions, and bad dates", async () => {
    const base: CreateRecurringInput = {
      type: "income",
      amount: 1000,
      description: "Salary",
      frequency: "monthly",
      next_occurrence: "2026-01-01",
    };
    await assert.rejects(
      createRecurringTransaction(asDb(), { ...base, amount: 0 })
    );
    await assert.rejects(
      createRecurringTransaction(asDb(), { ...base, amount: -5 })
    );
    await assert.rejects(
      createRecurringTransaction(asDb(), { ...base, description: "   " })
    );
    await assert.rejects(
      createRecurringTransaction(asDb(), { ...base, next_occurrence: "2026-13-01" })
    );
    await assert.rejects(
      createRecurringTransaction(asDb(), {
        ...base,
        next_occurrence: "2026-99-99",
      })
    );
    await assert.rejects(
      createRecurringTransaction(asDb(), {
        ...base,
        end_date: "2025-12-31",
      })
    );
  });

  it("requires a category for expense records", async () => {
    await assert.rejects(
      createRecurringTransaction(asDb(), {
        type: "expense",
        amount: 150000,
        description: "Rent",
        frequency: "monthly",
        next_occurrence: "2026-01-01",
      })
    );
  });
});

describe("generation + dedupe", () => {
  it("generates daily income occurrences offline and never duplicates", async () => {
    const created = await createRecurringTransaction(asDb(), {
      type: "income",
      amount: 10000,
      description: "Daily gig",
      frequency: "daily",
      next_occurrence: "2026-10-01",
    });

    const first = await processDueRecurringTransactions(asDb(), "2026-10-03");
    assert.equal(first.incomeGenerated, 3);
    assert.equal(first.occurrencesProcessed, 3);
    assert.equal(first.recordsProcessed, 1);
    assert.deepEqual(await incomeDateSet(), [
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);

    const updated = await getRecurringById(asDb(), created.id);
    assert.equal(updated?.next_occurrence, "2026-10-04");

    // Re-processing the same period must not create duplicates.
    const second = await processDueRecurringTransactions(asDb(), "2026-10-03");
    assert.equal(second.incomeGenerated, 0);
    assert.equal(second.occurrencesProcessed, 0);
    assert.equal((await incomeRows()).length, 3);

    // A later run only adds the genuinely new days.
    const third = await processDueRecurringTransactions(asDb(), "2026-10-05");
    assert.equal(third.incomeGenerated, 2);
    assert.equal((await incomeRows()).length, 5);
  });

  it("back-dating a recurring record cannot duplicate already-generated dates", async () => {
    await createRecurringTransaction(asDb(), {
      type: "income",
      amount: 10000,
      description: "Daily gig",
      frequency: "daily",
      next_occurrence: "2026-10-01",
    });
    await processDueRecurringTransactions(asDb(), "2026-10-02");
    assert.equal((await incomeRows()).length, 2);

    await updateRecurringTransaction(asDb(), 1, {
      next_occurrence: "2026-10-01",
    });
    await processDueRecurringTransactions(asDb(), "2026-10-02");
    assert.equal((await incomeRows()).length, 2);
  });

  it("generates weekly expenses with the chosen category", async () => {
    const categoryId = await insertCategory("Internet");
    await createRecurringTransaction(asDb(), {
      type: "expense",
      amount: 15000,
      description: "Internet subscription",
      category_id: categoryId,
      frequency: "weekly",
      next_occurrence: "2026-10-01",
    });
    const summary = await processDueRecurringTransactions(asDb(), "2026-10-22");
    assert.equal(summary.expensesGenerated, 4);
    const rows = await expenseRows();
    assert.deepEqual(
      rows.map((r) => String(r.date)),
      [
        "2026-10-01 12:00:00",
        "2026-10-08 12:00:00",
        "2026-10-15 12:00:00",
        "2026-10-22 12:00:00",
      ]
    );
    assert.equal(Number(rows[0].category_id), categoryId);
  });

  it("auto-deactivates a monthly record once past its end date", async () => {
    await createRecurringTransaction(asDb(), {
      type: "expense",
      amount: 200000,
      description: "Rent",
      category_id: await insertCategory("Housing"),
      frequency: "monthly",
      next_occurrence: "2026-01-31",
      end_date: "2026-03-31",
    });

    const summary = await processDueRecurringTransactions(asDb(), "2026-04-30");
    assert.equal(summary.expensesGenerated, 3);
    assert.equal(summary.recordsDeactivated, 1);

    const record = await getRecurringById(asDb(), 1);
    assert.equal(record?.is_active, 0);

    const again = await processDueRecurringTransactions(asDb(), "2026-12-31");
    assert.equal(again.expensesGenerated, 0);
    assert.equal((await expenseRows()).length, 3);
  });

  it("returns category details for the list screen", async () => {
    const categoryId = await insertCategory("Rent & Housing");
    await createRecurringTransaction(asDb(), {
      type: "expense",
      amount: 250000,
      description: "Rent",
      category_id: categoryId,
      frequency: "monthly",
      next_occurrence: "2026-01-01",
    });
    const list = await getAllRecurringTransactions(asDb());
    assert.equal(list.length, 1);
    assert.equal(list[0].category_name, "Rent & Housing");
    assert.ok(list[0].category_color);
  });
});

describe("editing", () => {
  it("applies edited amount and schedule to future occurrences only", async () => {
    await createRecurringTransaction(asDb(), {
      type: "income",
      amount: 10000,
      description: "Chores",
      frequency: "monthly",
      next_occurrence: "2026-01-15",
    });
    await processDueRecurringTransactions(asDb(), "2026-02-15");

    await updateRecurringTransaction(asDb(), 1, {
      amount: 20000,
      description: "Chores (raised)",
      frequency: "weekly",
      next_occurrence: "2026-02-20",
    });

    const summary = await processDueRecurringTransactions(asDb(), "2026-02-27");
    assert.equal(summary.incomeGenerated, 2);

    const rows = await incomeRows();
    const january = rows.filter((r) => String(r.income_date).startsWith("2026-01"));
    const feb2026 = rows.filter((r) => String(r.income_date) === "2026-02-20" || String(r.income_date) === "2026-02-27");
    assert.equal(january.length, 1);
    // Existing occurrences keep the old amount.
    assert.equal(Number(january[0].amount), 10000);
    assert.equal(feb2026.length, 2);
    assert.ok(feb2026.every((r) => Number(r.amount) === 20000));
    assert.ok(feb2026.every((r) => String(r.source) === "Chores (raised)"));
  });

  it("clears the category when switching an expense to income and vice-versa", async () => {
    const categoryId = await insertCategory("Housing");
    await createRecurringTransaction(asDb(), {
      type: "expense",
      amount: 1000,
      description: "Rent",
      category_id: categoryId,
      frequency: "monthly",
      next_occurrence: "2026-01-01",
    });
    await updateRecurringTransaction(asDb(), 1, { type: "income" });
    assert.equal((await getRecurringById(asDb(), 1))?.category_id, null);

    await assert.rejects(
      updateRecurringTransaction(asDb(), 1, { type: "expense" }),
      /category is required/
    );
  });

  it("deletes a record and its generation ledger", async () => {
    await createRecurringTransaction(asDb(), {
      type: "income",
      amount: 1000,
      description: "Allowance",
      frequency: "weekly",
      next_occurrence: "2026-01-01",
    });
    await processDueRecurringTransactions(asDb(), "2026-02-01");
    assert.equal((await incomeRows()).length, 5);

    const deleted = await deleteRecurringTransaction(asDb(), 1);
    assert.equal(deleted, true);
    assert.equal(await getRecurringById(asDb(), 1), null);
    // Generated transactions remain part of the user's history.
    assert.equal((await incomeRows()).length, 5);
    // No orphaned ledger rows.
    const occurrences = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM recurring_occurrences"
    );
    assert.equal(occurrences?.count, 0);
  });
});

describe("disabling and restarting", () => {
  it("pauses generation while disabled and resumes without backfilling", async () => {
    const created = await createRecurringTransaction(asDb(), {
      type: "income",
      amount: 5000,
      description: "Pocket money",
      frequency: "weekly",
      next_occurrence: "2026-10-01",
    });
    await processDueRecurringTransactions(asDb(), "2026-10-08");
    assert.equal((await incomeRows()).length, 2);

    await setRecurringActive(asDb(), created.id, 0, "2026-12-31");
    const whilePaused = await processDueRecurringTransactions(asDb(), "2026-12-31");
    assert.equal(whilePaused.incomeGenerated, 0);
    assert.equal((await incomeRows()).length, 2);

    // Restarting skips the months that passed while paused.
    const resumed = await setRecurringActive(asDb(), created.id, 1, "2026-12-31");
    assert.equal(resumed?.is_active, 1);
    assert.equal(resumed?.next_occurrence, "2026-12-31");

    const afterResume = await processDueRecurringTransactions(asDb(), "2026-12-31");
    assert.equal(afterResume.incomeGenerated, 1);
    const rows = await incomeRows();
    assert.equal(rows.length, 3);
    assert.equal(String(rows[2].income_date), "2026-12-31");
  });

  it("stays paused when the schedule has already expired", async () => {
    const created = await createRecurringTransaction(asDb(), {
      type: "income",
      amount: 5000,
      description: "Bonus",
      frequency: "monthly",
      next_occurrence: "2026-01-01",
      end_date: "2026-03-01",
    });
    await processDueRecurringTransactions(asDb(), "2026-03-31");

    const resumed = await setRecurringActive(asDb(), created.id, 1, "2026-06-01");
    assert.equal(resumed?.is_active, 0);
  });
});

describe("offline operation", () => {
  it("runs the whole local flow with no external dependencies or clocks", async () => {
    const categoryId = await insertCategory("Electricity");
    await createRecurringTransaction(asDb(), {
      type: "expense",
      amount: 20000,
      description: "Electricity",
      category_id: categoryId,
      frequency: "monthly",
      next_occurrence: "2026-01-07",
    });
    await createRecurringTransaction(asDb(), {
      type: "income",
      amount: 500000,
      description: "Monthly salary",
      frequency: "monthly",
      next_occurrence: "2026-01-31",
    });

    const summary = await processDueRecurringTransactions(asDb(), "2026-05-06");
    assert.equal(summary.expensesGenerated, 4);
    assert.equal(summary.incomeGenerated, 4);

    const nowNextSalary = await getRecurringById(asDb(), 2);
    assert.equal(nowNextSalary?.next_occurrence, "2026-05-31");
  });
});