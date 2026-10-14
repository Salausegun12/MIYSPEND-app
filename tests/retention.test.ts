import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SQLiteDatabase } from "expo-sqlite";

import { addExpense, getExpenseById, getTotalExpenses, getExpenseAttachments, getExpiredAttachments, clearExpiredAttachmentReferences, countExpensesWithAttachmentUri } from "../src/database/expenses.ts";
import { addCategory } from "../src/database/categories.ts";
import {
  collectExpiredUris,
  isOutsideRetention,
  retentionCutoff,
  runPhotoRetention,
} from "../src/services/retention/service.ts";
import {
  createInMemoryAttachmentStore,
  registerAttachmentStore,
  resetAttachmentStore,
} from "../src/services/attachments/store.ts";
import type { AttachmentStore } from "../src/services/attachments/types.ts";
import { deleteExpenseWithPhoto } from "../src/services/retention/deleteExpense.ts";
import { galleryWindowStart } from "../src/services/gallery/service.ts";
import { createInMemoryAttachmentExistence } from "../src/services/gallery/existence.ts";
import { buildExpenseGallery } from "../src/services/gallery/service.ts";
import { createSpendingReportHtml } from "../src/utils/reportExport.ts";
import { getReportPeriods } from "../src/utils/reportPeriods.ts";
import type { ExpenseWithCategory, Income } from "../src/types/database.ts";

const NOW = new Date("2026-09-14T09:00:00");

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
    attachment_uri TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );
`;

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

function withDb(): { d: SQLiteDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "miyspend-retention-test-"));
  const db = new TestDb(join(dir, "retention.db"));
  return {
    d: db as unknown as SQLiteDatabase,
    cleanup: () => {
      try {
        db.close();
      } catch {
        /* already closed */
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function seedCategory(d: SQLiteDatabase): Promise<void> {
  await d.runAsync(
    "INSERT INTO categories (name, icon, color, sort_order) VALUES ('Food', '🍔', '#F59E0B', 1)"
  );
}

interface SeedExpense {
  date: string;
  amount?: number;
  attachment_uri?: string | null;
  description?: string;
  note?: string;
}

async function seedExpenses(d: SQLiteDatabase, rows: SeedExpense[]): Promise<void> {
  for (const row of rows) {
    await addExpense(d, {
      amount: row.amount ?? 1000,
      category_id: 1,
      description: row.description ?? "Receipt",
      payment_method: "Cash",
      note: row.note ?? "",
      date: row.date,
      attachment_uri: row.attachment_uri,
    });
  }
}

function retentionDeps(
  d: SQLiteDatabase,
  store: AttachmentStore
): Parameters<typeof runPhotoRetention>[0] {
  return {
    listExpiredAttachments: (before) => getExpiredAttachments(d, before),
    clearExpiredReferences: (before) => clearExpiredAttachmentReferences(d, before),
    countReferences: (uri) => countExpensesWithAttachmentUri(d, uri),
    store,
  };
}

/** Copies a source photo into the store and returns its durable URI. */
async function persistStoredPhoto(store: AttachmentStore): Promise<string> {
  return store.persist({
    uri: "file:///tmp/source.jpg",
    fileName: "source.jpg",
    mimeType: "image/jpeg",
  });
}

afterEach(() => {
  resetAttachmentStore();
});

describe("retention window", () => {
  it("uses the same cutoff as the gallery window", () => {
    assert.equal(retentionCutoff(NOW), galleryWindowStart(NOW));
  });

  it("treats everything in the gallery window as kept", () => {
    assert.equal(isOutsideRetention(galleryWindowStart(NOW), NOW), false);
    assert.equal(isOutsideRetention("2026-09-14", NOW), false);
    assert.equal(isOutsideRetention("2099-01-01", NOW), false);
  });

  it("treats the day before the window as expired", () => {
    // galleryWindowStart(now) is the first kept day; the day before is expired.
    assert.equal(isOutsideRetention("2026-08-17", NOW), true);
    assert.equal(isOutsideRetention("2026-08-18", NOW), false);
  });

  it("collects unique non-empty URIs only", () => {
    const records = [
      { id: 1, attachment_uri: "memory://attachments/a" },
      { id: 2, attachment_uri: "memory://attachments/a" },
      { id: 3, attachment_uri: "memory://attachments/b" },
      { id: 4, attachment_uri: "" },
      { id: 5, attachment_uri: "memory://attachments/b" },
    ];
    assert.deepEqual(collectExpiredUris(records), [
      "memory://attachments/a",
      "memory://attachments/b",
    ]);
  });
});

describe("runPhotoRetention", () => {
  it("removes expired photos, clears their links and keeps the transactions", async () => {
    const { d, cleanup } = withDb();
    const store = createInMemoryAttachmentStore();
    try {
      await seedCategory(d);
      const oldUri = await persistStoredPhoto(store);
      const boundaryUri = await persistStoredPhoto(store);
      const freshUri = await persistStoredPhoto(store);
      await seedExpenses(d, [
        { date: "2026-08-01 09:00:00", amount: 50000, attachment_uri: oldUri },
        { date: "2026-08-18 09:00:00", amount: 20000, attachment_uri: boundaryUri },
        { date: "2026-09-10 09:00:00", amount: 30000, attachment_uri: freshUri },
        { date: "2026-08-01 09:00:00", amount: 70000, attachment_uri: null },
      ]);

      const totalBefore = await getTotalExpenses(d);
      const summary = await runPhotoRetention(retentionDeps(d, store), NOW);

      assert.deepEqual(summary, {
        checked: 1,
        refsCleared: 1,
        filesRemoved: 1,
        filesFailed: 0,
        filesKept: 0,
      });

      const old = await getExpenseById(d, 1);
      assert.equal(old?.attachment_uri, null);
      assert.equal(old?.amount, 50000);

      const boundary = await getExpenseById(d, 2);
      assert.equal(boundary?.attachment_uri, boundaryUri);
      const fresh = await getExpenseById(d, 3);
      assert.equal(fresh?.attachment_uri, freshUri);

      assert.equal(store.has(oldUri), false);
      assert.equal(store.has(boundaryUri), true);
      assert.equal(store.has(freshUri), true);

      assert.equal((d as unknown as TestDb).count("expenses"), 4);
      assert.equal(await getTotalExpenses(d), totalBefore);
    } finally {
      cleanup();
    }
  });

  it("keeps the file when another expense still references it", async () => {
    const { d, cleanup } = withDb();
    const store = createInMemoryAttachmentStore();
    try {
      await seedCategory(d);
      const shared = await persistStoredPhoto(store);
      await seedExpenses(d, [
        { date: "2026-08-01 09:00:00", amount: 10000, attachment_uri: shared },
        { date: "2026-09-10 09:00:00", amount: 20000, attachment_uri: shared },
      ]);

      const summary = await runPhotoRetention(retentionDeps(d, store), NOW);

      assert.equal(summary.filesRemoved, 0);
      assert.equal(summary.filesKept, 1);
      assert.equal(store.has(shared), true);
      assert.equal((await getExpenseById(d, 1))?.attachment_uri, null);
      assert.equal((await getExpenseById(d, 2))?.attachment_uri, shared);
    } finally {
      cleanup();
    }
  });

  it("never deletes files the store does not own", async () => {
    const { d, cleanup } = withDb();
    const store = createInMemoryAttachmentStore();
    try {
      await seedCategory(d);
      await seedExpenses(d, [
        { date: "2026-08-01 09:00:00", amount: 10000, attachment_uri: "file:///sdcard/DCIM/photo.jpg" },
      ]);

      const summary = await runPhotoRetention(retentionDeps(d, store), NOW);

      assert.equal(summary.filesKept, 1);
      assert.equal(summary.filesRemoved, 0);
      assert.equal((await getExpenseById(d, 1))?.attachment_uri, null);
    } finally {
      cleanup();
    }
  });

  it("is repeat-safe and never damages valid attachments", async () => {
    const { d, cleanup } = withDb();
    const store = createInMemoryAttachmentStore();
    try {
      await seedCategory(d);
      const oldUri = await persistStoredPhoto(store);
      const freshUri = await persistStoredPhoto(store);
      await seedExpenses(d, [
        { date: "2026-08-01 09:00:00", amount: 10000, attachment_uri: oldUri },
        { date: "2026-09-10 09:00:00", amount: 20000, attachment_uri: freshUri },
      ]);

      const first = await runPhotoRetention(retentionDeps(d, store), NOW);
      const second = await runPhotoRetention(retentionDeps(d, store), NOW);

      assert.equal(first.checked, 1);
      assert.equal(second.checked, 0);
      assert.equal(second.refsCleared, 0);
      assert.equal(second.filesRemoved, 0);
      assert.equal(store.has(freshUri), true);
      assert.equal((await getExpenseById(d, 2))?.attachment_uri, freshUri);
    } finally {
      cleanup();
    }
  });

  it("contains a failed file deletion without throwing", async () => {
    const { d, cleanup } = withDb();
    const store: AttachmentStore = {
      async persist() {
        return "";
      },
      async remove() {
        throw new Error("disk trouble");
      },
      owns(uri) {
        return uri === "memory://attachments/old";
      },
    };
    try {
      await seedCategory(d);
      await seedExpenses(d, [
        { date: "2026-08-01 09:00:00", amount: 10000, attachment_uri: "memory://attachments/old" },
      ]);

      const summary = await runPhotoRetention(retentionDeps(d, store), NOW);

      assert.equal(summary.filesFailed, 1);
      assert.equal(summary.filesRemoved, 0);
      assert.equal(summary.refsCleared, 1);
      assert.equal((await getExpenseById(d, 1))?.attachment_uri, null);
    } finally {
      cleanup();
    }
  });

  it("shrinks the gallery after retention: expired receipts disappear, live ones stay", async () => {
    const { d, cleanup } = withDb();
    const store = createInMemoryAttachmentStore();
    try {
      await seedCategory(d);
      const oldUri = await persistStoredPhoto(store);
      const freshUri = await persistStoredPhoto(store);
      await seedExpenses(d, [
        { date: "2026-08-01 09:00:00", amount: 10000, attachment_uri: oldUri },
        { date: "2026-09-10 09:00:00", amount: 20000, attachment_uri: freshUri },
      ]);

      const before = await buildExpenseGallery(
        await getExpenseAttachments(d, galleryWindowStart(NOW)),
        createInMemoryAttachmentExistence(store.uris),
        NOW
      );
      assert.deepEqual(
        before.map((p) => p.id),
        [2]
      );

      await runPhotoRetention(retentionDeps(d, store), NOW);

      const rows = await getExpenseAttachments(d, galleryWindowStart(NOW));
      const existence = createInMemoryAttachmentExistence(store.uris);
      const photos = await buildExpenseGallery(rows, existence, NOW);

      assert.deepEqual(
        photos.map((p) => p.id),
        [2]
      );
      assert.equal(existence.exists(oldUri), false);
    } finally {
      cleanup();
    }
  });

  it("uses the app's registered store when none is injected", async () => {
    const { d, cleanup } = withDb();
    const store = createInMemoryAttachmentStore();
    registerAttachmentStore(store);
    try {
      await seedCategory(d);
      const oldUri = await persistStoredPhoto(store);
      await seedExpenses(d, [
        { date: "2026-08-01 09:00:00", amount: 10000, attachment_uri: oldUri },
      ]);

      const deps = retentionDeps(d, store);
      deps.store = undefined;
      const summary = await runPhotoRetention(deps, NOW);

      assert.equal(summary.filesRemoved, 1);
      assert.equal(store.has(oldUri), false);
    } finally {
      cleanup();
    }
  });
});

describe("deleteExpenseWithPhoto", () => {
  it("deletes the expense and its unreferenced photo", async () => {
    const { d, cleanup } = withDb();
    const store = createInMemoryAttachmentStore();
    try {
      await seedCategory(d);
      const uri = await persistStoredPhoto(store);
      await seedExpenses(d, [
        { date: "2026-09-10 09:00:00", amount: 10000, attachment_uri: uri },
      ]);

      await deleteExpenseWithPhoto(d, 1, { store });

      assert.equal(await getExpenseById(d, 1), null);
      assert.equal(store.has(uri), false);
    } finally {
      cleanup();
    }
  });

  it("keeps a photo another expense still references", async () => {
    const { d, cleanup } = withDb();
    const store = createInMemoryAttachmentStore();
    try {
      await seedCategory(d);
      const shared = await persistStoredPhoto(store);
      await seedExpenses(d, [
        { date: "2026-09-01 09:00:00", amount: 10000, attachment_uri: shared },
        { date: "2026-09-10 09:00:00", amount: 20000, attachment_uri: shared },
      ]);

      await deleteExpenseWithPhoto(d, 1, { store });

      assert.equal(await getExpenseById(d, 1), null);
      assert.equal((await getExpenseById(d, 2))?.attachment_uri, shared);
      assert.equal(store.has(shared), true);
    } finally {
      cleanup();
    }
  });

  it("ignores photos it does not own", async () => {
    const { d, cleanup } = withDb();
    const store = createInMemoryAttachmentStore();
    try {
      await seedCategory(d);
      await seedExpenses(d, [
        { date: "2026-09-10 09:00:00", amount: 10000, attachment_uri: "file:///sdcard/friend.jpg" },
      ]);

      await deleteExpenseWithPhoto(d, 1, { store });

      assert.equal(await getExpenseById(d, 1), null);
    } finally {
      cleanup();
    }
  });

  it("handles expenses without a photo", async () => {
    const { d, cleanup } = withDb();
    const store = createInMemoryAttachmentStore();
    try {
      await seedCategory(d);
      await seedExpenses(d, [{ date: "2026-09-10 09:00:00", amount: 10000 }]);

      await deleteExpenseWithPhoto(d, 1, { store });

      assert.equal(await getExpenseById(d, 1), null);
    } finally {
      cleanup();
    }
  });
});

describe("report export purity (requirement 5)", () => {
  const period = getReportPeriods(new Date("2026-10-07T12:00:00"))[0];

  const photoExpense: ExpenseWithCategory = {
    id: 1,
    amount: 45000,
    category_id: 10,
    description: "Lunch",
    payment_method: "Cash",
    note: "with receipt",
    date: "2026-10-06 12:30:00",
    attachment_uri: "file:///data/user/0/com.miyspend/files/attachments/receipt-1752.jpg",
    created_at: "2026-10-06 12:31:00",
    updated_at: "2026-10-06 12:31:00",
    category_name: "Food",
    category_icon: "🍔",
    category_color: "#FF6B6B",
  };

  const income: Income = {
    id: 1,
    amount: 250000,
    source: "Salary",
    payment_method: "Bank transfer",
    note: "",
    income_date: "2026-10-05",
    income_time: "09:00:00",
    created_at: "2026-10-05 09:01:00",
    updated_at: "2026-10-05 09:01:00",
  };

  it("renders financial data only: no photo paths, no base64, no image markup", () => {
    const html = createSpendingReportHtml(
      period,
      [photoExpense],
      "2026-09-01",
      { incomes: [income], budgets: [], goals: [], contributionsTotal: 0, contributionsCount: 0 },
      new Date("2026-10-07T12:00:00")
    );

    assert.equal(html.includes("file:///"), false);
    assert.equal(html.includes("attachments"), false);
    assert.equal(html.includes(".jpg"), false);
    assert.equal(html.includes("base64"), false);
    assert.equal(html.includes("<img"), false);
    assert.equal(html.includes("attachment_uri"), false);

    assert.match(html, /Lunch/);
    assert.match(html, /NGN 450\.00/);
    assert.match(html, /with receipt/);
  });
});