import type { SQLiteDatabase } from "expo-sqlite";
import { addExpense } from "../../database/expenses";
import { addIncome } from "../../database/income";
import {
  isVoiceDraftReady,
  voiceDraftFingerprint,
} from "./parser";
import type { VoiceDuplicateGuard } from "./duplicateGuard";
import type { VoiceDraft } from "./types";

export type VoiceSaveStatus = "saved" | "duplicate" | "incomplete";

export interface VoiceSaveResult {
  status: VoiceSaveStatus;
  /** Row id of the created record when status is "saved". */
  id?: number;
  message: string;
}

/**
 * Writes a fully-clarified voice draft using the same database services (and
 * kobo conventions) as the manual add screens. Returns without saving when the
 * draft is incomplete or the exact transaction was just written.
 */
export async function confirmAndSaveVoiceDraft(
  db: SQLiteDatabase,
  draft: VoiceDraft,
  guard: VoiceDuplicateGuard
): Promise<VoiceSaveResult> {
  if (!isVoiceDraftReady(draft) || draft.amountKobo === null) {
    return {
      status: "incomplete",
      message: "Some details are still missing. Please answer the questions.",
    };
  }

  const fingerprint = voiceDraftFingerprint(draft);
  if (guard.isDuplicate(fingerprint)) {
    return {
      status: "duplicate",
      message: "This entry was already saved a moment ago.",
    };
  }

  const paymentMethod = draft.paymentMethod ?? "Cash";

  if (draft.type === "expense" && draft.categoryId !== null) {
    const id = await addExpense(db, {
      amount: draft.amountKobo,
      category_id: draft.categoryId,
      description: draft.description,
      payment_method: paymentMethod,
      note: "",
      date: `${draft.date} ${draft.time}:00`,
    });
    guard.record(fingerprint);
    return { status: "saved", id, message: "Expense saved successfully" };
  }

  if (draft.type === "income" && draft.source) {
    const note =
      draft.description &&
      draft.description.toLowerCase() !== draft.source.toLowerCase()
        ? draft.description
        : "";
    const id = await addIncome(db, {
      amount: draft.amountKobo,
      source: draft.source,
      payment_method: paymentMethod,
      note,
      income_date: draft.date,
      income_time: draft.time,
    });
    guard.record(fingerprint);
    return { status: "saved", id, message: "Income saved successfully" };
  }

  return {
    status: "incomplete",
    message: "Some details are still missing. Please answer the questions.",
  };
}
