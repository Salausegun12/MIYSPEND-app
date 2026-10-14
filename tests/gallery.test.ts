import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SQLiteDatabase } from "expo-sqlite";

import {
  buildExpenseGallery,
  galleryWindowStart,
  isInsideGalleryWindow,
  galleryPreview,
  GALLERY_WINDOW_DAYS,
} from "../src/services/gallery/service.ts";
import {
  createInMemoryAttachmentExistence,
  getAttachmentExistence,
  registerAttachmentExistence,
  resetAttachmentExistence,
  unavailableAttachmentExistence,
} from "../src/services/gallery/existence.ts";
import type { ExpenseWithCategory } from "../src/types/database.ts";
import {
  addExpense,
  deleteExpense,
  getExpenseAttachments,
  getExpenseById,
} from "../src/database/expenses.ts";

// ----------------------------------------------------------- helpers

function mkExpense(partial: {
  id: number;
  date: string;
  attachment_uri: string | null;
  description?: string;
  amount?: number;
  category_name?: string;
  payment_method?: string;
  note?: string;
}): ExpenseWithCategory {
  return {
    id: partial.id,
    amount: partial.amount ?? 1000,
    category_id: 1,
    description: partial.description ?? "Receipt item",
    payment_method: partial.payment_method ?? "Cash",
    note: partial.note ?? "",
    date: partial.date,
    attachment_uri: partial.attachment_uri,
    created_at: "2026-09-01 10:00:00",
    updated_at: "2026-09-01 10:00:00",
    category_name: partial.category_name ?? "Food",
    category_icon: "🍔",
    category_color: "#F59E0B",
  } satisfies ExpenseWithCategory;
}

function inWindowExpense(id: number, date: string, uri: string): ExpenseWithCategory {
  return mkExpense({ id, date, attachment_uri: uri });
}

// ------------------------------------------------------------- window

describe("gallery window (28 rolling days)", () => {
  it("spans exactly 28 calendar days ending today", () => {
    assert.equal(GALLERY_WINDOW_DAYS, 28);
    const now = new Date(2026, 8, 15); // 15 Sep 2026
    // today (15th) minus 27 days => 19 Aug, i.e. 15,14,...19 = 28 days.
    assert.equal(galleryWindowStart(now), "2026-08-19");
  });

  it("crosses month boundaries correctly", () => {
    const now = new Date(2026, 2, 1); // 1 Mar 2026
    assert.equal(galleryWindowStart(now), "2026-02-02");
    assert.equal(isInsideGalleryWindow("2026-02-02", now), true);
    assert.equal(isInsideGalleryWindow("2026-02-01", now), false);
  });

  it("is inclusive on both ends", () => {
    const now = new Date(2026, 8, 15);
    assert.equal(isInsideGalleryWindow("2026-09-15", now), true); // today
    assert.equal(isInsideGalleryWindow("2026-08-19", now), true); // 27th day
    assert.equal(isInsideGalleryWindow("2026-08-18", now), false); // 28th day
    assert.equal(isInsideGalleryWindow("2026-09-20", now), true); // future
  });
});

// ---------------------------------------------------------- existence

describe("attachment existence registry", () => {
  afterEach(() => resetAttachmentExistence());

  it("defaults to the unavailable checker that assumes files are present", () => {
    assert.equal(getAttachmentExistence(), unavailableAttachmentExistence);
    assert.equal(unavailableAttachmentExistence.exists("file:///whatever.jpg"), true);
  });

  it("registers and restores the active checker", () => {
    const fake = createInMemoryAttachmentExistence(["file:///a.jpg"]);
    registerAttachmentExistence(fake);
    assert.equal(getAttachmentExistence(), fake);
    assert.equal(fake.exists("file:///a.jpg"), true);
    assert.equal(fake.exists("file:///b.jpg"), false);
    fake.register("file:///b.jpg");
    assert.equal(fake.exists("file:///b.jpg"), true);
    resetAttachmentExistence();
    assert.equal(getAttachmentExistence(), unavailableAttachmentExistence);
  });
});

// ------------------------------------------------------------- build

