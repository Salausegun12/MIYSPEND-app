import { getAttachmentStore } from "../attachments/store";
import { galleryWindowStart } from "../gallery/service";
import type {
  ExpiredAttachmentRecord,
  PhotoRetentionDeps,
  PhotoRetentionSummary,
} from "./types";

/**
 * Automatic retention of expense receipt photos.
 *
 * Rule (documented): a photo is attached to an expense at record time, so that
 * expense's recorded date (`expense.date`, `"YYYY-MM-DD HH:MM:SS"`) is the
 * photo's retention date. Photos older than the rolling 28-day gallery window
 * are removed and their reference in the `expenses` table is cleared. This is
 * the same window the Reports gallery and "View more" use, so retention and
 * display can never disagree: the gallery only ever shows what retention keeps.
 *
 * Only the *image* ages out. The expense transaction stays intact — retention
 * never touches amounts, categories or any other financial field. Deletion is
 * best-effort and repeat-safe: references are cleared first so a later run (or
 * a crash mid-run) can never damage an in-window attachment, and a second run
 * finds nothing left to do. Files shared with an in-window expense are kept.
 */

/** Clear the image link of any photo older than the rolling window. */
export function retentionCutoff(now: Date = new Date()): string {
  return galleryWindowStart(now);
}

/** True when a YYYY-MM-DD key is outside the retention window. */
export function isOutsideRetention(
  dateKey: string,
  now: Date = new Date()
): boolean {
  return dateKey < retentionCutoff(now);
}

/** Unique, non-empty URIs among the expired records. */
export function collectExpiredUris(
  records: ExpiredAttachmentRecord[]
): string[] {
  const uris = new Set<string>();
  for (const record of records) {
    if (record.attachment_uri) uris.add(record.attachment_uri);
  }
  return [...uris];
}

/**
 * Runs one retention pass:
 *  1. finds expired photo-bearing rows,
 *  2. clears their references (keeping the transactions),
 *  3. deletes the files only when nothing still references them.
 *
 * Failures are contained: a file that cannot be deleted is logged via the
 * summary, its link is already gone so the expense is not blocked, and valid
 * in-window attachments are never in the candidate set.
 */
export async function runPhotoRetention(
  deps: PhotoRetentionDeps,
  now: Date = new Date()
): Promise<PhotoRetentionSummary> {
  const cutoff = retentionCutoff(now);
  const store = deps.store ?? getAttachmentStore();

  const expired = await deps.listExpiredAttachments(cutoff);
  const refsCleared = await deps.clearExpiredReferences(cutoff);

  let filesRemoved = 0;
  let filesFailed = 0;
  let filesKept = 0;

  for (const uri of collectExpiredUris(expired)) {
    if (!store.owns(uri)) {
      filesKept += 1;
      continue;
    }
    const remaining = await deps.countReferences(uri);
    if (remaining > 0) {
      filesKept += 1;
      continue;
    }
    try {
      await store.remove(uri);
      filesRemoved += 1;
    } catch {
      filesFailed += 1;
    }
  }

  return { checked: expired.length, refsCleared, filesRemoved, filesFailed, filesKept };
}