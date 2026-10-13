import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";

import { detectVoiceIntent } from "../src/services/voice/intent.ts";
import {
  applyBudgetAnswer,
  applyGoalAnswer,
  buildBudgetQuestion,
  buildGoalQuestion,
  budgetDraftFingerprint,
  confirmAndSaveBudgetDraft,
  confirmAndSaveGoalDraft,
  goalDraftFingerprint,
  isBudgetDraftReady,
  isGoalDraftReady,
  parseBudgetCommand,
  parseGoalCommand,
  summarizeBudgetDraft,
  summarizeGoalDraft,
} from "../src/services/voice/planning.ts";
import { createVoiceDuplicateGuard } from "../src/services/voice/duplicateGuard.ts";
import type {
  BudgetDraft,
  GoalDraft,
} from "../src/services/voice/types.ts";
import type { Category, SavingsGoal } from "../src/types/database.ts";

const CATEGORY_NAMES = [
  "Food",
  "Transport",
  "Groceries",
  "Airtime",
  "Data",
  "Electricity",
  "Housing",
  "Health",
  "Education",
  "Family",
  "Clothing",
  "Entertainment",
  "Business/Work",
  "Giving",
  "Other",
];

const CATEGORIES: Category[] = CATEGORY_NAMES.map((name, index) => ({
  id: index + 1,
  name,
  icon: "📦",
  color: "#006B5B",
  sort_order: index + 1,
  created_at: "2026-01-01 00:00:00",
}));

function goal(
  id: number,
  name: string,
  target: number
): SavingsGoal {
  return {
    id,
    name,
    target_amount: target,
    current_amount: 0,
    target_date: null,
    note: "",
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-01 00:00:00",
  };
}

