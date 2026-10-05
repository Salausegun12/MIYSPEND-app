import { SQLiteDatabase } from "expo-sqlite";
import type { Income } from "../types/database";

function assertKoboAmount(amount: number): void {
  if (!Number.isInteger(amount)) {
    throw new Error("Income amount must be an integer number of kobo");
  }
}

export async function addIncome(
  db: SQLiteDatabase,
  income: {
    amount: number;
    source: string;
    payment_method: string;
    note: string;
    income_date: string;
    income_time: string;
  }
): Promise<number> {
  assertKoboAmount(income.amount);

  const result = await db.runAsync(
    "INSERT INTO income (amount, source, payment_method, note, income_date, income_time) VALUES (?, ?, ?, ?, ?, ?)",
    income.amount,
    income.source,
    income.payment_method,
    income.note,
    income.income_date,
    income.income_time
  );
  return result.lastInsertRowId;
}

export async function getIncomeById(
  db: SQLiteDatabase,
  id: number
): Promise<Income | null> {
  return db.getFirstAsync<Income>("SELECT * FROM income WHERE id = ?", id);
}

export async function getAllIncome(
  db: SQLiteDatabase,
  limit?: number,
  offset?: number
): Promise<Income[]> {
  let query = "SELECT * FROM income ORDER BY income_date DESC, income_time DESC, created_at DESC";
  const params: number[] = [];

  if (limit !== undefined) {
    query += " LIMIT ?";
    params.push(limit);
    if (offset !== undefined) {
      query += " OFFSET ?";
      params.push(offset);
    }
  }

  return db.getAllAsync<Income>(query, ...params);
}

export async function getIncomeByDateRange(
  db: SQLiteDatabase,
  startDate: string,
  endDate: string
): Promise<Income[]> {
  return db.getAllAsync<Income>(
    "SELECT * FROM income WHERE income_date BETWEEN ? AND ? ORDER BY income_date DESC, income_time DESC, created_at DESC",
    startDate,
    endDate
  );
}

export async function updateIncome(
  db: SQLiteDatabase,
  id: number,
  income: {
    amount?: number;
    source?: string;
    payment_method?: string;
    note?: string;
    income_date?: string;
    income_time?: string;
  }
): Promise<void> {
  const fields: string[] = [];
  const values: (number | string)[] = [];

  if (income.amount !== undefined) {
    assertKoboAmount(income.amount);
    fields.push("amount = ?");
    values.push(income.amount);
  }
  if (income.source !== undefined) {
    fields.push("source = ?");
    values.push(income.source);
  }
  if (income.payment_method !== undefined) {
    fields.push("payment_method = ?");
    values.push(income.payment_method);
  }
  if (income.note !== undefined) {
    fields.push("note = ?");
    values.push(income.note);
  }
  if (income.income_date !== undefined) {
    fields.push("income_date = ?");
    values.push(income.income_date);
  }
  if (income.income_time !== undefined) {
    fields.push("income_time = ?");
    values.push(income.income_time);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await db.runAsync(`UPDATE income SET ${fields.join(", ")} WHERE id = ?`, ...values);
}

export async function deleteIncome(
  db: SQLiteDatabase,
  id: number
): Promise<void> {
  await db.runAsync("DELETE FROM income WHERE id = ?", id);
}
