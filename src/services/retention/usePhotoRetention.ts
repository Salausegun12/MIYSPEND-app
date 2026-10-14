import { useEffect } from "react";
import { AppState } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";
import { useSQLiteContext } from "expo-sqlite";
import {
  clearExpiredAttachmentReferences,
  countExpensesWithAttachmentUri,
  getExpiredAttachments,
} from "../../database/expenses";
import { expoAttachmentStore } from "../attachments/expoAttachmentStore";
import { getAttachmentStore, registerAttachmentStore } from "../attachments/store";
import { runPhotoRetention } from "./service";

/**
 * Runs image retention in the background. Kept out of the retention barrel so
 * the pure cleanup service stays importable under Node.
 *
 * Safety: cleanup is throttled (at most once per interval), never runs
 * concurrently, waits a beat after first paint so it never competes with the
 * splash screen, and swallows its own errors. References are cleared before
 * files are deleted, so stopping the app mid-run cannot damage an in-window
 * attachment.
 */

/** How often background cleanup may start a new pass. */
export const RETENTION_INTERVAL_MS = 30 * 60 * 1000;

let storeRegistered = false;

function ensureStore(): void {
  if (storeRegistered) return;
  registerAttachmentStore(expoAttachmentStore);
  storeRegistered = true;
}

let lastRunAt = 0;
let running: Promise<void> | null = null;

function cleanupWith(db: SQLiteDatabase): Promise<void> {
  return runPhotoRetention({
    listExpiredAttachments: (before) => getExpiredAttachments(db, before),
    clearExpiredReferences: (before) => clearExpiredAttachmentReferences(db, before),
    countReferences: (uri) => countExpensesWithAttachmentUri(db, uri),
    store: getAttachmentStore(),
  }).then(
    () => undefined,
    (error) => {
      console.warn("Photo retention cleanup failed:", error);
    }
  );
}

function scheduleCleanup(db: SQLiteDatabase): void {
  const now = Date.now();
  if (now - lastRunAt < RETENTION_INTERVAL_MS) return;
  if (running) return;
  lastRunAt = now;
  running = cleanupWith(db).finally(() => {
    running = null;
  });
}

export function usePhotoRetention(): void {
  const db = useSQLiteContext();

  useEffect(() => {
    ensureStore();

    // Run once shortly after launch, then again whenever the app is resumed,
    // throttled so frequent background/foreground cycles do not repeat work.
    const initial = setTimeout(() => scheduleCleanup(db), 1500);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") scheduleCleanup(db);
    });

    return () => {
      clearTimeout(initial);
      appState.remove();
    };
  }, [db]);
}