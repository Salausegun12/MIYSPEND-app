import type { SQLiteDatabase } from "expo-sqlite";
import type {
  BackupBudget,
  BackupCategory,
  BackupCollectionCounts,
  BackupContribution,
  BackupExpense,
  BackupIncome,
  BackupRecurringOccurrence,
  BackupRecurringTransaction,
  BackupSavingsGoal,
  BackupSetting,
  MiySpendBackup,
  BackupValidationResult,
} from "../types/database";

/**
 * Local backup and restore.
 *
 * A backup is a single versioned JSON file containing every record verbatim
 * (with its original id), produced and consumed entirely on-device. There is
 * no cloud, no server and no network dependency — everything happens against
 * the local SQLite database.
 *
 * Restoring never runs before the file has passed structural validation, and
 * never overwrites the live database silently: the caller must show the user a
 * clear warning and get explicit confirmation first. Within the database the
 * replace is atomic (one transaction), so a failed restore rolls back.
 *
 * All amounts remain integer kobo, exactly as stored.
 */

export const BACKUP_FORMAT = "miyspend-backup";
export const BACKUP_FORMAT_VERSION = 1;

export type BackupErrorCode = "unsupported-version" | "invalid-structure" | "restore-failed";

export class BackupError extends Error {
  readonly code: BackupErrorCode;

  constructor(code: BackupErrorCode, message: string) {
    super(message);
    this.name = "BackupError";
    this.code = code;
  }
}

/** Tables sorted child-first so DELETE never violates foreign keys. */
const DELETE_ORDER = [
  "contributions",
  "budgets",
  "expenses",
  "income",
  "recurring_occurrences",
  "recurring_transactions",
  "savings_goals",
  "settings",
  "categories",
] as const;

/* -------------------------------------------------------------------------- */
/*                                 Types guards                               */
/* -------------------------------------------------------------------------- */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isOptionalIntOrNull(value: unknown): boolean {
  return value === null || isInt(value);
}

function isTimestamp(value: unknown): boolean {
  return isNonEmptyString(value);
}

const RECURRING_TYPES = new Set(["income", "expense"]);
const RECURRING_FREQUENCIES = new Set(["daily", "weekly", "monthly", "yearly"]);

/* -------------------------------------------------------------------------- */
/*                                Payload build                               */
/* -------------------------------------------------------------------------- */

/**
 * Reads the whole database into a backup payload. Read-only: nothing is
 * changed, and every amount stays an integer.
 */
