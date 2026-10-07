import type { SQLiteDatabase } from "expo-sqlite";
import type {
  TransactionSearchFilters,
  TransactionSearchResult,
  TransactionType,
} from "../types/database";

/**
 * Advanced transaction search across income and expenses.
 *
 * A single UNION ALL query scans both tables, pushing every filter down into
 * SQL so only the rows that match are materialised. Text matching is a
 * case-insensitive substring scan (SQLite LIKE) over description, income
 * source, category name and payment method; date, amount, category, payment
 * method and type filters are exact SQL predicates. Amounts are integer kobo
 * and dates YYYY-MM-DD. Read-only: rows here are never created, deleted or
 * altered.
 */

const EXPENSE_SELECT = `
  SELECT
    'expense' AS entry_type,
    e.id AS id,
    e.amount AS amount,
    e.description AS description,
    e.payment_method AS payment_method,
    e.date AS date,
    e.category_id AS category_id,
    COALESCE(c.name, '') AS category_name,
    COALESCE(c.icon, '') AS category_icon,
    COALESCE(c.color, '') AS category_color,
    '' AS source
  FROM expenses e
  LEFT JOIN categories c ON c.id = e.category_id`;

const INCOME_SELECT = `
  SELECT
    'income' AS entry_type,
    i.id AS id,
    i.amount AS amount,
    i.source AS description,
    i.payment_method AS payment_method,
    (i.income_date || ' ' || COALESCE(i.income_time, '00:00:00')) AS date,
    NULL AS category_id,
    NULL AS category_name,
    NULL AS category_icon,
    NULL AS category_color,
    i.source AS source
  FROM income i`;

interface WhereClause {
  sql: string;
  params: Array<string | number>;
}

function escapeLike(query: string): string {
  return query.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function buildExpenseWhere(
  filters: TransactionSearchFilters
): WhereClause {
  const conds: string[] = [];
  const params: Array<string | number> = [];

  const term = filters.query?.trim() ?? "";
  if (term) {
    const like = `%${escapeLike(term)}%`;
    conds.push(
      `(LOWER(e.description) LIKE ? ESCAPE '\\' OR
        LOWER(COALESCE(c.name, '')) LIKE ? ESCAPE '\\' OR
        LOWER(COALESCE(e.payment_method, '')) LIKE ? ESCAPE '\\')`
    );
    params.push(like, like, like);
  }

  if (filters.categoryId !== undefined) {
    conds.push("e.category_id = ?");
    params.push(filters.categoryId);
  }

  if (filters.paymentMethod) {
    conds.push("e.payment_method = ?");
    params.push(filters.paymentMethod);
  }

  if (filters.dateFrom && filters.dateTo) {
    conds.push("substr(e.date, 1, 10) BETWEEN ? AND ?");
    params.push(filters.dateFrom, filters.dateTo);
  } else if (filters.dateFrom) {
    conds.push("substr(e.date, 1, 10) >= ?");
    params.push(filters.dateFrom);
  } else if (filters.dateTo) {
    conds.push("substr(e.date, 1, 10) <= ?");
    params.push(filters.dateTo);
  }

  if (filters.minAmount !== undefined) {
    conds.push("e.amount >= ?");
    params.push(filters.minAmount);
  }
  if (filters.maxAmount !== undefined) {
    conds.push("e.amount <= ?");
    params.push(filters.maxAmount);
  }

  return { sql: conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "", params };
}

function buildIncomeWhere(filters: TransactionSearchFilters): WhereClause {
  const conds: string[] = [];
  const params: Array<string | number> = [];

  const term = filters.query?.trim() ?? "";
  if (term) {
    const like = `%${escapeLike(term)}%`;
    conds.push(
      `(LOWER(i.source) LIKE ? ESCAPE '\\' OR
        LOWER(COALESCE(i.payment_method, '')) LIKE ? ESCAPE '\\')`
    );
    params.push(like, like);
  }

  if (filters.paymentMethod) {
    conds.push("i.payment_method = ?");
    params.push(filters.paymentMethod);
  }

  if (filters.dateFrom && filters.dateTo) {
    conds.push("i.income_date BETWEEN ? AND ?");
    params.push(filters.dateFrom, filters.dateTo);
  } else if (filters.dateFrom) {
    conds.push("i.income_date >= ?");
    params.push(filters.dateFrom);
  } else if (filters.dateTo) {
    conds.push("i.income_date <= ?");
    params.push(filters.dateTo);
  }

  if (filters.minAmount !== undefined) {
    conds.push("i.amount >= ?");
    params.push(filters.minAmount);
  }
  if (filters.maxAmount !== undefined) {
    conds.push("i.amount <= ?");
    params.push(filters.maxAmount);
  }

  return { sql: conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "", params };
}

/* -------------------------------------------------------------------------- */
/*                                Validation                                  */
/* -------------------------------------------------------------------------- */

function assertRealDate(value: string, field: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid ${field}: expected YYYY-MM-DD, received "${value}".`);
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
    throw new Error(`Invalid ${field}: "${value}" is not a real calendar date.`);
  }
  return value;
}

function assertNonNegativeKobo(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `Invalid ${field}: expected a non-negative integer amount in kobo, received ${String(value)}.`
    );
  }
  return value;
}

function assertPositiveInt(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${field}: expected a positive integer.`);
  }
  return value;
}