describe("buildExpenseGallery", () => {
  const now = new Date(2026, 8, 15);

  it("keeps in-window photos newset-first and drops everthing else", async () => {
    const expenses = [
      inWindowExpense(1, "2026-09-10 09:00:00", "file:///1.jpg"),
      inWindowExpense(2, "2026-09-15 09:00:00", "file:///2.jpg"),
      inWindowExpense(3, "2026-08-19 09:00:00", "file:///3.jpg"), // boundary
      inWindowExpense(4, "2026-08-18 09:00:00", "file:///4.jpg"), // just out
      inWindowExpense(5, "2026-07-01 09:00:00", "file:///5.jpg"), // far out
    ];
    const existence = createInMemoryAttachmentExistence([
      "file:///1.jpg",
      "file:///2.jpg",
      "file:///3.jpg",
      "file:///5.jpg",
    ]);

    const photos = await buildExpenseGallery(expenses, existence, now);

    assert.deepEqual(
      photos.map((p) => p.id),
      [2, 1, 3]
    );
    assert.equal(photos[0].uri, "file:///2.jpg");
  });

  it("ties equal dates with id descending for stable order", async () => {
    const expenses = [
      inWindowExpense(10, "2026-09-10 09:00:00", "file:///10.jpg"),
      inWindowExpense(11, "2026-09-10 09:00:00", "file:///11.jpg"),
      inWindowExpense(12, "2026-09-11 10:00:00", "file:///12.jpg"),
    ];
    const existence = createInMemoryAttachmentExistence(["file:///10.jpg", "file:///11.jpg", "file:///12.jpg"]);
    const photos = await buildExpenseGallery(expenses, existence, now);
    assert.deepEqual(
      photos.map((p) => p.id),
      [12, 11, 10]
    );
  });

  it("drops rows without a stored photo", async () => {
    const expenses = [
      inWindowExpense(1, "2026-09-10 09:00:00", "file:///1.jpg"),
      mkExpense({ id: 2, date: "2026-09-11 09:00:00", attachment_uri: null }),
      mkExpense({ id: 3, date: "2026-09-12 09:00:00", attachment_uri: "" }),
    ];
    const existence = createInMemoryAttachmentExistence(["file:///1.jpg"]);
    const photos = await buildExpenseGallery(expenses, existence, now);
    assert.deepEqual(photos.map((p) => p.id), [1]);
  });

  it("skips photos whose file is missing or fails to check", async () => {
    const expenses = [
      inWindowExpense(1, "2026-09-10 09:00:00", "file:///missing.jpg"),
      inWindowExpense(2, "2026-09-11 09:00:00", "file:///throws.jpg"),
      inWindowExpense(3, "2026-09-12 09:00:00", "file:///present.jpg"),
    ];
    const existence = {
      exists(uri: string): boolean {
        if (uri === "file:///throws.jpg") throw new Error("io gone");
        return uri === "file:///present.jpg";
      },
    };
    const photos = await buildExpenseGallery(expenses, existence, now);
    assert.deepEqual(photos.map((p) => p.id), [3]);
  });

  it("returns an empty list for an empty input", async () => {
    assert.deepEqual(
      await buildExpenseGallery([], createInMemoryAttachmentExistence(), now),
      []
    );
  });

  it("carries the linked expense details for the viewer", async () => {
    const expenses = [
      mkExpense({
        id: 7,
        date: "2026-09-14 12:00:00",
        attachment_uri: "file:///7.jpg",
        description: "Lunch",
        amount: 150000,
        category_name: "Food",
        payment_method: "POS",
        note: "Paid for the team",
      }),
    ];
    const existence = createInMemoryAttachmentExistence(["file:///7.jpg"]);
    const [photo] = await buildExpenseGallery(expenses, existence, now);
    assert.equal(photo.id, 7);
    assert.equal(photo.expenseDate, "2026-09-14");
    assert.equal(photo.description, "Lunch");
    assert.equal(photo.amountKobo, 150000);
    assert.equal(photo.categoryName, "Food");
    assert.equal(photo.paymentMethod, "POS");
    assert.equal(photo.note, "Paid for the team");
  });

  it("runs fully offline against local records", async () => {
    const expenses = [inWindowExpense(1, "2026-09-10 09:00:00", "file:///1.jpg")];
    const existence = createInMemoryAttachmentExistence(["file:///1.jpg"]);
    const first = await buildExpenseGallery(expenses, existence, now);
    const second = await buildExpenseGallery(expenses, existence, now);
    assert.deepEqual(first, second);
    assert.equal(first.length, 1);
  });
});

// ------------------------------------------------------------- preview

describe("galleryPreview (View more)", () => {
  const photos = Array.from({ length: 10 }, (_, i) =>
    inWindowExpense(i + 1, `2026-09-${String(10 + i).padStart(2, "0")} 09:00:00`, `file:///${i + 1}.jpg`)
  ).map((expense) => ({ id: expense.id, uri: expense.attachment_uri ?? "" }));

  const asGallery = (items: { id: number; uri: string }[]) =>
    items.map((item) => ({
      id: item.id,
      uri: item.uri,
      expenseDate: "2026-09-10",
      description: "Receipt item",
      amountKobo: 1000,
      categoryName: "Food",
      paymentMethod: "Cash",
      note: "",
    }));

  it("returns the first N and flags the rest as more", () => {
    const { preview, hasMore } = galleryPreview(asGallery(photos), 8);
    assert.equal(preview.length, 8);
    assert.equal(hasMore, true);
    assert.equal(preview[0].id, 1);
    assert.equal(preview[7].id, 8);
  });

  it("hides View more when everything fits", () => {
    assert.equal(galleryPreview(asGallery(photos.slice(0, 8)), 8).hasMore, false);
    assert.equal(galleryPreview(asGallery([]), 8).hasMore, false);
    assert.equal(galleryPreview(asGallery([]), 8).preview.length, 0);
  });
});

