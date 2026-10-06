import type { SQLiteDatabase } from "expo-sqlite";
import type {
  CreateRecurringInput,
  RecurringFrequency,
  RecurringProcessSummary,
  RecurringTransaction,
  RecurringTransactionWithCategory,
  RecurringType,
  UpdateRecurringInput,
} from "../types/database";

/**
 * Recurring income and expenses.
 *
 * Records repeat on a local schedule (daily/weekly/monthly/yearly). No network
 * or bank connection is involved: due occurrences are materialised into the
 * `income` / `expenses` tables when the app starts or a screen regains focus.
 *
 * Duplicates are impossible twice over:
 *  1. `processDueRecurringTransactions` advances `next_occurrence` past
 *     everything it generates.
 *  2. `recurring_occurrences` has a UNIQUE(recurring_id, occurrence_date)
 *     constraint, so even an interrupted/restarted run cannot insert a
 *     transaction for a date that was already generated.
 *
 * All amounts are integer kobo, matching the rest of the app.
 */

export const RECURRING_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS recurring_transactions (
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
    CHECK (next_occurrence GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (end_date IS NULL OR end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_recurring_active_next_occurrence
    ON recurring_transactions(is_active, next_occurrence);
  CREATE INDEX IF NOT EXISTS idx_recurring_type
    ON recurring_transactions(type);

  CREATE TABLE IF NOT EXISTS recurring_occurrences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recurring_id INTEGER NOT NULL,
    occurrence_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (recurring_id, occurrence_date),
    FOREIGN KEY (recurring_id) REFERENCES recurring_transactions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_recurring_id
    ON recurring_occurrences(recurring_id);
`;

const MAX_OCCURRENCES_PER_RUN = 4000;

/* -------------------------------------------------------------------------- */
/*                                  Date math                                 */
/* -------------------------------------------------------------------------- */

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateString(year: number, monthZeroBased: number, day: number): string {
  return `${year}-${pad2(monthZeroBased + 1)}-${pad2(day)}`;
}

function daysInMonth(year: number, monthZeroBased: number): number {
  return new Date(year, monthZeroBased + 1, 0).getDate();
}

function splitDate(value: string): [number, number, number] {
  const parts = value.split("-");
  return [Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])];
}

function dayOfMonth(value: string): number {
  return Number(value.split("-")[2]);
}

function assertRealDate(value: string, field: string): string {
  const date = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`Invalid ${field}: expected YYYY-MM-DD, received "${date}".`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new Error(`Invalid ${field}: "${date}" is not a real calendar date.`);
  }
  return date;
}

function todayString(): string {
  const d = new Date();
  return toDateString(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Returns the date that follows `value` for the given frequency.
 *
 * Monthly and yearly schedules keep the record's `anchor_day` (the calendar
 * day of its very first occurrence), clamping to the last day of short months:
 * a 31st hits 30 Apr, 31 Mar, 28 Feb, then 31 Mar again. Years clamp Feb 29
 * to 28/29 Feb depending on the target year.
 */
export function advanceOccurrence(
  value: string,
  frequency: RecurringFrequency,
  anchorDay: number
): string {
  const [year, month, day] = splitDate(value);
  switch (frequency) {
    case "daily": {
      const next = new Date(year, month, day + 1);
      return toDateString(next.getFullYear(), next.getMonth(), next.getDate());
    }
    case "weekly": {
      const next = new Date(year, month, day + 7);
      return toDateString(next.getFullYear(), next.getMonth(), next.getDate());
    }
    case "monthly": {
      let targetYear = year;
      let targetMonth = month + 1;
      targetYear += Math.floor(targetMonth / 12);
      targetMonth = ((targetMonth % 12) + 12) % 12;
      const targetDay = Math.min(anchorDay, daysInMonth(targetYear, targetMonth));
      return toDateString(targetYear, targetMonth, targetDay);
    }
    case "yearly": {
      const targetYear = year + 1;
      const targetDay = Math.min(anchorDay, daysInMonth(targetYear, month));
      return toDateString(targetYear, month, targetDay);
    }
  }
}

/**
 * All occurrences from `from` (inclusive) up to `through` (inclusive), capped
 * at `endDate` when set. Returns a fixed-size list so a schedule that fell
 * years behind cannot balloon into an unbounded catch-up.
 */
export function enumerateDueOccurrences(
  from: string,
  through: string,
  frequency: RecurringFrequency,
  anchorDay: number,
  endDate: string | null = null
): string[] {
  const cutoff =
    endDate && endDate < through ? endDate : through;
  const due: string[] = [];
  let current = from;
  let guard = 0;
  while (current <= cutoff && guard < MAX_OCCURRENCES_PER_RUN) {
    due.push(current);
    current = advanceOccurrence(current, frequency, anchorDay);
    guard++;
  }
  return due;
}

/* -------------------------------------------------------------------------- */
/*                                  Validation                                */
/* -------------------------------------------------------------------------- */

function assertPositiveId(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${field}: expected a positive integer.`);
  }
  return value;
}

