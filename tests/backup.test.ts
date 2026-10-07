import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  buildBackupPayload,
  countBackupCollections,
  parseBackupJson,
  restoreBackup,
  validateBackupPayload,
  BackupError,
} from "../src/database/backup.ts";
import type { MiySpendBackup } from "../src/types/database.ts";

const SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '📦',
    color TEXT NOT NULL DEFAULT '#006B5B',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE expenses (
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
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
  CREATE TABLE income (
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
  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE TABLE budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL UNIQUE,
    limit_amount INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );
  CREATE TABLE savings_goals (
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
  CREATE TABLE contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    date TEXT NOT NULL DEFAULT (date('now')),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (typeof(amount) = 'integer' AND amount > 0),
    FOREIGN KEY (goal_id) REFERENCES savings_goals(id) ON DELETE CASCADE
  );
  CREATE TABLE recurring_transactions (
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
  CREATE TABLE recurring_occurrences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recurring_id INTEGER NOT NULL,
    occurrence_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (recurring_id, occurrence_date),
    FOREIGN KEY (recurring_id) REFERENCES recurring_transactions(id) ON DELETE CASCADE
  );
`;

class TestDb {
  private sqlite: DatabaseSync;

  constructor(path?: string) {
    this.sqlite = new DatabaseSync(path ?? ":memory:");
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

/** Enables a "fresh device" or "app restart" scenario on a real file. */
function fileDb(): { db: TestDb; dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "miyspend-backup-test-"));
  const path = join(dir, "miyspend.db");
  return { db: new TestDb(path), dir, path };
}

interface Seeds {
  category1: number;
  category2: number;
  goal1: number;
  recurring1: number;
}

async function seed() {
  const run = (sql: string, ...params: Array<string | number | null>) =>
    db.runAsync(sql, ...params);

  const c1 = await run(
    "INSERT INTO categories (name, icon, color, sort_order, created_at) VALUES ('Food', '🍔', '#F59E0B', 1, '2026-01-01 08:00:00')"
  );
  const c2 = await run(
    "INSERT INTO categories (name, icon, color, sort_order, created_at) VALUES ('Transport', '🚌', '#3B82F6', 2, '2026-01-01 08:00:00')"
  );
  const category1 = c1.lastInsertRowId;
  const category2 = c2.lastInsertRowId;

  await run(
    `INSERT INTO expenses (amount, category_id, description, payment_method, note, date, created_at, updated_at)
     VALUES (150000, ?, 'Lunch at work', 'POS', '', '2026-09-01 12:00:00', '2026-09-01 12:00:00', '2026-09-01 12:00:00')`,
    category1
  );
  await run(
    `INSERT INTO expenses (amount, category_id, description, payment_method, note, date, created_at, updated_at)
     VALUES (1200000, ?, 'Fuel', 'Cash', 'full tank', '2026-09-02', '2026-09-02 08:00:00', '2026-09-02 08:00:00')`,
    category2
  );

  await run(
    `INSERT INTO income (amount, source, payment_method, note, income_date, income_time, created_at, updated_at)
     VALUES (5000000, 'Salary', 'Bank Transfer', '', '2026-09-01', '09:00:00', '2026-09-01 09:00:00', '2026-09-01 09:00:00')`
  );

  await run(
    "INSERT INTO settings (key, value) VALUES ('currency', '₦')"
  );
  await run(
    "INSERT INTO settings (key, value) VALUES ('reminder_time', '20:00')"
  );
  await run("INSERT INTO settings (key, value) VALUES ('skin', '')");

  await run(
    `INSERT INTO budgets (category_id, limit_amount, created_at, updated_at)
     VALUES (?, 500000, '2026-01-01 08:00:00', '2026-01-01 08:00:00')`,
    category1
  );

  const goal = await run(
    `INSERT INTO savings_goals (name, target_amount, current_amount, target_date, note, created_at, updated_at)
     VALUES ('Emergency fund', 2000000, 600000, '2027-01-01', 'cushion', '2026-01-01 08:00:00', '2026-01-01 08:00:00')`
  );
  const goal1 = goal.lastInsertRowId;
  await run(
    `INSERT INTO contributions (goal_id, amount, date, note, created_at)
     VALUES (?, 600000, '2026-09-10', 'first deposit', '2026-09-10 12:00:00')`,
    goal1
  );

  const recurring = await run(
    `INSERT INTO recurring_transactions (type, amount, description, category_id, payment_method, frequency, next_occurrence, anchor_day, end_date, is_active, created_at, updated_at)
     VALUES ('expense', 70000, 'Rent', ?, '', 'monthly', '2026-10-01', 1, NULL, 1, '2026-01-01 08:00:00', '2026-01-01 08:00:00')`,
    category2
  );
  const recurring1 = recurring.lastInsertRowId;
  await run(
    `INSERT INTO recurring_occurrences (recurring_id, occurrence_date, created_at)
     VALUES (?, '2026-09-01', '2026-09-01 08:00:00')`,
    recurring1
  );

  return { category1, category2, goal1, recurring1 } satisfies Seeds;
}

function tableCounts(): Record<string, number> {
  const tables = [
    "categories",
    "expenses",
    "income",
    "settings",
    "budgets",
    "savings_goals",
    "contributions",
    "recurring_transactions",
    "recurring_occurrences",
  ];
  const counts: Record<string, number> = {};
  for (const t of tables) counts[t] = db.countRows(t);
  return counts;
}

async function dumpAll(target: TestDb) {
  return {
    categories: await target.getAllAsync(
      "SELECT * FROM categories ORDER BY id"
    ),
    expenses: await target.getAllAsync("SELECT * FROM expenses ORDER BY id"),
    income: await target.getAllAsync("SELECT * FROM income ORDER BY id"),
    settings: await target.getAllAsync("SELECT * FROM settings ORDER BY key"),
    budgets: await target.getAllAsync("SELECT * FROM budgets ORDER BY id"),
    savings_goals: await target.getAllAsync(
      "SELECT * FROM savings_goals ORDER BY id"
    ),
    contributions: await target.getAllAsync(
      "SELECT * FROM contributions ORDER BY id"
    ),
    recurring_transactions: await target.getAllAsync(
      "SELECT * FROM recurring_transactions ORDER BY id"
    ),
    recurring_occurrences: await target.getAllAsync(
      "SELECT * FROM recurring_occurrences ORDER BY id"
    ),
  };
}

async function wipeAll(target: TestDb) {
  for (const t of [
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
    await target.runAsync(`DELETE FROM ${t}`);
  }
}

/** The seeded data as a fully valid in-memory backup payload. */
async function validPayload(): Promise<MiySpendBackup> {
  const payload = await buildBackupPayload(asDb());
  assert.equal(validateBackupPayload(payload).ok, true);
  return payload;
}

describe("buildBackupPayload", () => {
  it("captures every collection with verbatim integer-kobo amounts", async () => {
    await seed();
    const payload = await buildBackupPayload(asDb());

    assert.equal(payload.format, BACKUP_FORMAT);
    assert.equal(payload.version, BACKUP_FORMAT_VERSION);
    assert.equal(payload.app, "miyspend");
    assert.ok(payload.exportedAt.length > 0);

    assert.equal(payload.collections.categories.length, 2);
    assert.equal(payload.collections.expenses.length, 2);
    assert.equal(payload.collections.income.length, 1);
    assert.equal(payload.collections.settings.length, 3);
    assert.equal(payload.collections.budgets.length, 1);
    assert.equal(payload.collections.savingsGoals.length, 1);
    assert.equal(payload.collections.contributions.length, 1);
    assert.equal(payload.collections.recurringTransactions.length, 1);
    assert.equal(payload.collections.recurringOccurrences.length, 1);

    assert.equal(payload.collections.expenses[0].amount, 150000);
    assert.equal(payload.collections.income[0].amount, 5000000);
    assert.equal(payload.collections.budgets[0].limit_amount, 500000);
    assert.equal(payload.collections.savingsGoals[0].target_amount, 2000000);
    assert.equal(payload.collections.savingsGoals[0].current_amount, 600000);
    assert.equal(payload.collections.contributions[0].amount, 600000);
    assert.equal(payload.collections.recurringTransactions[0].amount, 70000);
    for (const field of ["amount"]) {
      for (const tx of [
        ...payload.collections.expenses,
        ...payload.collections.income,
        ...payload.collections.contributions,
        ...payload.collections.recurringTransactions,
      ]) {
        assert.equal(Number.isInteger(tx[field as keyof typeof tx]), true);
      }
    }
  });

  it("is deterministic across runs", async () => {
    await seed();
    const first = await buildBackupPayload(asDb());
    const second = await buildBackupPayload(asDb());
    assert.deepEqual(first.collections, second.collections);
  });
});

describe("backup / delete / restore roundtrip", () => {
  it("restores an identical database after everything is deleted", async () => {
    await seed();
    const before = await dumpAll(db);
    const payload = await buildBackupPayload(asDb());

    await wipeAll(db);
    assert.deepEqual(tableCounts(), {
      categories: 0,
      expenses: 0,
      income: 0,
      settings: 0,
      budgets: 0,
      savings_goals: 0,
      contributions: 0,
      recurring_transactions: 0,
      recurring_occurrences: 0,
    });

    const counts = await restoreBackup(asDb(), payload);
    assert.deepEqual(counts, {
      categories: 2,
      expenses: 2,
      income: 1,
      settings: 3,
      budgets: 1,
      savingsGoals: 1,
      contributions: 1,
      recurringTransactions: 1,
      recurringOccurrences: 1,
    });

    assert.deepEqual(await dumpAll(db), before);
    assert.deepEqual(await dumpAll(db), await dumpAll(db)); // stable after second read

    // Integer kobo amounts are preserved exactly.
    const restoredExpense = await db.getFirstAsync<{ amount: number }>(
      "SELECT amount FROM expenses ORDER BY id LIMIT 1"
    );
    assert.equal(restoredExpense?.amount, 150000);
    assert.equal(Number.isInteger(restoredExpense?.amount), true);
  });

  it("restores from a JSON file into a fresh device (restart/offline)", async () => {
    await seed();
    const backup = await buildBackupPayload(asDb());
    const json = JSON.stringify(backup, null, 2);
    const original = await dumpAll(db);

    const fresh = fileDb();
    try {
      // A fresh app copy knows nothing about the original database.
      writeFileSync(join(fresh.dir, "miyspend-backup.json"), json);
      const text = readFileSync(join(fresh.dir, "miyspend-backup.json"), "utf8");
      const parsed = parseBackupJson(text);
      assert.equal(parsed.ok, true);

      const counts = await restoreBackup(fresh.db as unknown as SQLiteDatabase, parsed.ok ? parsed.payload : null);
      assert.equal(counts.expenses, 2);
      assert.deepEqual(await dumpAll(fresh.db), original);
    } finally {
      fresh.db.close();
      rmSync(fresh.dir, { recursive: true, force: true });
    }
  });

  it("countBackupCollections summarises a backup for the warning screen", async () => {
    await seed();
    const payload = await buildBackupPayload(asDb());
    assert.deepEqual(countBackupCollections(payload), {
      categories: 2,
      expenses: 2,
      income: 1,
      settings: 3,
      budgets: 1,
      savingsGoals: 1,
      contributions: 1,
      recurringTransactions: 1,
      recurringOccurrences: 1,
    });
  });
});

describe("validateBackupPayload", () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ["null", null, /valid object/],
    ["a number", 42, /valid object/],
    ["a string", "miyspend-backup", /valid object/],
    ["an array", [], /valid object/],
    ["wrong format marker", { format: "other" }, /not a MiySpend backup/],
    ["wrong app", { format: BACKUP_FORMAT, app: "wallet" }, /not created by MiySpend/],
    [
      "unsupported version",
      { format: BACKUP_FORMAT, app: "miyspend", version: 99, exportedAt: "x", collections: {} },
      /supports version 1/,
    ],
    [
      "string version",
      { format: BACKUP_FORMAT, app: "miyspend", version: String(BACKUP_FORMAT_VERSION), exportedAt: "x", collections: {} },
      /version is corrupted/,
    ],
    [
      "missing collections",
      { format: BACKUP_FORMAT, app: "miyspend", version: 1, exportedAt: "x" },
      /no data/,
    ],
  ];

  for (const [name, value, pattern] of cases) {
    it(`rejects: ${name}`, () => {
      const result = validateBackupPayload(value);
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.error, pattern);
    });
  }

  it("rejects a non-list collection", async () => {
    await seed();
    const payload = await validPayload();
    const broken = structuredClone(payload);
    (broken as { collections: { categories: unknown } }).collections.categories =
      "nope";
    const result = validateBackupPayload(broken);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /categories/);
  });

  it("rejects float and negative expense amounts", async () => {
    await seed();
    const payload = await validPayload();
    const broken = structuredClone(payload);
    const expenses = (broken as { collections: { expenses: Array<{ amount: number }> } }).collections.expenses;
    expenses[0].amount = 1500.5;
    assert.equal(validateBackupPayload(broken).ok, false);

    const negative = structuredClone(payload);
    (negative as { collections: { expenses: Array<{ amount: number }> } }).collections.expenses[1].amount = -50;
    assert.equal(validateBackupPayload(negative).ok, false);
  });

  it("rejects a zero recurring amount (schema CHECK would fail)", async () => {
    await seed();
    const payload = await validPayload();
    const broken = structuredClone(payload);
    (broken as { collections: { recurringTransactions: Array<{ amount: number }> } }).collections.recurringTransactions[0].amount = 0;
    const result = validateBackupPayload(broken);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /amount/);
  });

  it("rejects rows whose foreign keys do not exist in the backup", async () => {
    await seed();
    const payload = await validPayload();

    const noCategory = structuredClone(payload);
    (noCategory as { collections: { expenses: Array<{ category_id: number }> } }).collections.expenses[0].category_id = 999;
    assert.equal(validateBackupPayload(noCategory).ok, false);

    const noGoal = structuredClone(payload);
    (noGoal as { collections: { contributions: Array<{ goal_id: number }> } }).collections.contributions[0].goal_id = 999;
    assert.equal(validateBackupPayload(noGoal).ok, false);

    const noRecurring = structuredClone(payload);
    (noRecurring as { collections: { recurringOccurrences: Array<{ recurring_id: number }> } }).collections.recurringOccurrences[0].recurring_id = 999;
    assert.equal(validateBackupPayload(noRecurring).ok, false);
  });

  it("rejects duplicate ids within a collection", async () => {
    await seed();
    const payload = await validPayload();
    const broken = structuredClone(payload);
    (broken as { collections: { expenses: Array<{ id: number }> } }).collections.expenses[1].id =
      (broken as { collections: { expenses: Array<{ id: number }> } }).collections.expenses[0].id;
    const result = validateBackupPayload(broken);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /duplicate/);
  });

  it("rejects a second budget for the same category", async () => {
    await seed();
    const payload = await validPayload();
    const broken = structuredClone(payload);
    const budgets = (broken as { collections: { budgets: Array<{ id: number; category_id: number; limit_amount: number; created_at: string; updated_at: string }> } }).collections.budgets;
    budgets.push({ ...budgets[0], id: 999 });
    const result = validateBackupPayload(broken);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /duplicates/);
  });
});

describe("parseBackupJson", () => {
  it("rejects empty and corrupted JSON", () => {
    assert.equal(parseBackupJson("").ok, false);
    assert.equal(parseBackupJson("{oops").ok, false);
  });

  it("rejects well-formed JSON that is not a backup", () => {
    assert.equal(parseBackupJson('{"hello":"world"}').ok, false);
  });

  it("accepts a valid serialised backup", async () => {
    await seed();
    const payload = await validPayload();
    const parsed = parseBackupJson(JSON.stringify(payload));
    assert.equal(parsed.ok, true);
  });
});

describe("restoreBackup safety", () => {
  it("never writes before validation passes", async () => {
    await seed();
    const before = tableCounts();
    const bad = {
      format: "not-a-backup",
      version: 999,
    };
    await assert.rejects(
      () => restoreBackup(asDb(), bad),
      (error: unknown) =>
        error instanceof BackupError && error.code === "invalid-structure"
    );
    assert.deepEqual(tableCounts(), before);
  });

  it("rolls the whole database back when an insert fails mid-restore", async () => {
    await seed();
    const payload = await validPayload();
    const before = tableCounts();

    // Two occurrences for the same recurring record on the same date: passes
    // structural validation but violates the table's UNIQUE constraint, so the
    // restore must fail and leave every table untouched.
    const broken = structuredClone(payload);
    const occurrences = (broken as { collections: { recurringOccurrences: Array<{ id: number; recurring_id: number; occurrence_date: string; created_at: string }> } }).collections.recurringOccurrences;
    occurrences.push({ ...occurrences[0], id: 999, created_at: "2026-09-01 08:00:00" });

    const validation = validateBackupPayload(broken);
    assert.equal(validation.ok, true);

    await assert.rejects(
      () => restoreBackup(asDb(), broken),
      (error: unknown) =>
        error instanceof BackupError && error.code === "restore-failed"
    );
    assert.deepEqual(tableCounts(), before);
  });

  it("survives an offline restart with data on disk only", async () => {
    // Device A seeds data, writes a backup file, then "closes" (restart).
    const deviceA = fileDb();
    const backupJsonPath = join(deviceA.dir, "miyspend-backup.json");
    try {
      await deviceA.db.runAsync(
        "INSERT INTO categories (name) VALUES ('Food')"
      );
      await deviceA.db.runAsync(
        "INSERT INTO expenses (amount, category_id, description, date) VALUES (150000, 1, 'Lunch', '2026-09-01')"
      );
      const payload = await buildBackupPayload(
        deviceA.db as unknown as SQLiteDatabase
      );
      writeFileSync(backupJsonPath, JSON.stringify(payload, null, 2));
    } finally {
      deviceA.db.close();
    }

    // Device B (fresh install) restores from the saved file, fully offline.
    const deviceB = fileDb();
    try {
      const text = readFileSync(backupJsonPath, "utf8");
      const parsed = parseBackupJson(text);
      assert.equal(parsed.ok, true);
      assert.ok(parsed.ok);
      await restoreBackup(deviceB.db as unknown as SQLiteDatabase, parsed.payload);

      const amount = await deviceB.db.getFirstAsync<{ amount: number }>(
        "SELECT amount FROM expenses"
      );
      assert.equal(amount?.amount, 150000);
      assert.equal(Number.isInteger(amount?.amount), true);
    } finally {
      deviceB.db.close();
      rmSync(deviceA.dir, { recursive: true, force: true });
      rmSync(deviceB.dir, { recursive: true, force: true });
    }
  });
});