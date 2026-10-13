/**
 * Types for optional expense receipt photos.
 *
 * Attachments are entirely device-local: a picked or captured photo is copied
 * into the app's own document storage and only its URI is recorded against the
 * expense. Nothing is ever uploaded, and none of these values feed into money
 * calculations.
 */

/** Where a photo can come from. */
export type AttachmentSource = "camera" | "library";

/** Why an attachment action could not complete, in a form the UI can map to copy. */
export type AttachmentErrorKind =
  | "permission-denied"
  | "unsupported"
  | "storage"
  | "failed";

export interface AttachmentError {
  kind: AttachmentErrorKind;
  message: string;
}

/** A raw selection handed back by the platform picker, before we own the file. */
export interface PickedPhoto {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

/**
 * Opens the device camera or photo library. Implementations are registered by
 * the app (see `expoPhotoPicker`); tests inject a fake.
 */
export interface PhotoPicker {
  readonly id: string;
  /** True when this source can be opened on the current device. */
  isAvailable(source: AttachmentSource): Promise<boolean>;
  /**
   * Resolves with the chosen photo, or `null` when the user backs out.
   * Throws an `AttachmentError` (as a plain object) when permission is denied.
   */
  pick(source: AttachmentSource): Promise<PickedPhoto | null>;
}

/**
 * The app's private store for attachment files. Implementations copy picked
 * files into a location the app controls and delete files it no longer needs.
 */
export interface AttachmentStore {
  /** Copies a picked file into app storage and returns its durable URI. */
  persist(photo: PickedPhoto): Promise<string>;
  /** Deletes a managed file. Ignores null and URIs the store does not own. */
  remove(uri: string | null | undefined): Promise<void>;
  /** True when the URI points at a file this store manages. */
  owns(uri: string | null | undefined): boolean;
}

export type PickAttachmentResult =
  | { status: "picked"; photo: PickedPhoto }
  | { status: "cancelled" }
  | { status: "error"; error: AttachmentError };

export type SaveAttachmentResult =
  | { status: "saved"; uri: string }
  | { status: "error"; error: AttachmentError };