// ------------------------------------------------------------- database

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

  close() {
    this.sqlite.close();
  }
}

function withDb(): { d: SQLiteDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "miyspend-gallery-test-"));
  const db = new TestDb(join(dir, "gallery.db"));
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

describe("expense attachment queries", () => {
  it("returns only photo-bearing expenses, date-bounded and newest first", async () => {
    const { d, cleanup } = withDb();
    try {
      await d.runAsync(
        "INSERT INTO categories (name, icon, color, sort_order) VALUES ('Food', '🍔', '#F59E0B', 1)"
      );
      await addExpense(d, {
        amount: 1000,
        category_id: 1,
        description: "Old receipt",
        payment_method: "Cash",
        note: "",
        date: "2026-08-01 09:00:00",
        attachment_uri: "file:///docs/attachments/old.jpg",
      });
      const mid = await addExpense(d, {
        amount: 2000,
        category_id: 1,
        description: "Mid receipt",
        payment_method: "Cash",
        note: "",
        date: "2026-09-10 09:00:00",
        attachment_uri: "file:///docs/attachments/mid.jpg",
      });
      const fresh = await addExpense(d, {
        amount: 3000,
        category_id: 1,
        description: "Fresh receipt",
        payment_method: "POS",
        note: "Lunch",
        date: "2026-09-14 09:00:00",
        attachment_uri: "file:///docs/attachments/fresh.jpg",
      });
      await addExpense(d, {
        amount: 4000,
        category_id: 1,
        description: "No photo",
        payment_method: "Cash",
        note: "",
        date: "2026-09-20 09:00:00",
      });
      await addExpense(d, {
        amount: 5000,
        category_id: 1,
        description: "Empty photo",
        payment_method: "Cash",
        note: "",
        date: "2026-09-21 09:00:00",
        attachment_uri: "",
      });

      const bounded = await getExpenseAttachments(d, "2026-08-19");
      assert.deepEqual(
        bounded.map((e) => e.id),
        [fresh, mid]
      );

      const all = await getExpenseAttachments(d);
      assert.deepEqual(
        all.map((e) => e.id),
        [fresh, mid, 1]
      );
    } finally {
      cleanup();
    }
  });

  it("composes with the gallery builder end to end", async () => {
    const { d, cleanup } = withDb();
    try {
      await d.runAsync(
        "INSERT INTO categories (name, icon, color, sort_order) VALUES ('Food', '🍔', '#F59E0B', 1)"
      );
      const first = await addExpense(d, {
        amount: 1000,
        category_id: 1,
        description: "First",
        payment_method: "Cash",
        note: "",
        date: "2026-09-12 09:00:00",
        attachment_uri: "file:///docs/attachments/first.jpg",
      });
      const second = await addExpense(d, {
        amount: 2000,
        category_id: 1,
        description: "Second",
        payment_method: "POS",
        note: "",
        date: "2026-09-13 09:00:00",
        attachment_uri: "file:///docs/attachments/second.jpg",
      });
      await addExpense(d, {
        amount: 3000,
        category_id: 1,
        description: "Missing file",
        payment_method: "Cash",
        note: "",
        date: "2026-09-14 09:00:00",
        attachment_uri: "file:///docs/attachments/gone.jpg",
      });

      const rows = await getExpenseAttachments(d, galleryWindowStart(new Date(2026, 8, 15)));
      const existence = createInMemoryAttachmentExistence([
        "file:///docs/attachments/first.jpg",
        "file:///docs/attachments/second.jpg",
      ]);
      const photos = await buildExpenseGallery(rows, existence, new Date(2026, 8, 15));

      assert.deepEqual(
        photos.map((p) => p.id),
        [second, first]
      );
      assert.equal(photos[0].description, "Second");
      assert.equal(photos[0].note, "");
    } finally {
      cleanup();
    }
  });

  it("shows linked details when the photo is opened and copes with deletion", async () => {
    const { d, cleanup } = withDb();
    try {
      await d.runAsync(
        "INSERT INTO categories (name, icon, color, sort_order) VALUES ('Food', '🍔', '#F59E0B', 1)"
      );
      const id = await addExpense(d, {
        amount: 250000,
        category_id: 1,
        description: "Groceries",
        payment_method: "Bank Transfer",
        note: "Weekly shop",
        date: "2026-09-14 10:00:00",
        attachment_uri: "file:///docs/attachments/shop.jpg",
      });

      const linked = await getExpenseById(d, id);
      assert.equal(linked?.description, "Groceries");
      assert.equal(linked?.amount, 250000);
      assert.equal(linked?.attachment_uri, "file:///docs/attachments/shop.jpg");

      await deleteExpense(d, id);
      assert.equal(await getExpenseById(d, id), null);
      assert.deepEqual(await getExpenseAttachments(d), []);
    } finally {
      cleanup();
    }
  });
});