import { useCallback, useRef, useState } from "react";
import { expoAttachmentStore } from "./expoAttachmentStore";
import { expoPhotoPicker } from "./expoPhotoPicker";
import { registerPhotoPicker } from "./picker";
import { pickAttachmentPhoto } from "./service";
import { registerAttachmentStore } from "./store";
import type { AttachmentSource, PickAttachmentResult } from "./types";

/**
 * Registers the on-device picker and file store once and exposes a small
 * controller to the expense screens. Kept in its own module (importing native
 * Expo modules and React) so the pure attachment services stay testable.
 */
let engineRegistered = false;

function ensureEngine(): void {
  if (engineRegistered) return;
  registerPhotoPicker(expoPhotoPicker);
  registerAttachmentStore(expoAttachmentStore);
  engineRegistered = true;
}

export interface ExpensePhotoController {
  /** True while the camera or library is open. */
  busy: boolean;
  /** Opens the camera or library and returns the raw selection. */
  pick: (source: AttachmentSource) => Promise<PickAttachmentResult>;
}

export function useExpensePhoto(): ExpensePhotoController {
  const registered = useRef(false);
  if (!registered.current) {
    ensureEngine();
    registered.current = true;
  }

  const [busy, setBusy] = useState(false);

  const pick = useCallback(async (source: AttachmentSource) => {
    setBusy(true);
    try {
      return await pickAttachmentPhoto(source);
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, pick };
}