function assertType(value: string): TransactionType {
  if (value !== "income" && value !== "expense") {
    throw new Error(`Invalid type: expected "income" or "expense", received "${value}".`);
  }
  return value;
}

function normaliseFilters(
  filters: TransactionSearchFilters
): TransactionSearchFilters {
  const next: TransactionSearchFilters = { ...filters };

  if (next.query !== undefined) {
    next.query = next.query.trim();
  }
  if (next.categoryId !== undefined) {
    next.categoryId = assertPositiveInt(next.categoryId, "category id");
  }
  if (next.dateFrom !== undefined) {
    next.dateFrom = assertRealDate(next.dateFrom, "start date");
  }
  if (next.dateTo !== undefined) {
    next.dateTo = assertRealDate(next.dateTo, "end date");
  }
  if (next.minAmount !== undefined) {
    next.minAmount = assertNonNegativeKobo(next.minAmount, "minimum amount");
  }
  if (next.maxAmount !== undefined) {
    next.maxAmount = assertNonNegativeKobo(next.maxAmount, "maximum amount");
  }
  if (next.minAmount !== undefined && next.maxAmount !== undefined) {
    if (next.minAmount > next.maxAmount) {
      throw new Error("Minimum amount cannot be greater than maximum amount.");
    }
  }
  if (
    next.dateFrom !== undefined &&
    next.dateTo !== undefined &&
    next.dateFrom > next.dateTo
  ) {
    throw new Error("Start date cannot be after end date.");
  }
  if (next.types !== undefined) {
    next.types = next.types.map(assertType);
  }
  if (next.limit !== undefined) {
    next.limit = assertPositiveInt(next.limit, "limit");
  }

  return next;
}

/* -------------------------------------------------------------------------- */
/*                                The search                                  */
/* -------------------------------------------------------------------------- */

function toSearchResult(row: Record<string, unknown>): TransactionSearchResult {
  const type = String(row.entry_type) === "income" ? "income" : "expense";
  return {
    type,
    id: Number(row.id),
    amount: Number(row.amount),
    description: String(row.description),
    payment_method: String(row.payment_method),
    date: String(row.date),
    category_id: row.category_id === null ? null : Number(row.category_id),
    category_name: row.category_name === null ? null : String(row.category_name),
    category_icon: row.category_icon === null ? null : String(row.category_icon),
    category_color: row.category_color === null ? null : String(row.category_color),
    source: String(row.source),
  };
}

/**
 * Searches both income and expenses with the given filters. Returns rows
 * newest first (date and time descending). The database is only ever read.
 */
export async function searchTransactions(
  db: SQLiteDatabase,
  filters: TransactionSearchFilters = {}
): Promise<TransactionSearchResult[]> {
  const cleaned = normaliseFilters(filters);

  const includeExpense =
    cleaned.types === undefined || cleaned.types.includes("expense");
  const includeIncome =
    cleaned.types === undefined || cleaned.types.includes("income");

  if (!includeExpense && !includeIncome) {
    return [];
  }

  const selects: string[] = [];
  const params: Array<string | number> = [];

  if (includeExpense) {
    const clause = buildExpenseWhere(cleaned);
    selects.push(`${EXPENSE_SELECT}${clause.sql ? ` ${clause.sql}` : ""}`);
    params.push(...clause.params);
  }
  if (includeIncome) {
    const clause = buildIncomeWhere(cleaned);
    selects.push(`${INCOME_SELECT}${clause.sql ? ` ${clause.sql}` : ""}`);
    params.push(...clause.params);
  }

  let sql = `${selects.join(" UNION ALL ")} ORDER BY date DESC, id DESC`;
  if (cleaned.limit !== undefined) {
    sql += " LIMIT ?";
    params.push(cleaned.limit);
  }

  const rows = await db.getAllAsync<Record<string, unknown>>(sql, ...params);
  return rows.map(toSearchResult);
}