export async function buildBackupPayload(
  db: SQLiteDatabase
): Promise<MiySpendBackup> {
  const [categories, expenses, income, settings, budgets, savingsGoals, contributions, recurringTransactions, recurringOccurrences] = await Promise.all([
    db.getAllAsync<BackupCategory>(
      "SELECT id, name, icon, color, sort_order, created_at FROM categories ORDER BY id"
    ),
    db.getAllAsync<BackupExpense>(
      "SELECT id, amount, category_id, description, payment_method, note, date, created_at, updated_at FROM expenses ORDER BY id"
    ),
    db.getAllAsync<BackupIncome>(
      "SELECT id, amount, source, payment_method, note, income_date, income_time, created_at, updated_at FROM income ORDER BY id"
    ),
    db.getAllAsync<BackupSetting>(
      "SELECT key, value FROM settings ORDER BY key"
    ),
    db.getAllAsync<BackupBudget>(
      "SELECT id, category_id, limit_amount, created_at, updated_at FROM budgets ORDER BY id"
    ),
    db.getAllAsync<BackupSavingsGoal>(
      "SELECT id, name, target_amount, current_amount, target_date, note, created_at, updated_at FROM savings_goals ORDER BY id"
    ),
    db.getAllAsync<BackupContribution>(
      "SELECT id, goal_id, amount, date, note, created_at FROM contributions ORDER BY id"
    ),
    db.getAllAsync<BackupRecurringTransaction>(
      "SELECT id, type, amount, description, category_id, payment_method, frequency, next_occurrence, anchor_day, end_date, is_active, created_at, updated_at FROM recurring_transactions ORDER BY id"
    ),
    db.getAllAsync<BackupRecurringOccurrence>(
      "SELECT id, recurring_id, occurrence_date, created_at FROM recurring_occurrences ORDER BY id"
    ),
  ]);

  return {
    app: "miyspend",
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    collections: {
      categories,
      expenses,
      income,
      settings,
      budgets,
      savingsGoals,
      contributions,
      recurringTransactions,
      recurringOccurrences,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                              Parsing + validation                          */
/* -------------------------------------------------------------------------- */

/**
 * Parses raw text into a backup and validates it. Never throws; the result
 * carries either a fully checked payload or a human-readable problem.
 */
export function parseBackupJson(text: string): BackupValidationResult {
  if (!isNonEmptyString(text)) {
    return { ok: false, error: "The backup file is empty." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "The file is not valid JSON and cannot be read as a backup.",
    };
  }
  return validateBackupPayload(parsed);
}

/**
 * Validates the structure of a prospective backup before anything is written.
 * Checks the format marker, the exact version, the presence and shape of every
 * collection, integer-kobo amounts, and that all foreign-key references point
 * at ids present in the same backup.
 */
export function validateBackupPayload(value: unknown): BackupValidationResult {
  if (!isObject(value)) {
    return { ok: false, error: "The backup is not a valid object." };
  }

  if (value.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      error: "This file is not a MiySpend backup.",
    };
  }

  if (value.app !== "miyspend") {
    return { ok: false, error: "This file was not created by MiySpend." };
  }

  if (!isInt(value.version)) {
    return { ok: false, error: "The backup version is corrupted." };
  }
  if (value.version !== BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: `This backup uses version ${value.version}, but this app supports version ${BACKUP_FORMAT_VERSION}.`,
    };
  }

  if (!isNonEmptyString(value.exportedAt)) {
    return { ok: false, error: "The backup has no export timestamp." };
  }

  if (!isObject(value.collections)) {
    return { ok: false, error: "The backup contains no data." };
  }
  const collections = value.collections;

  const categories = validateCategories(collections.categories);
  if (!categories.ok) return categories;

  const settings = validateSettings(collections.settings);
  if (!settings.ok) return settings;

  const savingsGoals = validateSavingsGoals(collections.savingsGoals);
  if (!savingsGoals.ok) return savingsGoals;

  const budgets = validateBudgets(collections.budgets, categories.categoryIds);
  if (!budgets.ok) return budgets;

  const expenses = validateExpenses(
    collections.expenses,
    categories.categoryIds
  );
  if (!expenses.ok) return expenses;

  const incomeRows = validateIncome(collections.income);
  if (!incomeRows.ok) return incomeRows;

  const recurring = validateRecurring(
    collections.recurringTransactions,
    categories.categoryIds
  );
  if (!recurring.ok) return recurring;

  const occurrences = validateOccurrences(
    collections.recurringOccurrences,
    recurring.recurringIds
  );
  if (!occurrences.ok) return occurrences;

  const contributions = validateContributions(
    collections.contributions,
    savingsGoals.goalIds
  );
  if (!contributions.ok) return contributions;

  return {
    ok: true,
    payload: value as unknown as MiySpendBackup,
  };
}

type RowValidation<T extends Record<string, unknown> = Record<string, unknown>> =
  | { ok: false; error: string }
  | ({ ok: true } & T);

function bad(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

function validateCategories(
  value: unknown
): RowValidation<{ categoryIds: Set<number> }> {
  if (!Array.isArray(value)) {
    return bad("The backup's categories are missing or not a list.");
  }
  const categoryIds = new Set<number>();
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!isObject(row)) {
      return bad(`Category #${i + 1} is not a valid row.`);
    }
    if (!isInt(row.id) || categoryIds.has(row.id)) {
      return bad(`Category #${i + 1} has a missing or duplicate id.`);
    }
    categoryIds.add(row.id);
    if (!isNonEmptyString(row.name)) {
      return bad(`Category #${i + 1} has no name.`);
    }
    if (!isString(row.icon) || !isString(row.color)) {
      return bad(`Category #${i + 1} has missing icon or colour.`);
    }
    if (!isInt(row.sort_order)) {
      return bad(`Category #${i + 1} has a corrupted sort order.`);
    }
    if (!isTimestamp(row.created_at)) {
      return bad(`Category #${i + 1} has a corrupted created date.`);
    }
  }
  return { ok: true, categoryIds };
}

