import type { AttachmentStore } from "../attachments/types";

/**
 * A photo-bearing expense that retention has decided is older than the rolling
 * 28-day gallery window.
 */
export interface ExpiredAttachmentRecord {
  /** The expense row. Only the image link is touched, never the transaction. */
  id: number;
  attachment_uri: string;
}

/**
 * The pieces the retention cleanup needs. Kept behind a small dependency
 * object so the orchestration can run against a real database in the app and a
 * `TestDb` under Node, and so a store can be injected for tests.
 */
export interface PhotoRetentionDeps {
  /** Expenses with a photo recorded before `beforeDateKey`. */
  listExpiredAttachments: (
    beforeDateKey: string
  ) => Promise<ExpiredAttachmentRecord[]>;
  /** Clears the photo reference on every such row; returns rows changed. */
  clearExpiredReferences: (beforeDateKey: string) => Promise<number>;
  /** How many live expenses still reference a given URI (after clearing). */
  countReferences: (uri: string) => Promise<number>;
  /** Used to delete owned files; defaults to the app's registered store. */
  store?: AttachmentStore;
}

export interface PhotoRetentionSummary {
  /** Expired photo-bearing records found before cleanup. */
  checked: number;
  /** Database rows whose image link was cleared. */
  refsCleared: number;
  /** Files deleted (or already gone after a successful remove call). */
  filesRemoved: number;
  /** Files whose deletion threw; their link is already cleared so it is safe. */
  filesFailed: number;
  /** Files deliberately kept: shared with a live expense or not ours. */
  filesKept: number;
}