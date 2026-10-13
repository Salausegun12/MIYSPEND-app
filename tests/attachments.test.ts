import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SQLiteDatabase } from "expo-sqlite";

import {
  createInMemoryPhotoPicker,
  getPhotoPicker,
  registerPhotoPicker,
  resetPhotoPicker,
  unavailablePhotoPicker,
} from "../src/services/attachments/picker.ts";
import {
  createInMemoryAttachmentStore,
  getAttachmentStore,
  registerAttachmentStore,
  resetAttachmentStore,
  unavailableAttachmentStore,
} from "../src/services/attachments/store.ts";
import {
  discardAttachmentPhoto,
  isManagedAttachment,
  pickAttachmentPhoto,
  saveAttachmentPhoto,
  toAttachmentError,
} from "../src/services/attachments/service.ts";
import {
  attachmentPermissionDenied,
  attachmentStorageFailed,
  attachmentUnsupported,
} from "../src/services/attachments/responses.ts";
import { addExpense, getExpenseById, updateExpense } from "../src/database/expenses.ts";

describe("attachment picker registry", () => {
  afterEach(() => resetPhotoPicker());

  it("defaults to the unavailable picker and restores it on reset", () => {
    assert.equal(getPhotoPicker(), unavailablePhotoPicker);
    const fake = createInMemoryPhotoPicker(() => null);
    registerPhotoPicker(fake);
    assert.equal(getPhotoPicker(), fake);
    resetPhotoPicker();
    assert.equal(getPhotoPicker(), unavailablePhotoPicker);
  });

  it("records the sources it was asked for", async () => {
    const fake = createInMemoryPhotoPicker(() => ({
      uri: "file:///tmp/pick.jpg",
      fileName: "pick.jpg",
      mimeType: "image/jpeg",
    }));
    const first = await fake.pick("camera");
    const second = await fake.pick("library");
    assert.equal(first?.uri, "file:///tmp/pick.jpg");
    assert.equal(second?.uri, "file:///tmp/pick.jpg");
    assert.deepEqual(fake.requests, ["camera", "library"]);
  });
});

describe("pickAttachmentPhoto", () => {
  it("returns the raw selection without persisting it", async () => {
    const picker = createInMemoryPhotoPicker(() => ({
      uri: "file:///tmp/receipt.jpg",
    }));
    const result = await pickAttachmentPhoto("library", { picker });
    assert.equal(result.status, "picked");
    if (result.status === "picked") {
      assert.equal(result.photo.uri, "file:///tmp/receipt.jpg");
    }
  });

  it("reports a cancelled pick", async () => {
    const picker = createInMemoryPhotoPicker(() => null);
    const result = await pickAttachmentPhoto("camera", { picker });
    assert.equal(result.status, "cancelled");
  });

  it("turns a denied permission into a gentle error", async () => {
    const picker = createInMemoryPhotoPicker(() => {
      throw { kind: "permission-denied", message: attachmentPermissionDenied("camera") };
    });
    const result = await pickAttachmentPhoto("camera", { picker });
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.equal(result.error.kind, "permission-denied");
      assert.match(result.error.message, /permission/i);
    }
  });

  it("reports an unavailable source", async () => {
    const result = await pickAttachmentPhoto("camera", {
      picker: unavailablePhotoPicker,
    });
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.equal(result.error.kind, "unsupported");
    }
  });

  it("maps an unknown failure to the generic message", async () => {
    const picker = createInMemoryPhotoPicker(() => {
      throw new Error("boom");
    });
    const result = await pickAttachmentPhoto("library", { picker });
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.equal(result.error.kind, "failed");
    }
  });
});

