import { SQLiteDatabase } from "expo-sqlite";
import { RECURRING_SCHEMA_SQL } from "./recurring";

const CURRENT_DB_VERSION = 7;

const MIGRATIONS: Record<number, (db: SQLiteDatabase) => Promise<void>> = {
  1: async (db) => {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
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
        amount REAL NOT NULL,
        category_id INTEGER NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL DEFAULT (date('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
      CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
    `);
  },
  2: async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS expenses_v2 (
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

      INSERT INTO expenses_v2 (id, amount, category_id, description, date, created_at, updated_at)
        SELECT id, CAST(amount AS INTEGER), category_id, description, date, created_at, updated_at FROM expenses;

      DROP TABLE expenses;
      ALTER TABLE expenses_v2 RENAME TO expenses;

      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
      CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
    `);

    const categories = [
      { name: "Food", icon: "🍔", color: "#F59E0B", sort_order: 1 },
      { name: "Transport", icon: "🚌", color: "#3B82F6", sort_order: 2 },
      { name: "Groceries", icon: "🛒", color: "#10B981", sort_order: 3 },
      { name: "Airtime", icon: "📱", color: "#8B5CF6", sort_order: 4 },
      { name: "Data", icon: "📶", color: "#06B6D4", sort_order: 5 },
      { name: "Electricity", icon: "⚡", color: "#F59E0B", sort_order: 6 },
      { name: "Housing", icon: "🏠", color: "#EC4899", sort_order: 7 },
      { name: "Health", icon: "💊", color: "#10B981", sort_order: 8 },
      { name: "Education", icon: "📚", color: "#3B82F6", sort_order: 9 },
      { name: "Family", icon: "👨‍👩‍👧", color: "#14B8A6", sort_order: 10 },
      { name: "Clothing", icon: "👕", color: "#A855F7", sort_order: 11 },
      { name: "Entertainment", icon: "🎬", color: "#F43F5E", sort_order: 12 },
      { name: "Business/Work", icon: "💼", color: "#6366F1", sort_order: 13 },
      { name: "Giving", icon: "🎁", color: "#14B8A6", sort_order: 14 },
      { name: "Other", icon: "📦", color: "#6B7280", sort_order: 15 },
    ];
    for (const cat of categories) {
      await db.runAsync(
        "INSERT INTO categories (name, icon, color, sort_order) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = ?)",
        cat.name,
        cat.icon,
        cat.color,
        cat.sort_order,
        cat.name
      );
    }
  },
  3: async () => {
    // User profile stored in settings table (user_name, user_phone, user_email, onboarding_complete)
    // No schema changes needed - settings table already supports key-value pairs.
    // This migration ensures the DB version is bumped.
  },
  4: async (db) => {
    await db.execAsync(`
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

      CREATE INDEX IF NOT EXISTS idx_income_date ON income(income_date);
      CREATE INDEX IF NOT EXISTS idx_income_date_source ON income(income_date, source);
    `);
  },
  5: async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL UNIQUE,
        limit_amount INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_budgets_category_id ON budgets(category_id);
    `);
  },
  6: async (db) => {
    await db.execAsync(`
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

      CREATE INDEX IF NOT EXISTS idx_savings_goals_target_date
        ON savings_goals(target_date);

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

      CREATE INDEX IF NOT EXISTS idx_contributions_goal_id
        ON contributions(goal_id);
      CREATE INDEX IF NOT EXISTS idx_contributions_date
        ON contributions(date);
    `);
  },
  7: async (db) => {
    await db.execAsync(RECURRING_SCHEMA_SQL);
  },
};

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version"
  );
  const currentVersion = result?.user_version ?? 0;

  if (currentVersion >= CURRENT_DB_VERSION) {
    return;
  }

  for (let v = currentVersion + 1; v <= CURRENT_DB_VERSION; v++) {
    const migration = MIGRATIONS[v];
    if (migration) {
      await migration(db);
    }
  }

  await db.execAsync(`PRAGMA user_version = ${CURRENT_DB_VERSION}`);
}

export async function seedDefaultCategories(
  db: SQLiteDatabase
): Promise<void> {
  const result = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM categories"
  );
  const count = result?.count ?? 0;

  if (count > 0) {
    return;
  }

  const defaults = [
    { name: "Food", icon: "🍔", color: "#F59E0B", sort_order: 1 },
    { name: "Transport", icon: "🚌", color: "#3B82F6", sort_order: 2 },
    { name: "Groceries", icon: "🛒", color: "#10B981", sort_order: 3 },
    { name: "Airtime", icon: "📱", color: "#8B5CF6", sort_order: 4 },
    { name: "Data", icon: "📶", color: "#06B6D4", sort_order: 5 },
    { name: "Electricity", icon: "⚡", color: "#F59E0B", sort_order: 6 },
    { name: "Housing", icon: "🏠", color: "#EC4899", sort_order: 7 },
    { name: "Health", icon: "💊", color: "#10B981", sort_order: 8 },
    { name: "Education", icon: "📚", color: "#3B82F6", sort_order: 9 },
    { name: "Family", icon: "👨‍👩‍👧", color: "#14B8A6", sort_order: 10 },
    { name: "Clothing", icon: "👕", color: "#A855F7", sort_order: 11 },
    { name: "Entertainment", icon: "🎬", color: "#F43F5E", sort_order: 12 },
    { name: "Business/Work", icon: "💼", color: "#6366F1", sort_order: 13 },
    { name: "Giving", icon: "🎁", color: "#14B8A6", sort_order: 14 },
    { name: "Other", icon: "📦", color: "#6B7280", sort_order: 15 },
  ];

  for (const cat of defaults) {
    await db.runAsync(
      "INSERT INTO categories (name, icon, color, sort_order) VALUES (?, ?, ?, ?)",
      cat.name,
      cat.icon,
      cat.color,
      cat.sort_order
    );
  }
}

export async function seedDefaultSettings(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM settings"
  );
  const count = result?.count ?? 0;

  if (count > 0) {
    return;
  }

  const defaults = [
    { key: "currency", value: "₦" },
    { key: "currency_code", value: "NGN" },
    { key: "daily_reminder_enabled", value: "false" },
    { key: "reminder_time", value: "20:00" },
  ];

  for (const setting of defaults) {
    await db.runAsync(
      "INSERT INTO settings (key, value) VALUES (?, ?)",
      setting.key,
      setting.value
    );
  }
}

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  // Foreign keys are a per-connection setting that defaults to OFF, and
  // migrateDatabase() returns early once the schema is current. Without this,
  // only a brand new database would ever enforce ON DELETE CASCADE.
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await migrateDatabase(db);
  await seedDefaultCategories(db);
  await seedDefaultSettings(db);
}