function validateSettings(value: unknown): RowValidation {
  if (!Array.isArray(value)) {
    return bad("The backup's settings are missing or not a list.");
  }
  const keys = new Set<string>();
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!isObject(row)) {
      return bad(`Setting #${i + 1} is not a valid row.`);
    }
    if (!isNonEmptyString(row.key) || keys.has(row.key)) {
      return bad(`Setting #${i + 1} has a missing or duplicate key.`);
    }
    keys.add(row.key);
    if (!isString(row.value)) {
      return bad(`Setting “${row.key}” has a corrupted value.`);
    }
  }
  return { ok: true };
}

function validateSavingsGoals(
  value: unknown
): RowValidation<{ goalIds: Set<number> }> {
  if (!Array.isArray(value)) {
    return bad("The backup's savings goals are missing or not a list.");
  }
  const goalIds = new Set<number>();
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!isObject(row)) {
      return bad(`Savings goal #${i + 1} is not a valid row.`);
    }
    if (!isInt(row.id) || goalIds.has(row.id)) {
      return bad(`Savings goal #${i + 1} has a missing or duplicate id.`);
    }
    goalIds.add(row.id);
    if (!isNonEmptyString(row.name)) {
      return bad(`Savings goal #${i + 1} has no name.`);
    }
    if (!isInt(row.target_amount) || row.target_amount <= 0) {
      return bad(
        `Savings goal #${i + 1} has a non-integer or missing target amount.`
      );
    }
    if (!isInt(row.current_amount) || row.current_amount < 0) {
      return bad(
        `Savings goal #${i + 1} has a non-integer or missing saved amount.`
      );
    }
    if (row.target_date !== null && !isNonEmptyString(row.target_date)) {
      return bad(`Savings goal #${i + 1} has a corrupted target date.`);
    }
    if (!isString(row.note) || !isTimestamp(row.created_at) || !isTimestamp(row.updated_at)) {
      return bad(`Savings goal #${i + 1} has corrupted metadata.`);
    }
  }
  return { ok: true, goalIds };
}

function validateBudgets(
  value: unknown,
  categoryIds: Set<number>
): RowValidation {
  if (!Array.isArray(value)) {
    return bad("The backup's budgets are missing or not a list.");
  }
  const budgeted = new Set<number>();
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!isObject(row)) {
      return bad(`Budget #${i + 1} is not a valid row.`);
    }
    if (!isInt(row.id)) {
      return bad(`Budget #${i + 1} has a missing or corrupted id.`);
    }
    if (!isInt(row.category_id) || !categoryIds.has(row.category_id)) {
      return bad(`Budget #${i + 1} points at a category that is not in the backup.`);
    }
    if (budgeted.has(row.category_id)) {
      return bad(`Budget #${i + 1} duplicates a category already budgeted.`);
    }
    budgeted.add(row.category_id);
    if (!isInt(row.limit_amount) || row.limit_amount < 0) {
      return bad(`Budget #${i + 1} has a non-integer limit amount.`);
    }
    if (!isTimestamp(row.created_at) || !isTimestamp(row.updated_at)) {
      return bad(`Budget #${i + 1} has corrupted metadata.`);
    }
  }
  return { ok: true };
}

