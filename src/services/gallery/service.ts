import type { ExpenseWithCategory } from "../../types/database";
import type { AttachmentExistence, GalleryPhoto } from "./types";

/**
 * Rolling window for the receipt gallery.
 *
 * Date rule (documented): MiySpend stores no separate capture timestamp. A
 * photo is attached to an expense at record time, so that expense's recorded
 * date (`expense.date`, `"YYYY-MM-DD HH:MM:SS"`) is the attachment date. The
 * gallery filters by that date and orders newest first using it. The window is
 * [today - 27 days, today], so exactly 28 calendar days are eligible regardless
 * of month length. Dates are compared as `YYYY-MM-DD` keys, which is stable,
 * timezone-safe and matches the stored format.
 */
export const GALLERY_WINDOW_DAYS = 28;

/** Formats a Date as a YYYY-MM-DD key in local time. */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** First eligible day of the rolling window as a YYYY-MM-DD key. */
export function galleryWindowStart(now: Date = new Date()): string {
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (GALLERY_WINDOW_DAYS - 1)
  );
  return formatDateKey(start);
}

/** Whether a YYYY-MM-DD key falls inside the window (today inclusive). */
export function isInsideGalleryWindow(
  dateKey: string,
  now: Date = new Date()
): boolean {
  return dateKey >= galleryWindowStart(now);
}

function expenseDateKey(expense: ExpenseWithCategory): string {
  return expense.date.slice(0, 10);
}

/** The portion of the gallery to show as the preview on the Reports screen. */
export function galleryPreview(
  photos: GalleryPhoto[],
  limit: number
): { preview: GalleryPhoto[]; hasMore: boolean } {
  return {
    preview: photos.slice(0, limit),
    hasMore: photos.length > limit,
  };
}

/**
 * Builds the gallery list: expenses recorded inside the window that still have
 * a photo file on disk, newest first (date desc, then id desc for stability).
 *
 * - Dates outside the window are ignored.
 * - Photos whose file no longer exists (or whose existence check throws) are
 *   dropped silently instead of rendering a broken tile.
 * - Deleted expenses never appear because the query only reads live expense
 *   rows; orphaned files left on disk are simply never listed.
 *
 * Pure and testable: no database or storage access here.
 */
export async function buildExpenseGallery(
  expenses: ExpenseWithCategory[],
  existence: AttachmentExistence,
  now: Date = new Date()
): Promise<GalleryPhoto[]> {
  const start = galleryWindowStart(now);

  const eligible = expenses
    .filter(
      (expense) =>
        expense.attachment_uri != null &&
        expense.attachment_uri !== "" &&
        expenseDateKey(expense) >= start
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const photos: GalleryPhoto[] = [];
  for (const expense of eligible) {
    if (!expense.attachment_uri) continue;
    let present = false;
    try {
      present = existence.exists(expense.attachment_uri);
    } catch {
      present = false;
    }
    if (!present) continue;
    photos.push({
      id: expense.id,
      uri: expense.attachment_uri,
      expenseDate: expenseDateKey(expense),
      description: expense.description,
      amountKobo: expense.amount,
      categoryName: expense.category_name,
      paymentMethod: expense.payment_method,
      note: expense.note,
    });
  }
  return photos;
}