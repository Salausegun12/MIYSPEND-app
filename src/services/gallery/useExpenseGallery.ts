import { useCallback, useEffect, useRef, useState } from "react";
import { useSQLiteContext } from "expo-sqlite";
import { getExpenseAttachments } from "../../database/expenses";
import { expoAttachmentExistence } from "./expoAttachmentExistence";
import { registerAttachmentExistence } from "./existence";
import { buildExpenseGallery, galleryWindowStart } from "./service";
import type { GalleryPhoto } from "./types";

/**
 * Registers the on-device file checker once and exposes the gallery list.
 * Kept in its own module (importing native Expo modules and React) so the pure
 * gallery service stays testable under Node.
 */
let engineRegistered = false;

function ensureEngine(): void {
  if (engineRegistered) return;
  registerAttachmentExistence(expoAttachmentExistence);
  engineRegistered = true;
}

export interface ExpenseGallery {
  photos: GalleryPhoto[];
  loading: boolean;
  failed: boolean;
  /** Re-queries the last 28 days and re-verifies the files on disk. */
  reload: () => Promise<void>;
}

export function useExpenseGallery(): ExpenseGallery {
  const db = useSQLiteContext();

  const registered = useRef(false);
  if (!registered.current) {
    ensureEngine();
    registered.current = true;
  }

  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const since = galleryWindowStart(new Date());
      const rows = await getExpenseAttachments(db, since);
      const built = await buildExpenseGallery(
        rows,
        expoAttachmentExistence,
        new Date()
      );
      setPhotos(built);
    } catch (error) {
      console.warn("Failed to load the receipt gallery:", error);
      setFailed(true);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { photos, loading, failed, reload };
}