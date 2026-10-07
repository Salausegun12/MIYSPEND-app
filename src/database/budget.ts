import type { SQLiteDatabase } from "expo-sqlite";
import type { Budget, BudgetWithCategory } from "../types/database";

function assertKoboAmount(amount: number, field: string): void {
  if (!Number.isInteger(amount)) {
    throw new Error(`Budget ${field} must be an integer number of kobo`);
  }
  if (amount <= 0) {
    throw new Error(`Budget ${field} must be greater than zero`);
  }
}

/**
 * The start and end of the month a budget applies to, in the full datetime
 * format stored in expenses.date ("YYYY-MM-DD HH:MM:SS"). A bare date would
 * silently exclude every expense recorded after midnight.
 */
export interface BudgetPeriod {
  start: string;
  end: string;
}

export function getCurrentBudgetPeriod(
  monthStart: string,
  monthEnd: string
): BudgetPeriod {
  return {
    start: `${monthStart} 00:00:00`,
    end: `${monthEnd} 23:59:59`,
  };
}

export async function addBudget(
  db: SQLiteDatabase,
  budget: { category_id: number; limit_amount: number }
): Promise<number> {
  assertKoboAmount(budget.limit_amount, "limit");

  const existing = await getBudgetByCategory(db, budget.category_id);
  if (existing) {
    throw new Error("This category already has a budget");
  }

  const result = await db.runAsync(
    "INSERT INTO budgets (category_id, limit_amount) VALUES (?, ?)",
    budget.category_id,
    budget.limit_amount
  );
  return result.lastInsertRowId;
}

export async function getBudgetById(
  db: SQLiteDatabase,
  id: number
): Promise<Budget | null> {
  return db.getFirstAsync<Budget>("SELECT * FROM budgets WHERE id = ?", id);
}

export async function getBudgetByCategory(
  db: SQLiteDatabase,
  categoryId: number
): Promise<Budget | null> {
  return db.getFirstAsync<Budget>(
    "SELECT * FROM budgets WHERE category_id = ?",
    categoryId
  );
}

/**
 * All budgets, each carrying what has already been spent on its category this
 * month. The spend total is summed by SQLite in a correlated subquery so the
 * whole list is one round trip; the remaining/percentage/status figures are
 * derived from it locally by calculateBudgetProgress.
 */
export async function getBudgetsWithSpending(
  db: SQLiteDatabase,
  period: BudgetPeriod
): Promise<BudgetWithCategory[]> {
  return db.getAllAsync<BudgetWithCategory>(
    `SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
       COALESCE((
         SELECT SUM(e.amount) FROM expenses e
         WHERE e.category_id = b.category_id AND e.date BETWEEN ? AND ?
       ), 0) as spent
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     ORDER BY c.sort_order ASC`,
    period.start,
    period.end
  );
}

/**
 * What has been spent on a single category inside the given period. Returns 0
 * rather than null when the category has no expenses in the month.
 */
export async function getCategorySpentInPeriod(
  db: SQLiteDatabase,
  categoryId: number,
  period: BudgetPeriod
): Promise<number> {
  const result = await db.getFirstAsync<{ total: number }>(
    "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE category_id = ? AND date BETWEEN ? AND ?",
    categoryId,
    period.start,
    period.end
  );
  return result?.total ?? 0;
}

export async function updateBudgetLimit(
  db: SQLiteDatabase,
  id: number,
  limitAmount: number
): Promise<void> {
  assertKoboAmount(limitAmount, "limit");

  await db.runAsync(
    "UPDATE budgets SET limit_amount = ?, updated_at = datetime('now') WHERE id = ?",
    limitAmount,
    id
  );
}

export async function deleteBudget(
  db: SQLiteDatabase,
  id: number
): Promise<void> {
  await db.runAsync("DELETE FROM budgets WHERE id = ?", id);
}