function assertPositiveKobo(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `Invalid ${field}: expected a positive integer amount in kobo, received ${String(value)}.`
    );
  }
  return value;
}

function assertRecurringType(value: string): string {
  if (value !== "income" && value !== "expense") {
    throw new Error(`Invalid type: expected "income" or "expense", received "${value}".`);
  }
  return value;
}

function assertFrequency(value: string): string {
  const frequencies: RecurringFrequency[] = ["daily", "weekly", "monthly", "yearly"];
  if (!frequencies.includes(value as RecurringFrequency)) {
    throw new Error(
      `Invalid frequency: expected daily, weekly, monthly or yearly, received "${value}".`
    );
  }
  return value;
}

function assertDescription(value: string): string {
  const description = value?.trim() ?? "";
  if (description.length === 0) {
    throw new Error("Description is required.");
  }
  return description;
}

function normalizeOptionalDate(
  value: string | null | undefined,
  field: string
): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return assertRealDate(value, field);
}

/* -------------------------------------------------------------------------- */
/*                               Read / queries                               */
/* -------------------------------------------------------------------------- */

function toRecurring(row: Record<string, unknown>): RecurringTransaction {
  return {
    id: Number(row.id),
    type: String(row.type) as RecurringType,
    amount: Number(row.amount),
    description: String(row.description),
    category_id: row.category_id === null ? null : Number(row.category_id),
    payment_method: String(row.payment_method ?? ""),
    frequency: String(row.frequency) as RecurringFrequency,
    next_occurrence: String(row.next_occurrence),
    anchor_day: Number(row.anchor_day),
    end_date: row.end_date === null ? null : String(row.end_date),
    is_active: Number(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function toRecurringWithCategory(
  row: Record<string, unknown>
): RecurringTransactionWithCategory {
  return {
    ...toRecurring(row),
    category_name: row.category_name === null ? null : String(row.category_name),
    category_icon: row.category_icon === null ? null : String(row.category_icon),
    category_color: row.category_color === null ? null : String(row.category_color),
  };
}

export async function getRecurringById(
  db: SQLiteDatabase,
  id: number
): Promise<RecurringTransaction | null> {
  assertPositiveId(id, "recurring id");
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM recurring_transactions WHERE id = ?",
    id
  );
  return row ? toRecurring(row) : null;
}

export async function getAllRecurringTransactions(
  db: SQLiteDatabase
): Promise<RecurringTransactionWithCategory[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
       r.*,
       c.name AS category_name,
       c.icon AS category_icon,
       c.color AS category_color
     FROM recurring_transactions r
     LEFT JOIN categories c ON c.id = r.category_id
     ORDER BY r.is_active DESC, r.next_occurrence ASC, r.id DESC`
  );
  return rows.map(toRecurringWithCategory);
}

/* -------------------------------------------------------------------------- */
/*                             Create / update / delete                       */
/* -------------------------------------------------------------------------- */

export async function createRecurringTransaction(
  db: SQLiteDatabase,
  input: CreateRecurringInput
): Promise<RecurringTransaction> {
  const type = assertRecurringType(input.type) as RecurringType;
  const amount = assertPositiveKobo(input.amount, "amount");
  const description = assertDescription(input.description);
  const frequency = assertFrequency(input.frequency) as RecurringFrequency;
  const nextOccurrence = assertRealDate(input.next_occurrence, "first occurrence");
  const endDate = normalizeOptionalDate(input.end_date, "end date");

  let categoryId: number | null = null;
  if (type === "expense") {
    if (!Number.isSafeInteger(input.category_id) || (input.category_id ?? 0) <= 0) {
      throw new Error("A category is required for recurring expenses.");
    }
    categoryId = input.category_id as number;
  }

  if (endDate && endDate < nextOccurrence) {
    throw new Error("End date must be on or after the first occurrence.");
  }

  const anchorDay = dayOfMonth(nextOccurrence);

  const result = await db.runAsync(
    `INSERT INTO recurring_transactions
       (type, amount, description, category_id, payment_method, frequency,
        next_occurrence, anchor_day, end_date, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    type,
    amount,
    description,
    categoryId,
    input.payment_method?.trim() ?? "",
    frequency,
    nextOccurrence,
    anchorDay,
    endDate
  );

  const created = await getRecurringById(db, result.lastInsertRowId);
  if (!created) {
    throw new Error("Failed to create recurring transaction.");
  }
  return created;
}

export async function updateRecurringTransaction(
  db: SQLiteDatabase,
  id: number,
  fields: UpdateRecurringInput
): Promise<RecurringTransaction | null> {
  assertPositiveId(id, "recurring id");
  const current = await getRecurringById(db, id);
  if (!current) {
    return null;
  }

  const assignments: string[] = [];
  const values: (string | number | null)[] = [];

  const nextType = fields.type !== undefined
    ? (assertRecurringType(fields.type) as RecurringType)
    : current.type;
  const nextAmount = fields.amount !== undefined
    ? assertPositiveKobo(fields.amount, "amount")
    : current.amount;
  const nextDescription = fields.description !== undefined
    ? assertDescription(fields.description)
    : current.description;
  const nextFrequency = fields.frequency !== undefined
    ? (assertFrequency(fields.frequency) as RecurringFrequency)
    : current.frequency;
  const nextOccurrence = fields.next_occurrence !== undefined
    ? assertRealDate(fields.next_occurrence, "first occurrence")
    : current.next_occurrence;
  const nextEndDate = fields.end_date !== undefined
    ? normalizeOptionalDate(fields.end_date, "end date")
    : current.end_date;

  let nextCategoryId =
    fields.category_id !== undefined ? fields.category_id : current.category_id;

  if (nextType === "expense") {
    if (!Number.isSafeInteger(nextCategoryId) || (nextCategoryId ?? 0) <= 0) {
      throw new Error("A category is required for recurring expenses.");
    }
  } else {
    nextCategoryId = null;
  }

  if (nextEndDate && nextEndDate < nextOccurrence) {
    throw new Error("End date must be on or after the first occurrence.");
  }

  if (fields.type !== undefined) {
    assignments.push("type = ?");
    values.push(nextType);
  }
  if (fields.amount !== undefined) {
    assignments.push("amount = ?");
    values.push(nextAmount);
  }
  if (fields.description !== undefined) {
    assignments.push("description = ?");
    values.push(nextDescription);
  }
  if (nextCategoryId !== current.category_id || fields.type === "income") {
    assignments.push("category_id = ?");
    values.push(nextCategoryId);
  }
  if (fields.payment_method !== undefined) {
    assignments.push("payment_method = ?");
    values.push(fields.payment_method.trim());
  }
  if (fields.frequency !== undefined) {
    assignments.push("frequency = ?");
    values.push(nextFrequency);
  }
  if (fields.next_occurrence !== undefined) {
    assignments.push("next_occurrence = ?");
    values.push(nextOccurrence);
    assignments.push("anchor_day = ?");
    values.push(dayOfMonth(nextOccurrence));
  }
  if (fields.end_date !== undefined) {
    assignments.push("end_date = ?");
    values.push(nextEndDate);
  }

  const scheduleChanged =
    fields.next_occurrence !== undefined ||
    fields.end_date !== undefined ||
    fields.frequency !== undefined;

  if (fields.is_active !== undefined) {
    if (fields.is_active !== 0 && fields.is_active !== 1) {
      throw new Error("Invalid active state: expected 0 or 1.");
    }
    assignments.push("is_active = ?");
    values.push(fields.is_active);
  } else if (scheduleChanged) {
    const reachable = !nextEndDate || nextOccurrence <= nextEndDate;
    assignments.push("is_active = ?");
    values.push(reachable ? 1 : 0);
  }

  if (assignments.length === 0) {
    return getRecurringById(db, id);
  }

  assignments.push("updated_at = datetime('now')");
  values.push(id);

  await db.runAsync(
    `UPDATE recurring_transactions SET ${assignments.join(", ")} WHERE id = ?`,
    ...values
  );
  return getRecurringById(db, id);
}

/**
 * Pauses (active 0) or resumes (active 1) a recurring record.
 *
 * Resuming does not backfill the time it was paused: a salary scheduled on
 * the 1st that was disabled for three months skips those months and resumes
 * on the next 1st on or after today. If the schedule has already passed its
 * end date there is nothing left to resume, so the record stays inactive.
 */
export async function setRecurringActive(
  db: SQLiteDatabase,
  id: number,
  active: number,
  asOfDate: string = todayString()
): Promise<RecurringTransaction | null> {
  assertPositiveId(id, "recurring id");
  if (active !== 0 && active !== 1) {
    throw new Error("Invalid active state: expected 0 or 1.");
  }
  const current = await getRecurringById(db, id);
  if (!current) {
    return null;
  }

  if (current.is_active === active) {
    return current;
  }

  await db.runAsync(
    "UPDATE recurring_transactions SET is_active = ?, updated_at = datetime('now') WHERE id = ?",
    active,
    id
  );

  if (active === 1) {
    const today = assertRealDate(asOfDate, "as-of date");
    if (current.next_occurrence < today) {
      let next = current.next_occurrence;
      let guard = 0;
      while (next < today && guard < MAX_OCCURRENCES_PER_RUN) {
        next = advanceOccurrence(next, current.frequency, current.anchor_day);
        guard++;
      }
      const reachable = !current.end_date || next <= current.end_date;
      await db.runAsync(
        `UPDATE recurring_transactions
         SET next_occurrence = ?, is_active = ?, updated_at = datetime('now')
         WHERE id = ?`,
        next,
        reachable ? 1 : 0,
        id
      );
    }
  }

  return getRecurringById(db, id);
}

export async function deleteRecurringTransaction(
  db: SQLiteDatabase,
  id: number
): Promise<boolean> {
  assertPositiveId(id, "recurring id");
  const result = await db.runAsync(
    "DELETE FROM recurring_transactions WHERE id = ?",
    id
  );
  return result.changes > 0;
}

/* -------------------------------------------------------------------------- */
/*                                 Processing                                 */
/* -------------------------------------------------------------------------- */

/**
 * Materialises every due occurrence of every active recurring record.
 *
 * Each due date becomes a row in `income` (or `expenses` for expense records)
 * plus a row in `recurring_occurrences`. The UNIQUE constraint on that ledger
 * means a date generated by a previous run is skipped, so calling this once or
 * a hundred times for the same day produces the same transactions.
 *
 * Records whose schedule has passed their end date are auto-deactivated.
 *
 * The implementation is entirely local (SQLite) and deterministic given asOf.
 */
export async function processDueRecurringTransactions(
  db: SQLiteDatabase,
  asOfDate: string = todayString()
): Promise<RecurringProcessSummary> {
  const asOf = assertRealDate(asOfDate, "as-of date");
  const summary: RecurringProcessSummary = {
    occurrencesProcessed: 0,
    incomeGenerated: 0,
    expensesGenerated: 0,
    recordsProcessed: 0,
    recordsDeactivated: 0,
  };

  const rows = await db.getAllAsync<RecurringTransaction>(
    `SELECT * FROM recurring_transactions
     WHERE is_active = 1 AND next_occurrence <= ?
     ORDER BY id ASC`,
    asOf
  );

  for (const row of rows) {
    if (row.type === "expense" && !row.category_id) {
      await db.runAsync(
        "UPDATE recurring_transactions SET is_active = 0, updated_at = datetime('now') WHERE id = ?",
        row.id
      );
      summary.recordsDeactivated++;
      continue;
    }

    const due = enumerateDueOccurrences(
      row.next_occurrence,
      asOf,
      row.frequency,
      row.anchor_day,
      row.end_date
    );

    if (due.length === 0) {
      if (row.end_date && row.next_occurrence > row.end_date) {
        await db.runAsync(
          "UPDATE recurring_transactions SET is_active = 0, updated_at = datetime('now') WHERE id = ?",
          row.id
        );
        summary.recordsDeactivated++;
      }
      continue;
    }

    let generated = 0;
    let nextOccurrence = row.next_occurrence;
    await db.withTransactionAsync(async () => {
      for (const occurrence of due) {
        const ledger = await db.runAsync(
          "INSERT OR IGNORE INTO recurring_occurrences (recurring_id, occurrence_date) VALUES (?, ?)",
          row.id,
          occurrence
        );
        if (ledger.changes === 0) {
          continue; // already generated by a previous run/restart
        }
        if (generated === 0) {
          // Only credit a record once this run even if it generated several.
          summary.recordsProcessed++;
        }
        if (row.type === "income") {
          await db.runAsync(
            `INSERT INTO income
               (amount, source, payment_method, note, income_date, income_time)
             VALUES (?, ?, ?, ?, ?, '12:00:00')`,
            row.amount,
            row.description,
            row.payment_method,
            "Recurring transaction",
            occurrence
          );
          summary.incomeGenerated++;
        } else {
          await db.runAsync(
            `INSERT INTO expenses
               (amount, category_id, description, payment_method, note, date)
             VALUES (?, ?, ?, ?, ?, ?)`,
            row.amount,
            row.category_id,
            row.description,
            row.payment_method,
            "Recurring transaction",
            `${occurrence} 12:00:00`
          );
          summary.expensesGenerated++;
        }
        summary.occurrencesProcessed++;
        generated++;
      }

      if (generated > 0) {
        nextOccurrence = advanceOccurrence(
          due[due.length - 1],
          row.frequency,
          row.anchor_day
        );
        const reachable = !row.end_date || nextOccurrence <= row.end_date;
        await db.runAsync(
          `UPDATE recurring_transactions
           SET next_occurrence = ?, is_active = ?, updated_at = datetime('now')
           WHERE id = ?`,
          nextOccurrence,
          reachable ? 1 : 0,
          row.id
        );
        if (!reachable) {
          summary.recordsDeactivated++;
        }
      }
    });
  }

  return summary;
}