function validateExpenses(
  value: unknown,
  categoryIds: Set<number>
): RowValidation {
  if (!Array.isArray(value)) {
    return bad("The backup's expenses are missing or not a list.");
  }
  const ids = new Set<number>();
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!isObject(row)) {
      return bad(`Expense #${i + 1} is not a valid row.`);
    }
    if (!isInt(row.id) || ids.has(row.id)) {
      return bad(`Expense #${i + 1} has a missing or duplicate id.`);
    }
    ids.add(row.id);
    if (!isInt(row.amount) || row.amount < 0) {
      return bad(`Expense #${i + 1} has a non-integer amount.`);
    }
    if (!isInt(row.category_id) || !categoryIds.has(row.category_id)) {
      return bad(`Expense #${i + 1} points at a category that is not in the backup.`);
    }
    if (!isString(row.description)) {
      return bad(`Expense #${i + 1} has a corrupted description.`);
    }
    if (!isString(row.payment_method) || !isString(row.note)) {
      return bad(`Expense #${i + 1} has corrupted metadata.`);
    }
    if (!isNonEmptyString(row.date) || !isTimestamp(row.created_at) || !isTimestamp(row.updated_at)) {
      return bad(`Expense #${i + 1} has corrupted dates.`);
    }
  }
  return { ok: true };
}

function validateIncome(value: unknown): RowValidation {
  if (!Array.isArray(value)) {
    return bad("The backup's income is missing or not a list.");
  }
  const ids = new Set<number>();
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!isObject(row)) {
      return bad(`Income record #${i + 1} is not a valid row.`);
    }
    if (!isInt(row.id) || ids.has(row.id)) {
      return bad(`Income record #${i + 1} has a missing or duplicate id.`);
    }
    ids.add(row.id);
    if (!isInt(row.amount) || row.amount < 0) {
      return bad(`Income record #${i + 1} has a non-integer amount.`);
    }
    if (!isString(row.source) || !isString(row.payment_method) || !isString(row.note)) {
      return bad(`Income record #${i + 1} has corrupted metadata.`);
    }
    if (!isNonEmptyString(row.income_date) || !isString(row.income_time)) {
      return bad(`Income record #${i + 1} has corrupted dates.`);
    }
    if (!isTimestamp(row.created_at) || !isTimestamp(row.updated_at)) {
      return bad(`Income record #${i + 1} has corrupted metadata.`);
    }
  }
  return { ok: true };
}

function validateRecurring(
  value: unknown,
  categoryIds: Set<number>
): RowValidation<{ recurringIds: Set<number> }> {
  if (!Array.isArray(value)) {
    return bad("The backup's recurring transactions are missing or not a list.");
  }
  const ids = new Set<number>();
  const recurringIds = new Set<number>();
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!isObject(row)) {
      return bad(`Recurring record #${i + 1} is not a valid row.`);
    }
    if (!isInt(row.id) || ids.has(row.id)) {
      return bad(`Recurring record #${i + 1} has a missing or duplicate id.`);
    }
    ids.add(row.id);
    recurringIds.add(row.id);
    if (typeof row.type !== "string" || !RECURRING_TYPES.has(row.type)) {
      return bad(`Recurring record #${i + 1} has an invalid type.`);
    }
    if (!isInt(row.amount) || row.amount <= 0) {
      return bad(`Recurring record #${i + 1} has a non-integer amount.`);
    }
    if (!isNonEmptyString(row.description)) {
      return bad(`Recurring record #${i + 1} has no description.`);
    }
    if (!isOptionalIntOrNull(row.category_id)) {
      return bad(`Recurring record #${i + 1} has a corrupted category.`);
    }
    if (
      row.category_id !== null &&
      !categoryIds.has(row.category_id as number)
    ) {
      return bad(`Recurring record #${i + 1} points at a category that is not in the backup.`);
    }
    if (!isString(row.payment_method)) {
      return bad(`Recurring record #${i + 1} has a corrupted payment method.`);
    }
    if (typeof row.frequency !== "string" || !RECURRING_FREQUENCIES.has(row.frequency)) {
      return bad(`Recurring record #${i + 1} has an invalid frequency.`);
    }
    if (!isNonEmptyString(row.next_occurrence)) {
      return bad(`Recurring record #${i + 1} has no next occurrence date.`);
    }
    if (!isInt(row.anchor_day) || row.anchor_day < 1 || row.anchor_day > 31) {
      return bad(`Recurring record #${i + 1} has an invalid anchor day.`);
    }
    if (row.end_date !== null && !isNonEmptyString(row.end_date)) {
      return bad(`Recurring record #${i + 1} has a corrupted end date.`);
    }
    if (row.is_active !== 0 && row.is_active !== 1) {
      return bad(`Recurring record #${i + 1} has an invalid active flag.`);
    }
    if (!isTimestamp(row.created_at) || !isTimestamp(row.updated_at)) {
      return bad(`Recurring record #${i + 1} has corrupted metadata.`);
    }
  }
  return { ok: true, recurringIds };
}

