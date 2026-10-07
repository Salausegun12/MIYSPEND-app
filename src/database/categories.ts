import type { SQLiteDatabase } from "expo-sqlite";
import type { Category } from "../types/database";

export async function getAllCategories(
  db: SQLiteDatabase
): Promise<Category[]> {
  return db.getAllAsync<Category>(
    "SELECT * FROM categories ORDER BY sort_order ASC"
  );
}

export async function getCategoryById(
  db: SQLiteDatabase,
  id: number
): Promise<Category | null> {
  return db.getFirstAsync<Category>(
    "SELECT * FROM categories WHERE id = ?",
    id
  );
}

export async function addCategory(
  db: SQLiteDatabase,
  category: { name: string; icon: string; color: string }
): Promise<number> {
  const maxOrder = await db.getFirstAsync<{ max_order: number }>(
    "SELECT COALESCE(MAX(sort_order), 0) as max_order FROM categories"
  );
  const sortOrder = (maxOrder?.max_order ?? 0) + 1;

  const result = await db.runAsync(
    "INSERT INTO categories (name, icon, color, sort_order) VALUES (?, ?, ?, ?)",
    category.name,
    category.icon,
    category.color,
    sortOrder
  );
  return result.lastInsertRowId;
}

export async function updateCategory(
  db: SQLiteDatabase,
  id: number,
  category: { name?: string; icon?: string; color?: string }
): Promise<void> {
  const fields: string[] = [];
  const values: string[] = [];

  if (category.name !== undefined) {
    fields.push("name = ?");
    values.push(category.name);
  }
  if (category.icon !== undefined) {
    fields.push("icon = ?");
    values.push(category.icon);
  }
  if (category.color !== undefined) {
    fields.push("color = ?");
    values.push(category.color);
  }

  if (fields.length === 0) return;

  values.push(String(id));
  await db.runAsync(
    `UPDATE categories SET ${fields.join(", ")} WHERE id = ?`,
    ...values
  );
}

export async function deleteCategory(
  db: SQLiteDatabase,
  id: number
): Promise<void> {
  await db.runAsync("DELETE FROM categories WHERE id = ?", id);
}
