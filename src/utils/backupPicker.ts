import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";

export type BackupPickerErrorCode = "pick-failed" | "file-read";

export class BackupPickerError extends Error {
  constructor(
    public readonly code: BackupPickerErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BackupPickerError";
  }
}

export type PickedBackupFile =
  | { cancelled: true; text: null; name: null }
  | { cancelled: false; text: string; name: string };

const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

/**
 * Opens the OS document picker for a single JSON backup file and reads its
 * contents locally. Returns `cancelled: true` if the user backs out.
 */
export async function pickBackupFile(): Promise<PickedBackupFile> {
  let result: DocumentPicker.DocumentPickerResult;
  try {
    result = await DocumentPicker.getDocumentAsync({
      type: "application/json",
      copyToCacheDirectory: true,
      multiple: false,
    });
  } catch (error) {
    console.warn("Unable to open the backup file picker:", error);
    throw new BackupPickerError(
      "pick-failed",
      "The document picker could not be opened. Please try again."
    );
  }

  if (result.canceled || result.assets.length === 0) {
    return { cancelled: true, text: null, name: null };
  }

  const asset = result.assets[0];
  if (typeof asset.size === "number" && asset.size > MAX_BACKUP_BYTES) {
    throw new BackupPickerError(
      "file-read",
      "This backup file is too large to restore."
    );
  }

  try {
    const file = new File(asset.uri);
    if (!file.exists) {
      throw new BackupPickerError(
        "file-read",
        "The selected file could not be opened."
      );
    }
    const text = await file.text();
    return { cancelled: false, text, name: asset.name };
  } catch (error) {
    if (error instanceof BackupPickerError) throw error;
    console.warn("Unable to read the selected backup file:", error);
    throw new BackupPickerError(
      "file-read",
      "The selected file could not be read. Is it a MiySpend backup?"
    );
  }
}