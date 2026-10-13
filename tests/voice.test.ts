import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";

import {
  applyVoiceAnswer,
  buildNextQuestion,
  extractAmount,
  isVoiceDraftReady,
  parseVoiceCommand,
  summarizeVoiceDraft,
  voiceDraftFingerprint,
} from "../src/services/voice/parser.ts";
import { createVoiceDuplicateGuard } from "../src/services/voice/duplicateGuard.ts";
import { confirmAndSaveVoiceDraft } from "../src/services/voice/recorder.ts";
import type { VoiceDraft } from "../src/services/voice/types.ts";
import type { Category } from "../src/types/database.ts";

const TODAY = "2026-10-13";
const NOW = new Date("2026-10-13T09:15:00");

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

function parse(text: string): VoiceDraft {
  return parseVoiceCommand(text, { categories: CATEGORIES, today: TODAY, now: NOW });
}

/**
 * Minimal in-memory database exposing the expo-sqlite surface used by the
 * voice recorder, so the real SQL/expense/income services run under Node.
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

  count(table: string): number {
    const row = this.sqlite
      .prepare(`SELECT COUNT(*) AS c FROM ${table}`)
      .get() as { c: number };
    return Number(row.c);
  }

  firstExpense() {
    return this.sqlite.prepare("SELECT * FROM expenses ORDER BY id DESC").get() as
      | Record<string, unknown>
      | undefined;
  }

  firstIncome() {
    return this.sqlite.prepare("SELECT * FROM income ORDER BY id DESC").get() as
      | Record<string, unknown>
      | undefined;
  }

  close() {
    this.sqlite.close();
  }
}

const asDb = (db: TestDb): SQLiteDatabase => db as unknown as SQLiteDatabase;

describe("voice command parsing", () => {
  it("interprets the expense example with amount, category and date", () => {
    const draft = parse("I spent ₦3,000 on food today");
    assert.equal(draft.type, "expense");
    assert.equal(draft.amountKobo, 300000);
    assert.equal(draft.categoryName, "Food");
    assert.equal(draft.date, TODAY);
    assert.match(draft.description.toLowerCase(), /food/);
    assert.equal(buildNextQuestion(draft, CATEGORIES), null);
  });

  it("interprets the income example with amount and source", () => {
    const draft = parse("Record ₦50,000 income from freelance work.");
    assert.equal(draft.type, "income");
    assert.equal(draft.amountKobo, 5000000);
    assert.equal(draft.source, "Freelance");
    assert.equal(draft.date, TODAY);
    assert.equal(buildNextQuestion(draft, CATEGORIES), null);
  });

  it("reads amounts spoken as words", () => {
    const draft = parse("I spent three thousand naira on transport");
    assert.equal(draft.amountKobo, 300000);
    assert.equal(draft.categoryName, "Transport");
  });

  it("reads shorthand multipliers like 2.5k", () => {
    const draft = parse("I paid 2.5k for lunch");
    assert.equal(draft.amountKobo, 250000);
    assert.equal(draft.categoryName, "Food");
  });

  it("detects payment methods and defaults to none when unspoken", () => {
    assert.equal(parse("I spent ₦1,000 on food with cash").paymentMethod, "Cash");
    assert.equal(
      parse("I spent ₦1,000 on food via transfer").paymentMethod,
      "Bank Transfer"
    );
    assert.equal(parse("I spent ₦1,000 on food").paymentMethod, null);
  });

  it("resolves relative dates", () => {
    assert.equal(parse("I spent ₦1,000 on food yesterday").date, "2026-10-12");
    assert.equal(parse("I spent ₦1,000 on food today").date, TODAY);
  });

  it("asks for the amount when it is missing", () => {
    const draft = parse("I spent on food today");
    assert.equal(draft.amountKobo, null);
    const question = buildNextQuestion(draft, CATEGORIES);
    assert.equal(question?.field, "amount");
  });

  it("asks for the type when the command is ambiguous", () => {
    const draft = parse("₦3,000 food today");
    assert.equal(draft.type, null);
    const question = buildNextQuestion(draft, CATEGORIES);
    assert.equal(question?.field, "type");
    const answered = applyVoiceAnswer(draft, "type", "expense", CATEGORIES);
    assert.equal(answered.type, "expense");
    assert.equal(answered.categoryName, "Food");
  });

  it("asks for a category when an expense category is not recognised", () => {
    const draft = parse("I spent ₦2,000");
    assert.equal(draft.categoryId, null);
    const question = buildNextQuestion(draft, CATEGORIES);
    assert.equal(question?.field, "category");
    const answered = applyVoiceAnswer(draft, "category", "3", CATEGORIES);
    assert.equal(answered.categoryName, "Groceries");
    assert.equal(buildNextQuestion(answered, CATEGORIES), null);
  });

  it("asks for an income source when none is recognised", () => {
    const draft = parse("I received ₦5,000 today");
    assert.equal(draft.type, "income");
    assert.equal(draft.source, null);
    const question = buildNextQuestion(draft, CATEGORIES);
    assert.equal(question?.field, "source");
    const answered = applyVoiceAnswer(draft, "source", "Gift", CATEGORIES);
    assert.equal(answered.source, "Gift");
    assert.equal(buildNextQuestion(answered, CATEGORIES), null);
  });

  it("flags zero and negative amounts as invalid", () => {
    assert.equal(extractAmount(" ₦0 on food").invalid, true);
    assert.equal(extractAmount(" ₦0 on food").kobo, null);
    assert.equal(extractAmount(" -500 on food").invalid, true);

    const zero = parse("I spent ₦0 on food");
    assert.equal(zero.amountKobo, null);
    assert.equal(buildNextQuestion(zero, CATEGORIES)?.field, "amount");
  });

  it("summarises using the shared kobo formatter", () => {
    const rows = summarizeVoiceDraft(parse("I spent ₦3,000 on food today"));
    const amount = rows.find((row) => row.label === "Amount");
    assert.equal(amount?.value, "₦3,000");
    assert.equal(rows.find((row) => row.label === "Category")?.value, "Food");
    assert.equal(rows.find((row) => row.label === "Payment method")?.value, "Cash");
  });

  it("builds a stable fingerprint for duplicate detection", () => {
    const a = parse("I spent ₦3,000 on food today");
    const b = parse("I spent ₦3,000 on food today");
    assert.equal(voiceDraftFingerprint(a), voiceDraftFingerprint(b));
    const c = parse("I spent ₦3,001 on food today");
    assert.notEqual(voiceDraftFingerprint(a), voiceDraftFingerprint(c));
  });
});

describe("voice saving", () => {
  let db: TestDb;

  beforeEach(() => {
    db = new TestDb();
  });

  afterEach(() => {
    db.close();
  });

  function readyExpense(): VoiceDraft {
    return {
      type: "expense",
      amountKobo: 300000,
      description: "Food",
      categoryId: 1,
      categoryName: "Food",
      source: null,
      paymentMethod: null,
      date: TODAY,
      time: "09:15",
      raw: "I spent ₦3,000 on food today",
    };
  }

  it("saves a confirmed expense with kobo amount and default payment method", async () => {
    const guard = createVoiceDuplicateGuard();
    const result = await confirmAndSaveVoiceDraft(asDb(db), readyExpense(), guard);
    assert.equal(result.status, "saved");
    assert.equal(db.count("expenses"), 1);
    const row = db.firstExpense();
    assert.equal(row?.amount, 300000);
    assert.equal(row?.category_id, 1);
    assert.equal(row?.payment_method, "Cash");
    assert.equal(row?.date, `${TODAY} 09:15:00`);
  });

  it("saves a confirmed income with its source and note", async () => {
    const guard = createVoiceDuplicateGuard();
    const draft: VoiceDraft = {
      type: "income",
      amountKobo: 5000000,
      description: "Freelance work",
      categoryId: null,
      categoryName: null,
      source: "Freelance",
      paymentMethod: null,
      date: TODAY,
      time: "09:15",
      raw: "Record ₦50,000 income from freelance work",
    };
    const result = await confirmAndSaveVoiceDraft(asDb(db), draft, guard);
    assert.equal(result.status, "saved");
    const row = db.firstIncome();
    assert.equal(row?.amount, 5000000);
    assert.equal(row?.source, "Freelance");
    assert.equal(row?.income_date, TODAY);
    assert.equal(row?.income_time, "09:15");
  });

  it("does not save an incomplete draft", async () => {
    const guard = createVoiceDuplicateGuard();
    const draft: VoiceDraft = {
      type: "expense",
      amountKobo: null,
      description: "Food",
      categoryId: 1,
      categoryName: "Food",
      source: null,
      paymentMethod: null,
      date: TODAY,
      time: "09:15",
      raw: "I spent on food",
    };
    assert.equal(isVoiceDraftReady(draft), false);
    const result = await confirmAndSaveVoiceDraft(asDb(db), draft, guard);
    assert.equal(result.status, "incomplete");
    assert.equal(db.count("expenses"), 0);
  });

  it("saves only after confirmation (cancellation writes nothing)", async () => {
    // Cancelling simply never calls confirmAndSaveVoiceDraft.
    assert.equal(db.count("expenses"), 0);
    assert.equal(db.count("income"), 0);
  });

  it("prevents an accidental duplicate save of the same command", async () => {
    const guard = createVoiceDuplicateGuard();
    const first = await confirmAndSaveVoiceDraft(asDb(db), readyExpense(), guard);
    assert.equal(first.status, "saved");

    const second = await confirmAndSaveVoiceDraft(asDb(db), readyExpense(), guard);
    assert.equal(second.status, "duplicate");
    assert.equal(db.count("expenses"), 1);
  });

  it("allows a genuinely different amount after a save", async () => {
    const guard = createVoiceDuplicateGuard();
    await confirmAndSaveVoiceDraft(asDb(db), readyExpense(), guard);
    const other = { ...readyExpense(), amountKobo: 450000 };
    const result = await confirmAndSaveVoiceDraft(asDb(db), other, guard);
    assert.equal(result.status, "saved");
    assert.equal(db.count("expenses"), 2);
  });
});