describe("save/discard attachment photos", () => {
  it("persists into the store and returns a durable, owned URI", async () => {
    const store = createInMemoryAttachmentStore();
    const result = await saveAttachmentPhoto(
      { uri: "file:///tmp/receipt.jpg" },
      { store }
    );
    assert.equal(result.status, "saved");
    if (result.status === "saved") {
      assert.equal(store.has(result.uri), true);
      assert.equal(isManagedAttachment(result.uri, store), true);
      assert.equal(isManagedAttachment("file:///tmp/receipt.jpg", store), false);
    }
  });

  it("surfaces a storage failure", async () => {
    const result = await saveAttachmentPhoto(
      { uri: "file:///tmp/receipt.jpg" },
      { store: unavailableAttachmentStore }
    );
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.equal(result.error.kind, "storage");
      assert.equal(result.error.message, attachmentStorageFailed());
    }
  });

  it("deletes managed files and ignores everything else", async () => {
    const store = createInMemoryAttachmentStore();
    const saved = await saveAttachmentPhoto({ uri: "a" }, { store });
    assert.equal(saved.status, "saved");
    if (saved.status !== "saved") return;

    await discardAttachmentPhoto(saved.uri, { store });
    assert.equal(store.has(saved.uri), false);

    // null, undefined and foreign URIs are no-ops and never throw.
    await discardAttachmentPhoto(null, { store });
    await discardAttachmentPhoto("file:///tmp/receipt.jpg", { store });
  });

  it("swallows store deletion errors so saving is never blocked", async () => {
    const store = {
      persist: async () => "memory://attachments/x",
      owns: () => true,
      remove: async () => {
        throw new Error("disk gone");
      },
    };
    await assert.doesNotReject(() =>
      discardAttachmentPhoto("memory://attachments/x", { store })
    );
  });

  it("defaults to the registered store", async () => {
    const store = createInMemoryAttachmentStore();
    registerAttachmentStore(store);
    try {
      assert.equal(getAttachmentStore(), store);
      const saved = await saveAttachmentPhoto({ uri: "b" });
      assert.equal(saved.status, "saved");
    } finally {
      resetAttachmentStore();
    }
    assert.equal(getAttachmentStore(), unavailableAttachmentStore);
  });
});

describe("toAttachmentError", () => {
  it("passes through a structured attachment error", () => {
    const error = { kind: "permission-denied" as const, message: "keep me" };
    assert.equal(toAttachmentError(error), error);
  });

  it("uses the requested default kind for unknown errors", () => {
    assert.equal(toAttachmentError(new Error("x"), { defaultKind: "storage" }).kind, "storage");
    assert.equal(toAttachmentError(new Error("x")).kind, "failed");
  });

  it("builds a source-aware message", () => {
    assert.equal(
      toAttachmentError(undefined, { source: "camera", defaultKind: "unsupported" })
        .message,
      attachmentUnsupported("camera")
    );
  });
});

// ---------------------------------------------------------------- database

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

  close() {
    this.sqlite.close();
  }
}

function withDb(): { db: TestDb; d: SQLiteDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "miyspend-attachments-test-"));
  const db = new TestDb(join(dir, "attachments.db"));
  return {
    db,
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

describe("expense attachment persistence", () => {
  it("stores, reads and clears the photo URI without touching amounts", async () => {
    const { d, cleanup } = withDb();
    try {
      await d.runAsync(
        "INSERT INTO categories (name, icon, color, sort_order) VALUES ('Food', '🍔', '#F59E0B', 1)"
      );

      const id = await addExpense(d, {
        amount: 150000,
        category_id: 1,
        description: "Lunch",
        payment_method: "Cash",
        note: "",
        date: "2026-09-01 12:00:00",
        attachment_uri: "file:///docs/attachments/receipt-1.jpg",
      });

      const withPhoto = await getExpenseById(d, id);
      assert.equal(withPhoto?.amount, 150000);
      assert.equal(
        withPhoto?.attachment_uri,
        "file:///docs/attachments/receipt-1.jpg"
      );

      await updateExpense(d, id, { amount: 175000, attachment_uri: null });
      const cleared = await getExpenseById(d, id);
      assert.equal(cleared?.amount, 175000);
      assert.equal(cleared?.attachment_uri, null);

      await updateExpense(d, id, {
        attachment_uri: "file:///docs/attachments/receipt-2.jpg",
      });
      const replaced = await getExpenseById(d, id);
      assert.equal(
        replaced?.attachment_uri,
        "file:///docs/attachments/receipt-2.jpg"
      );
    } finally {
      cleanup();
    }
  });

  it("defaults to null when no photo is attached", async () => {
    const { d, cleanup } = withDb();
    try {
      await d.runAsync(
        "INSERT INTO categories (name, icon, color, sort_order) VALUES ('Food', '🍔', '#F59E0B', 1)"
      );
      const id = await addExpense(d, {
        amount: 100,
        category_id: 1,
        description: "Tea",
        payment_method: "Cash",
        note: "",
        date: "2026-09-02 08:00:00",
      });
      assert.equal((await getExpenseById(d, id))?.attachment_uri, null);
    } finally {
      cleanup();
    }
  });
});
