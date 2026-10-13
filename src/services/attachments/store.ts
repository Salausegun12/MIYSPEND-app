import { attachmentStorageFailed } from "./responses";
import type { AttachmentError, AttachmentStore, PickedPhoto } from "./types";

/**
 * The store used before the app registers the native one. Persisting fails
 * with a gentle storage error so a broken environment never blocks saving the
 * expense itself.
 */
class UnavailableAttachmentStore implements AttachmentStore {
  async persist(): Promise<string> {
    throw {
      kind: "storage",
      message: attachmentStorageFailed(),
    } satisfies AttachmentError;
  }

  async remove(): Promise<void> {
    /* nothing to remove */
  }

  owns(_uri: string | null | undefined): boolean {
    return false;
  }
}

export const unavailableAttachmentStore = new UnavailableAttachmentStore();

const ROOT = "memory://attachments/";

/** Test-facing view of the in-memory store. */
export interface InMemoryAttachmentStore extends AttachmentStore {
  /** URIs currently held by the store. */
  readonly uris: string[];
  /** True when the given durable URI still references a stored file. */
  has(uri: string): boolean;
}

/**
 * A deterministic, fully in-memory store for tests. It mimics the native store
 * closely enough to exercise the app's save/replace/remove file lifecycle
 * without touching a real filesystem.
 */
export function createInMemoryAttachmentStore(): InMemoryAttachmentStore {
  const files = new Map<string, string>();
  let counter = 0;

  return {
    get uris() {
      return [...files.keys()];
    },
    has(uri: string) {
      return files.has(uri);
    },
    async persist(photo: PickedPhoto) {
      counter += 1;
      const uri = `${ROOT}${Date.now()}-${counter}`;
      files.set(uri, photo.uri);
      return uri;
    },
    async remove(uri: string | null | undefined) {
      if (typeof uri === "string") files.delete(uri);
    },
    owns(uri: string | null | undefined) {
      return typeof uri === "string" && uri.startsWith(ROOT);
    },
  };
}

let activeStore: AttachmentStore = unavailableAttachmentStore;

/** Installs the store the app should use. */
export function registerAttachmentStore(store: AttachmentStore): void {
  activeStore = store;
}

export function getAttachmentStore(): AttachmentStore {
  return activeStore;
}

export function resetAttachmentStore(): void {
  activeStore = unavailableAttachmentStore;
}
