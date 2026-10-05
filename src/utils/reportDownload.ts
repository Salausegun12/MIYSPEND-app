import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export type ReportDownloadErrorCode =
  | "sharing-unavailable"
  | "pdf-generation"
  | "pdf-sharing";

export class ReportDownloadError extends Error {
  constructor(
    public readonly code: ReportDownloadErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ReportDownloadError";
  }
}

export async function downloadSpendingReport(
  html: string,
  filename: string
): Promise<void> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new ReportDownloadError(
        "sharing-unavailable",
        "Sharing is not available on this device. Use Expo Go or a rebuilt app to save the PDF."
      );
    }
  } catch (error) {
    if (error instanceof ReportDownloadError) throw error;
    console.warn("Unable to check PDF sharing availability:", error);
    throw new ReportDownloadError(
      "sharing-unavailable",
      "Sharing is not available on this device. Use Expo Go or a rebuilt app to save the PDF."
    );
  }

  const options: Print.FilePrintOptions = {
    html,
    width: 595,
    height: 842,
  };

  if (Platform.OS === "ios") {
    options.margins = {
      top: 36,
      right: 36,
      bottom: 36,
      left: 36,
    };
  }

  let result: Print.FilePrintResult;

  try {
    result = await Print.printToFileAsync(options);
  } catch (error) {
    console.warn("Unable to create PDF report:", error);
    throw new ReportDownloadError(
      "pdf-generation",
      "The PDF could not be created. Use Expo Go or rebuild the app after adding expo-print."
    );
  }

  if (!result?.uri) {
    throw new ReportDownloadError(
      "pdf-generation",
      "The PDF renderer did not return a file on this platform."
    );
  }

  try {
    await Sharing.shareAsync(result.uri, {
      dialogTitle: `Save ${filename}`,
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
    });
  } catch (error) {
    console.warn("Unable to share PDF report:", error);
    throw new ReportDownloadError(
      "pdf-sharing",
      "The PDF was created, but the save dialog could not open. Rebuild the app after adding expo-sharing."
    );
  }
}
