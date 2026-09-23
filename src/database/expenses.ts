import { SQLiteDatabase } from "expo-sqlite";
import type { ExpenseWithCategory } from "../types/database";

export async function addExpense(
  db: SQLiteDatabase,
  expense: {
    amount: number;
    category_id: number;
    description: string;
    payment_method: string;
    note: string;
    date: string;
  }
): Promise<number> {
  const result = await db.runAsync(
    "INSERT INTO expenses (amount, category_id, description, payment_method, note, date) VALUES (?, ?, ?, ?, ?, ?)",
    expense.amount,
    expense.category_id,
    expense.description,
    expense.payment_method,
    expense.note,
    expense.date
  );
  return result.lastInsertRowId;
}

export async function updateExpense(
  db: SQLiteDatabase,
  id: number,
  expense: {
    amount?: number;
    category_id?: number;
    description?: string;
    payment_method?: string;
    note?: string;
    date?: string;
  }
): Promise<void> {
  const fields: string[] = [];
  const values: (number | string)[] = [];

  if (expense.amount !== undefined) {
    fields.push("amount = ?");
    values.push(expense.amount);
  }
  if (expense.category_id !== undefined) {
    fields.push("category_id = ?");
    values.push(expense.category_id);
  }
  if (expense.description !== undefined) {
    fields.push("description = ?");
    values.push(expense.description);
  }
  if (expense.payment_method !== undefined) {
    fields.push("payment_method = ?");
    values.push(expense.payment_method);
  }
  if (expense.note !== undefined) {
    fields.push("note = ?");
    values.push(expense.note);
  }
  if (expense.date !== undefined) {
    fields.push("date = ?");
    values.push(expense.date);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await db.runAsync(
    `UPDATE expenses SET ${fields.join(", ")} WHERE id = ?`,
    ...values
  );
}

export async function deleteExpense(
  db: SQLiteDatabase,
  id: number
): Promise<void> {
  await db.runAsync("DELETE FROM expenses WHERE id = ?", id);
}

export async function getExpenseById(
  db: SQLiteDatabase,
  id: number
): Promise<ExpenseWithCategory | null> {
  return db.getFirstAsync<ExpenseWithCategory>(
    `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
     FROM expenses e
     JOIN categories c ON e.category_id = c.id
     WHERE e.id = ?`,
    id
  );
}

export async function getAllExpenses(
  db: SQLiteDatabase,
  limit?: number,
  offset?: number
): Promise<ExpenseWithCategory[]> {
  let query = `
    SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM expenses e
    JOIN categories c ON e.category_id = c.id
    ORDER BY e.date DESC, e.created_at DESC
  `;
  const params: (number | string)[] = [];

  if (limit !== undefined) {
    query += " LIMIT ?";
    params.push(limit);
    if (offset !== undefined) {
      query += " OFFSET ?";
      params.push(offset);
    }
  }

  return db.getAllAsync<ExpenseWithCategory>(query, ...params);
}

export async function getExpensesByDateRange(
  db: SQLiteDatabase,
  startDate: string,
  endDate: string
): Promise<ExpenseWithCategory[]> {
  return db.getAllAsync<ExpenseWithCategory>(
    `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
     FROM expenses e
     JOIN categories c ON e.category_id = c.id
     WHERE e.date BETWEEN ? AND ?
     ORDER BY e.date DESC, e.created_at DESC`,
    startDate,
    endDate
  );
}

export async function getExpensesByCategory(
  db: SQLiteDatabase,
  categoryId: number
): Promise<ExpenseWithCategory[]> {
  return db.getAllAsync<ExpenseWithCategory>(
    `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
     FROM expenses e
     JOIN categories c ON e.category_id = c.id
     WHERE e.category_id = ?
     ORDER BY e.date DESC, e.created_at DESC`,
    categoryId
  );
}

export async function getTotalExpenses(
  db: SQLiteDatabase,
  startDate?: string,
  endDate?: string
): Promise<number> {
  let query = "SELECT COALESCE(SUM(amount), 0) as total FROM expenses";
  const params: string[] = [];

  if (startDate && endDate) {
    query += " WHERE date BETWEEN ? AND ?";
    params.push(startDate, endDate);
  }

  const result = await db.getFirstAsync<{ total: number }>(query, ...params);
  return result?.total ?? 0;
}

export async function getTodayExpenseCount(
  db: SQLiteDatabase,
  today: string
): Promise<number> {
  const result = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM expenses WHERE date LIKE ?",
    `${today}%`
  );
  return result?.count ?? 0;
}
