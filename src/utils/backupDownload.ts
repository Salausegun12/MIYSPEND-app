import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export type BackupFileErrorCode =
  | "sharing-unavailable"
  | "file-write"
  | "file-sharing";

export class BackupFileError extends Error {
  constructor(
    public readonly code: BackupFileErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BackupFileError";
  }
}

/**
 * Writes the backup JSON to the device cache and opens the OS share/save
 * sheet. Fully local: the file never leaves the device except through the
 * share target the user picks.
 */
export async function downloadBackupFile(
  json: string,
  filename: string
): Promise<void> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new BackupFileError(
        "sharing-unavailable",
        "Sharing is not available on this device. Use Expo Go or a rebuilt app to save the backup."
      );
    }
  } catch (error) {
    if (error instanceof BackupFileError) throw error;
    console.warn("Unable to check backup sharing availability:", error);
    throw new BackupFileError(
      "sharing-unavailable",
      "Sharing is not available on this device. Use Expo Go or a rebuilt app to save the backup."
    );
  }

  let file: File;
  try {
    const next = new File(Paths.cache, filename);
    if (!next.exists) {
      next.create();
    }
    next.write(json);
    file = next;
  } catch (error) {
    console.warn("Unable to write backup file:", error);
    throw new BackupFileError(
      "file-write",
      "The backup could not be written to this device. Please try again."
    );
  }

  try {
    await Sharing.shareAsync(file.uri, {
      dialogTitle: `Save ${filename}`,
      mimeType: "application/json",
      UTI: "public.json",
    });
  } catch (error) {
    console.warn("Unable to share backup file:", error);
    throw new BackupFileError(
      "file-sharing",
      "The backup was created, but the save dialog could not open. Rebuild the app after adding expo-sharing."
    );
  }
}