function validateOccurrences(
  value: unknown,
  recurringIds: Set<number>
): RowValidation {
  if (!Array.isArray(value)) {
    return bad("The backup's recurring occurrence ledger is missing or not a list.");
  }
  const ids = new Set<number>();
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!isObject(row)) {
      return bad(`Occurrence #${i + 1} is not a valid row.`);
    }
    if (!isInt(row.id) || ids.has(row.id)) {
      return bad(`Occurrence #${i + 1} has a missing or duplicate id.`);
    }
    ids.add(row.id);
    if (!isInt(row.recurring_id) || !recurringIds.has(row.recurring_id)) {
      return bad(`Occurrence #${i + 1} points at a recurring record that is not in the backup.`);
    }
    if (!isNonEmptyString(row.occurrence_date) || !isTimestamp(row.created_at)) {
      return bad(`Occurrence #${i + 1} has corrupted dates.`);
    }
  }
  return { ok: true };
}

function validateContributions(
  value: unknown,
  goalIds: Set<number>
): RowValidation {
  if (!Array.isArray(value)) {
    return bad("The backup's savings contributions are missing or not a list.");
  }
  const ids = new Set<number>();
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!isObject(row)) {
      return bad(`Contribution #${i + 1} is not a valid row.`);
    }
    if (!isInt(row.id) || ids.has(row.id)) {
      return bad(`Contribution #${i + 1} has a missing or duplicate id.`);
    }
    ids.add(row.id);
    if (!isInt(row.goal_id) || !goalIds.has(row.goal_id)) {
      return bad(`Contribution #${i + 1} points at a savings goal that is not in the backup.`);
    }
    if (!isInt(row.amount) || row.amount <= 0) {
      return bad(`Contribution #${i + 1} has a non-integer amount.`);
    }
    if (!isNonEmptyString(row.date) || !isString(row.note) || !isTimestamp(row.created_at)) {
      return bad(`Contribution #${i + 1} has corrupted metadata.`);
    }
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                              Counts + restore                              */
/* -------------------------------------------------------------------------- */

export function countBackupCollections(
  payload: MiySpendBackup
): BackupCollectionCounts {
  const { collections } = payload;
  return {
    categories: collections.categories.length,
    expenses: collections.expenses.length,
    income: collections.income.length,
    settings: collections.settings.length,
    budgets: collections.budgets.length,
    savingsGoals: collections.savingsGoals.length,
    contributions: collections.contributions.length,
    recurringTransactions: collections.recurringTransactions.length,
    recurringOccurrences: collections.recurringOccurrences.length,
  };
}

const INSERT_CATEGORY =
  "INSERT INTO categories (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)";
const INSERT_EXPENSE =
  "INSERT INTO expenses (id, amount, category_id, description, payment_method, note, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
const INSERT_INCOME =
  "INSERT INTO income (id, amount, source, payment_method, note, income_date, income_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
const INSERT_SETTING =
  "INSERT INTO settings (key, value) VALUES (?, ?)";
const INSERT_BUDGET =
  "INSERT INTO budgets (id, category_id, limit_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)";
const INSERT_SAVINGS_GOAL =
  "INSERT INTO savings_goals (id, name, target_amount, current_amount, target_date, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
