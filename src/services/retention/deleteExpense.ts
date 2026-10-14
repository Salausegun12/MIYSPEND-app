import type { SQLiteDatabase } from "expo-sqlite";
import {
  countExpensesWithAttachmentUri,
  deleteExpense,
  getExpenseById,
} from "../../database/expenses";
import { discardAttachmentPhoto } from "../attachments/service";
import { getAttachmentStore } from "../attachments/store";
import type { AttachmentStore } from "../attachments/types";

/**
 * Deletes an expense and its stored receipt photo — but only when the photo is
 * no longer needed anywhere.
 *
 * References are checked after the row is gone: if any surviving expense still
 * uses the same URI (a defensive guard against shared files), the file is left
 * in place. Files the store does not own are never touched.
 */
export async function deleteExpenseWithPhoto(
  db: SQLiteDatabase,
  id: number,
  deps: { store?: AttachmentStore } = {}
): Promise<void> {
  const expense = await getExpenseById(db, id);
  if (!expense) return;

  await deleteExpense(db, id);

  const uri = expense.attachment_uri;
  if (!uri) return;

  const store = deps.store ?? getAttachmentStore();
  if (!store.owns(uri)) return;

  const remaining = await countExpensesWithAttachmentUri(db, uri, id);
  if (remaining === 0) {
    await discardAttachmentPhoto(uri, { store });
  }
}