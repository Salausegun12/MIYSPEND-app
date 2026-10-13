import { Directory, File, Paths } from "expo-file-system";
import type { AttachmentStore, PickedPhoto } from "./types";

const FOLDER = "attachments";

function extensionFor(photo: PickedPhoto): string {
  const fromName = photo.fileName
    ? /\.[a-z0-9]+$/i.exec(photo.fileName)?.[0]
    : undefined;
  if (fromName) return fromName.toLowerCase();

  switch (photo.mimeType?.toLowerCase()) {
    case "image/png":
      return ".png";
    case "image/heic":
    case "image/heif":
      return ".heic";
    case "image/webp":
      return ".webp";
    default:
      return ".jpg";
  }
}

/**
 * Device-local store for receipt photos. Files are copied into a private
 * `Documents/attachments` folder that the system never clears on its own and
 * that is excluded from app backups on release. The durable URI is what gets
 * recorded against the expense.
 *
 * Kept out of the attachments barrel so the pure service layer stays
 * importable under Node.
 */
class ExpoAttachmentStore implements AttachmentStore {
  readonly id = "expo-file-system";
  private readonly directory = new Directory(Paths.document, FOLDER);

  owns(uri: string | null | undefined): boolean {
    return typeof uri === "string" && uri.startsWith(this.directory.uri);
  }

  async persist(photo: PickedPhoto): Promise<string> {
    if (!this.directory.exists) {
      this.directory.create({ intermediates: true, idempotent: true });
    }
    const name = `receipt-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}${extensionFor(photo)}`;
    const destination = new File(this.directory, name);
    await new File(photo.uri).copy(destination);
    return destination.uri;
  }

  async remove(uri: string | null | undefined): Promise<void> {
    if (!this.owns(uri) || typeof uri !== "string") return;
    const file = new File(uri);
    if (file.exists) file.delete();
  }
}

export const expoAttachmentStore = new ExpoAttachmentStore();