/**
 * Minimal in-memory database exposing the expo-sqlite surface used by the
 * budget and savings-goal services, so the real SQL runs under Node.
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
      CREATE TABLE budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL UNIQUE,
        limit_amount INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE savings_goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        target_amount INTEGER NOT NULL,
        current_amount INTEGER NOT NULL DEFAULT 0,
        target_date TEXT,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE contributions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        date TEXT NOT NULL DEFAULT (date('now')),
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    for (const category of CATEGORIES) {
      this.sqlite
        .prepare(
          "INSERT INTO categories (id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)"
        )
        .run(
          category.id,
          category.name,
          category.icon,
          category.color,
          category.sort_order
        );
    }
  }

  async runAsync(sql: string, ...params: Array<string | number | null>) {
    const result = this.sqlite.prepare(sql).run(...params);
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: Number(result.changes),
    };
  }

  async getFirstAsync<T>(sql: string, ...params: Array<string | number | null>) {
    const row = this.sqlite.prepare(sql).get(...params);
    return row === undefined ? null : (row as T);
  }

  async getAllAsync<T>(sql: string, ...params: Array<string | number | null>) {
    return this.sqlite.prepare(sql).all(...params) as T[];
  }

  async execAsync(sql: string) {
    this.sqlite.exec(sql);
  }

  async withTransactionAsync(fn: () => Promise<void>) {
    await fn();
  }

  count(table: string): number {
    const row = this.sqlite
      .prepare(`SELECT COUNT(*) AS c FROM ${table}`)
      .get() as { c: number };
    return Number(row.c);
  }

  insertBudget(categoryId: number, limit: number): void {
    this.sqlite
      .prepare("INSERT INTO budgets (category_id, limit_amount) VALUES (?, ?)")
      .run(categoryId, limit);
  }

  insertGoal(name: string, target: number): void {
    this.sqlite
      .prepare("INSERT INTO savings_goals (name, target_amount) VALUES (?, ?)")
      .run(name, target);
  }

  firstBudget() {
    return this.sqlite
      .prepare("SELECT * FROM budgets ORDER BY id DESC")
      .get() as Record<string, unknown> | undefined;
  }

  goalByName(name: string) {
    return this.sqlite
      .prepare("SELECT * FROM savings_goals WHERE name = ?")
      .get(name) as Record<string, unknown> | undefined;
  }

  close() {
    this.sqlite.close();
  }
}

const asDb = (db: TestDb): SQLiteDatabase => db as unknown as SQLiteDatabase;

const NO_GOALS: SavingsGoal[] = [];

describe("voice intent detection", () => {
  it("classifies budget commands", () => {
    assert.equal(
      detectVoiceIntent("Set my monthly food budget to ₦40,000."),
      "budget"
    );
    assert.equal(detectVoiceIntent("Change the food spending limit"), "budget");
  });

  it("classifies savings-goal commands", () => {
    assert.equal(
      detectVoiceIntent("Create a savings goal of ₦200,000 for a laptop."),
      "goal"
    );
    assert.equal(
      detectVoiceIntent("Change my laptop savings target to ₦250,000."),
      "goal"
    );
  });

  it("falls back to a transaction for ordinary entries", () => {
    assert.equal(detectVoiceIntent("I spent ₦3,000 on food today"), "transaction");
    assert.equal(detectVoiceIntent("Record ₦50,000 income"), "transaction");
  });
});

describe("budget command parsing", () => {
  it("reads the example into a ready draft", () => {
    const draft = parseBudgetCommand("Set my monthly food budget to ₦40,000.", {
      categories: CATEGORIES,
    });
    assert.equal(draft.intent, "budget");
    assert.equal(draft.categoryName, "Food");
    assert.equal(draft.categoryId, 1);
    assert.equal(draft.amountKobo, 4_000_000);
    assert.equal(buildBudgetQuestion(draft, CATEGORIES), null);
  });

  it("reads shorthand multipliers", () => {
    const draft = parseBudgetCommand("Set a monthly transport budget of 20k", {
      categories: CATEGORIES,
    });
    assert.equal(draft.categoryName, "Transport");
    assert.equal(draft.amountKobo, 2_000_000);
  });

  it("asks for the amount when it is missing", () => {
    const draft = parseBudgetCommand("Set my food budget", {
      categories: CATEGORIES,
    });
    assert.equal(draft.amountKobo, null);
    const question = buildBudgetQuestion(draft, CATEGORIES);
    assert.equal(question?.field, "amount");
    assert.equal(question?.kind, "amount");

    const answered = applyBudgetAnswer(draft, "amount", "15000", CATEGORIES);
    assert.equal(answered.amountKobo, 1_500_000);
    assert.equal(isBudgetDraftReady(answered), true);
  });

  it("asks for the category when it is not recognised", () => {
    const draft = parseBudgetCommand("Set a monthly budget of ₦25,000", {
      categories: CATEGORIES,
    });
    assert.equal(draft.categoryId, null);
    const question = buildBudgetQuestion(draft, CATEGORIES);
    assert.equal(question?.field, "category");
    assert.equal(question?.kind, "choice");

    const answered = applyBudgetAnswer(draft, "category", "2", CATEGORIES);
    assert.equal(answered.categoryName, "Transport");
    assert.equal(buildBudgetQuestion(answered, CATEGORIES), null);
  });

  it("summarises create and update clearly using the kobo formatter", () => {
    const draft = parseBudgetCommand("Set my monthly food budget to ₦40,000.", {
      categories: CATEGORIES,
    });
    const fresh = summarizeBudgetDraft(draft);
    assert.equal(fresh.find((r) => r.label === "Category")?.value, "Food");
    assert.equal(fresh.find((r) => r.label === "Monthly limit")?.value, "₦40,000");
    assert.equal(fresh.find((r) => r.label === "Action")?.value, "New budget");

    const existing = summarizeBudgetDraft(draft, true);
    assert.equal(
      existing.find((r) => r.label === "Action")?.value,
      "Update existing budget"
    );
  });

  it("builds a stable fingerprint that changes with the limit", () => {
    const a = parseBudgetCommand("Set my food budget to 40k", {
      categories: CATEGORIES,
    });
    const b = parseBudgetCommand("Set food budget to 40,000", {
      categories: CATEGORIES,
    });
    assert.equal(budgetDraftFingerprint(a), budgetDraftFingerprint(b));
    const c = { ...a, amountKobo: 5_000_000 };
    assert.notEqual(budgetDraftFingerprint(a), budgetDraftFingerprint(c));
  });
});

describe("savings-goal command parsing", () => {
  it("extracts the name and amount when creating the example goal", () => {
    const draft = parseGoalCommand(
      "Create a savings goal of ₦200,000 for a laptop.",
      { goals: NO_GOALS }
    );
    assert.equal(draft.mode, "create");
    assert.equal(draft.goalName, "Laptop");
    assert.equal(draft.targetAmountKobo, 20_000_000);
    assert.equal(buildGoalQuestion(draft, NO_GOALS), null);
  });

  it("matches an existing goal when changing its target", () => {
    const draft = parseGoalCommand(
      "Change my laptop savings target to ₦250,000.",
      { goals: [goal(7, "Laptop", 20_000_000)] }
    );
    assert.equal(draft.mode, "update");
    assert.equal(draft.goalId, 7);
    assert.equal(draft.goalName, "Laptop");
    assert.equal(draft.targetAmountKobo, 25_000_000);
  });

  it("keeps the spoken name when the goal does not exist yet", () => {
    const draft = parseGoalCommand("Change my vacation savings target to 250k", {
      goals: [goal(1, "Laptop", 20_000_000)],
    });
    assert.equal(draft.mode, "update");
    assert.equal(draft.goalId, null);
    assert.equal(draft.goalName, "Vacation");
  });

  it("asks for a goal name when none is given", () => {
    const draft = parseGoalCommand("Create a savings goal of 100k", {
      goals: NO_GOALS,
    });
    assert.equal(draft.goalName, null);
    const question = buildGoalQuestion(draft, NO_GOALS);
    assert.equal(question?.field, "goalName");
    assert.equal(question?.kind, "text");

    const answered = applyGoalAnswer(draft, "goalName", "Vacation", NO_GOALS);
    assert.equal(answered.goalName, "Vacation");
    assert.equal(isGoalDraftReady(answered), true);
  });

  it("asks which goal to change when updating and none is named", () => {
    const draft = parseGoalCommand("Change my savings target to 250k", {
      goals: [goal(1, "Laptop", 20_000_000), goal(2, "Car", 500_000)],
    });
    const question = buildGoalQuestion(draft, [
      goal(1, "Laptop", 20_000_000),
      goal(2, "Car", 500_000),
    ]);
    assert.equal(question?.field, "goal");
    assert.equal(question?.kind, "choice");
    const answered = applyGoalAnswer(
      draft,
      "goal",
      "2",
      [goal(1, "Laptop", 20_000_000), goal(2, "Car", 500_000)]
    );
    assert.equal(answered.goalId, 2);
    assert.equal(answered.goalName, "Car");
  });

  it("asks for the target amount when it is missing", () => {
    const draft = parseGoalCommand("Create a savings goal for a laptop", {
      goals: NO_GOALS,
    });
    assert.equal(draft.goalName, "Laptop");
    assert.equal(draft.targetAmountKobo, null);
    assert.equal(buildGoalQuestion(draft, NO_GOALS)?.field, "amount");
  });

  it("summarises the goal with the shared kobo formatter", () => {
    const draft = parseGoalCommand(
      "Create a savings goal of ₦200,000 for a laptop.",
      { goals: NO_GOALS }
    );
    const rows = summarizeGoalDraft(draft);
    assert.equal(rows.find((r) => r.label === "Goal")?.value, "Laptop");
    assert.equal(rows.find((r) => r.label === "Target amount")?.value, "₦200,000");
    assert.equal(rows.find((r) => r.label === "Type")?.value, "New savings goal");
  });

  it("builds a stable goal fingerprint", () => {
    const a = parseGoalCommand("Change my laptop savings target to 250k", {
      goals: [goal(7, "Laptop", 20_000_000)],
    });
    const b = parseGoalCommand("change my Laptop savings target to ₦250,000", {
      goals: [goal(7, "Laptop", 20_000_000)],
    });
    assert.equal(goalDraftFingerprint(a), goalDraftFingerprint(b));
    const c = { ...a, targetAmountKobo: 30_000_000 };
    assert.notEqual(goalDraftFingerprint(a), goalDraftFingerprint(c));
  });
});

describe("budget saving", () => {
  let db: TestDb;

  beforeEach(() => {
    db = new TestDb();
  });

  afterEach(() => {
    db.close();
  });

  function foodBudget(amount = 4_000_000): BudgetDraft {
    return {
      intent: "budget",
      amountKobo: amount,
      categoryId: 1,
      categoryName: "Food",
      raw: "Set my monthly food budget to ₦40,000.",
    };
  }

  it("creates a new monthly budget for the category", async () => {
    const guard = createVoiceDuplicateGuard();
    const result = await confirmAndSaveBudgetDraft(asDb(db), foodBudget(), guard);
    assert.equal(result.status, "saved");
    assert.equal(result.updated, false);
    assert.equal(db.count("budgets"), 1);
    const row = db.firstBudget();
    assert.equal(row?.category_id, 1);
    assert.equal(row?.limit_amount, 4_000_000);
  });

  it("updates the limit when the category already has a budget", async () => {
    db.insertBudget(1, 1_000_000);
    const guard = createVoiceDuplicateGuard();
    const result = await confirmAndSaveBudgetDraft(asDb(db), foodBudget(), guard);
    assert.equal(result.status, "saved");
    assert.equal(result.updated, true);
    assert.equal(db.count("budgets"), 1);
    assert.equal(db.firstBudget()?.limit_amount, 4_000_000);
  });

  it("does not save an incomplete draft (nothing written before confirm)", async () => {
    const guard = createVoiceDuplicateGuard();
    const draft: BudgetDraft = { ...foodBudget(), amountKobo: null };
    const result = await confirmAndSaveBudgetDraft(asDb(db), draft, guard);
    assert.equal(result.status, "incomplete");
    assert.equal(db.count("budgets"), 0);
  });

  it("blocks an accidental duplicate save", async () => {
    const guard = createVoiceDuplicateGuard();
    await confirmAndSaveBudgetDraft(asDb(db), foodBudget(), guard);
    const second = await confirmAndSaveBudgetDraft(asDb(db), foodBudget(), guard);
    assert.equal(second.status, "duplicate");
    assert.equal(db.count("budgets"), 1);
  });

  it("allows a genuinely different limit after a save", async () => {
    const guard = createVoiceDuplicateGuard();
    await confirmAndSaveBudgetDraft(asDb(db), foodBudget(), guard);
    const result = await confirmAndSaveBudgetDraft(
      asDb(db),
      foodBudget(5_000_000),
      guard
    );
    assert.equal(result.status, "saved");
    assert.equal(db.count("budgets"), 1);
    assert.equal(db.firstBudget()?.limit_amount, 5_000_000);
  });
});

describe("savings-goal saving", () => {
  let db: TestDb;

  beforeEach(() => {
    db = new TestDb();
  });

  afterEach(() => {
    db.close();
  });

  function newLaptopGoal(): GoalDraft {
    return {
      intent: "goal",
      mode: "create",
      goalId: null,
      goalName: "Laptop",
      targetAmountKobo: 20_000_000,
      raw: "Create a savings goal of ₦200,000 for a laptop.",
    };
  }

  it("creates a new savings goal", async () => {
    const guard = createVoiceDuplicateGuard();
    const result = await confirmAndSaveGoalDraft(asDb(db), newLaptopGoal(), guard);
    assert.equal(result.status, "saved");
    assert.equal(result.updated, false);
    assert.equal(db.count("savings_goals"), 1);
    assert.equal(db.goalByName("Laptop")?.target_amount, 20_000_000);
  });

  it("updates an existing goal's target by id", async () => {
    db.insertGoal("Laptop", 20_000_000);
    const guard = createVoiceDuplicateGuard();
    const draft: GoalDraft = {
      intent: "goal",
      mode: "update",
      goalId: 1,
      goalName: "Laptop",
      targetAmountKobo: 25_000_000,
      raw: "Change my laptop savings target to ₦250,000.",
    };
    const result = await confirmAndSaveGoalDraft(asDb(db), draft, guard);
    assert.equal(result.status, "saved");
    assert.equal(result.updated, true);
    assert.equal(db.goalByName("Laptop")?.target_amount, 25_000_000);
    assert.equal(db.count("savings_goals"), 1);
  });

  it("updates by name when the id was not resolved", async () => {
    db.insertGoal("Laptop", 20_000_000);
    const guard = createVoiceDuplicateGuard();
    const draft: GoalDraft = {
      intent: "goal",
      mode: "update",
      goalId: null,
      goalName: "Laptop",
      targetAmountKobo: 25_000_000,
      raw: "Change my laptop savings target to ₦250,000.",
    };
    const result = await confirmAndSaveGoalDraft(asDb(db), draft, guard);
    assert.equal(result.status, "saved");
    assert.equal(db.goalByName("Laptop")?.target_amount, 25_000_000);
  });

  it("refuses to update a goal that does not exist", async () => {
    db.insertGoal("Laptop", 20_000_000);
    const guard = createVoiceDuplicateGuard();
    const draft: GoalDraft = {
      intent: "goal",
      mode: "update",
      goalId: null,
      goalName: "Vacation",
      targetAmountKobo: 25_000_000,
      raw: "Change my vacation savings target to 250k",
    };
    const result = await confirmAndSaveGoalDraft(asDb(db), draft, guard);
    assert.equal(result.status, "unknown_goal");
    assert.equal(db.count("savings_goals"), 1);
  });

  it("refuses to create a goal whose name already exists", async () => {
    db.insertGoal("Laptop", 20_000_000);
    const guard = createVoiceDuplicateGuard();
    const result = await confirmAndSaveGoalDraft(asDb(db), newLaptopGoal(), guard);
    assert.equal(result.status, "duplicate_goal");
    assert.equal(db.count("savings_goals"), 1);
  });

  it("does not save an incomplete draft (cancellation writes nothing)", async () => {
    const guard = createVoiceDuplicateGuard();
    const draft: GoalDraft = { ...newLaptopGoal(), goalName: null };
    const result = await confirmAndSaveGoalDraft(asDb(db), draft, guard);
    assert.equal(result.status, "incomplete");
    assert.equal(db.count("savings_goals"), 0);
  });

  it("blocks an accidental duplicate save", async () => {
    const guard = createVoiceDuplicateGuard();
    await confirmAndSaveGoalDraft(asDb(db), newLaptopGoal(), guard);
    const second = await confirmAndSaveGoalDraft(
      asDb(db),
      newLaptopGoal(),
      guard
    );
    assert.equal(second.status, "duplicate");
    assert.equal(db.count("savings_goals"), 1);
  });
});