const INSERT_CONTRIBUTION =
  "INSERT INTO contributions (id, goal_id, amount, date, note, created_at) VALUES (?, ?, ?, ?, ?, ?)";
const INSERT_RECURRING =
  "INSERT INTO recurring_transactions (id, type, amount, description, category_id, payment_method, frequency, next_occurrence, anchor_day, end_date, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
const INSERT_OCCURRENCE =
  "INSERT INTO recurring_occurrences (id, recurring_id, occurrence_date, created_at) VALUES (?, ?, ?, ?)";

async function insertAll(
  db: SQLiteDatabase,
  sql: string,
  rows: ReadonlyArray<readonly (string | number | null)[]>
): Promise<void> {
  for (const row of rows) {
    await db.runAsync(sql, ...row);
  }
}

/**
 * Replaces all app data with the backup contents. The caller must have shown a
 * clear warning and received confirmation first; this function never overwrites
 * silently. Everything happens inside one transaction, so any failure rolls the
 * database back completely.
 */
export async function restoreBackup(
  db: SQLiteDatabase,
  payload: unknown
): Promise<BackupCollectionCounts> {
  const validation = validateBackupPayload(payload);
  if (!validation.ok) {
    throw new BackupError("invalid-structure", validation.error);
  }
  const { collections } = validation.payload;

  try {
    await db.withTransactionAsync(async () => {
      for (const table of DELETE_ORDER) {
        await db.runAsync(`DELETE FROM ${table}`);
      }

      await insertAll(
        db,
        INSERT_CATEGORY,
        collections.categories.map((c) => [
          c.id,
          c.name,
          c.icon,
          c.color,
          c.sort_order,
          c.created_at,
        ])
      );
      await insertAll(
        db,
        INSERT_SETTING,
        collections.settings.map((s) => [s.key, s.value])
      );
      await insertAll(
        db,
        INSERT_SAVINGS_GOAL,
        collections.savingsGoals.map((g) => [
          g.id,
          g.name,
          g.target_amount,
          g.current_amount,
          g.target_date,
          g.note,
          g.created_at,
          g.updated_at,
        ])
      );
      await insertAll(
        db,
        INSERT_BUDGET,
        collections.budgets.map((b) => [
          b.id,
          b.category_id,
          b.limit_amount,
          b.created_at,
          b.updated_at,
        ])
      );
      await insertAll(
        db,
        INSERT_EXPENSE,
        collections.expenses.map((e) => [
          e.id,
          e.amount,
          e.category_id,
          e.description,
          e.payment_method,
          e.note,
          e.date,
          e.created_at,
          e.updated_at,
        ])
      );
      await insertAll(
        db,
        INSERT_INCOME,
        collections.income.map((i) => [
          i.id,
          i.amount,
          i.source,
          i.payment_method,
          i.note,
          i.income_date,
          i.income_time,
          i.created_at,
          i.updated_at,
        ])
      );
      await insertAll(
        db,
        INSERT_RECURRING,
        collections.recurringTransactions.map((r) => [
          r.id,
          r.type,
          r.amount,
          r.description,
          r.category_id,
          r.payment_method,
          r.frequency,
          r.next_occurrence,
          r.anchor_day,
          r.end_date,
          r.is_active,
          r.created_at,
          r.updated_at,
        ])
      );
      await insertAll(
        db,
        INSERT_OCCURRENCE,
        collections.recurringOccurrences.map((o) => [
          o.id,
          o.recurring_id,
          o.occurrence_date,
          o.created_at,
        ])
      );
      await insertAll(
        db,
        INSERT_CONTRIBUTION,
        collections.contributions.map((c) => [
          c.id,
          c.goal_id,
          c.amount,
          c.date,
          c.note,
          c.created_at,
        ])
      );
    });
  } catch (error) {
    if (error instanceof BackupError) throw error;
    console.warn("Backup restore failed:", error);
    throw new BackupError(
      "restore-failed",
      error instanceof Error
        ? error.message
        : "The backup could not be restored to this device."
    );
  }

  return countBackupCollections(validation.payload);
}