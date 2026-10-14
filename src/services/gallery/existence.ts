import type { AttachmentExistence } from "./types";

/**
 * The checker used when no on-device checker has been registered yet. It
 * assumes every file is present so the gallery still renders in tests and
 * previews; the native adapter verifies real files at runtime.
 */
class UnavailableAttachmentExistence implements AttachmentExistence {
  exists(): boolean {
    return true;
  }
}

export const unavailableAttachmentExistence: AttachmentExistence =
  new UnavailableAttachmentExistence();

/** Test-facing view of the in-memory existence checker. */
export interface InMemoryAttachmentExistence extends AttachmentExistence {
  /** The set of URIs currently treated as present. */
  readonly present: Set<string>;
  /** Marks a URI as present. */
  register(uri: string): void;
}

/**
 * A deterministic existence checker for tests. Only URIs that have been
 * registered (or passed as the initial set) count as present, so missing files
 * and deleted expenses are easy to simulate.
 */
export function createInMemoryAttachmentExistence(
  initial: Iterable<string> = []
): InMemoryAttachmentExistence {
  const present = new Set(initial);
  return {
    present,
    register(uri: string) {
      present.add(uri);
    },
    exists(uri: string) {
      return present.has(uri);
    },
  };
}

let activeExistence: AttachmentExistence = unavailableAttachmentExistence;

/**
 * Installs the checker the app should use. The native checker is registered at
 * startup by the gallery hook; until then files are assumed present.
 */
export function registerAttachmentExistence(existence: AttachmentExistence): void {
  activeExistence = existence;
}

export function getAttachmentExistence(): AttachmentExistence {
  return activeExistence;
}

export function resetAttachmentExistence(): void {
  activeExistence = unavailableAttachmentExistence;
}