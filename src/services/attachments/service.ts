import { getPhotoPicker } from "./picker";
import {
  attachmentFailed,
  attachmentPermissionDenied,
  attachmentStorageFailed,
  attachmentUnsupported,
} from "./responses";
import { getAttachmentStore } from "./store";
import type {
  AttachmentError,
  AttachmentErrorKind,
  AttachmentSource,
  AttachmentStore,
  PhotoPicker,
  PickedPhoto,
  PickAttachmentResult,
  SaveAttachmentResult,
} from "./types";

export interface AttachmentDeps {
  picker?: PhotoPicker;
  store?: AttachmentStore;
}

function isAttachmentError(value: unknown): value is AttachmentError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "message" in value
  );
}

function messageForKind(
  kind: AttachmentErrorKind,
  source?: AttachmentSource
): string {
  switch (kind) {
    case "permission-denied":
      return source ? attachmentPermissionDenied(source) : attachmentFailed();
    case "unsupported":
      return source ? attachmentUnsupported(source) : attachmentFailed();
    case "storage":
      return attachmentStorageFailed();
    default:
      return attachmentFailed();
  }
}

export function toAttachmentError(
  error: unknown,
  options: { source?: AttachmentSource; defaultKind?: AttachmentErrorKind } = {}
): AttachmentError {
  if (isAttachmentError(error)) return error;
  const kind = options.defaultKind ?? "failed";
  return { kind, message: messageForKind(kind, options.source) };
}

/**
 * Asks the user to take or choose a photo. Returns the raw selection; the file
 * is not yet copied into app storage, so a cancelled flow leaves nothing
 * behind.
 */
export async function pickAttachmentPhoto(
  source: AttachmentSource,
  deps: AttachmentDeps = {}
): Promise<PickAttachmentResult> {
  const picker = deps.picker ?? getPhotoPicker();
  try {
    if (!(await picker.isAvailable(source))) {
      return {
        status: "error",
        error: { kind: "unsupported", message: attachmentUnsupported(source) },
      };
    }
    const photo = await picker.pick(source);
    if (!photo || !photo.uri) return { status: "cancelled" };
    return { status: "picked", photo };
  } catch (error) {
    return {
      status: "error",
      error: toAttachmentError(error, { source }),
    };
  }
}

/**
 * Copies a picked photo into app storage and returns the durable URI to record
 * against the expense.
 */
export async function saveAttachmentPhoto(
  photo: PickedPhoto,
  deps: AttachmentDeps = {}
): Promise<SaveAttachmentResult> {
  try {
    const uri = await (deps.store ?? getAttachmentStore()).persist(photo);
    return { status: "saved", uri };
  } catch (error) {
    return {
      status: "error",
      error: toAttachmentError(error, { defaultKind: "storage" }),
    };
  }
}

/**
 * Deletes a previously saved attachment file. Best effort: only files owned by
 * the store are touched and failures are swallowed so the expense save is
 * never blocked by leftover cleanup.
 */
export async function discardAttachmentPhoto(
  uri: string | null | undefined,
  deps: AttachmentDeps = {}
): Promise<void> {
  const store = deps.store ?? getAttachmentStore();
  if (!store.owns(uri)) return;
  try {
    await store.remove(uri);
  } catch {
    /* a leftover file is harmless */
  }
}

/** True when the URI points at a file the app's store manages. */
export function isManagedAttachment(
  uri: string | null | undefined,
  store: AttachmentStore = getAttachmentStore()
): boolean {
  return store.owns(uri);
}
