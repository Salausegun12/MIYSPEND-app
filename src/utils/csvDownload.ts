import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export type CsvExportErrorCode =
  | "sharing-unavailable"
  | "file-write"
  | "file-sharing";

export class CsvExportError extends Error {
  constructor(
    public readonly code: CsvExportErrorCode,
    message: string
  ) {
    super(message);
    this.name = "CsvExportError";
  }
}

/**
 * Writes the CSV report to the device cache and opens the OS share/save
 * sheet. Fully local: the file never leaves the device except through the
 * share target the user picks.
 */
export async function downloadCsvReport(
  csv: string,
  filename: string
): Promise<void> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new CsvExportError(
        "sharing-unavailable",
        "Sharing is not available on this device. Use Expo Go or a rebuilt app to save the CSV."
      );
    }
  } catch (error) {
    if (error instanceof CsvExportError) throw error;
    console.warn("Unable to check CSV sharing availability:", error);
    throw new CsvExportError(
      "sharing-unavailable",
      "Sharing is not available on this device. Use Expo Go or a rebuilt app to save the CSV."
    );
  }

  let file: File;
  try {
    const next = new File(Paths.cache, filename);
    if (!next.exists) {
      next.create();
    }
    next.write(csv);
    file = next;
  } catch (error) {
    console.warn("Unable to write CSV export:", error);
    throw new CsvExportError(
      "file-write",
      "The CSV could not be written to this device. Please try again."
    );
  }

  try {
    await Sharing.shareAsync(file.uri, {
      dialogTitle: `Save ${filename}`,
      mimeType: "text/csv",
      UTI: "public.comma-separated-values-text",
    });
  } catch (error) {
    console.warn("Unable to share CSV export:", error);
    throw new CsvExportError(
      "file-sharing",
      "The CSV was created, but the save dialog could not open. Rebuild the app after adding expo-sharing."
    );
  }
}