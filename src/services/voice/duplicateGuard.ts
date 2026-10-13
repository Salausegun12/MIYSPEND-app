/**
 * In-memory guard that remembers recently-saved voice fingerprints so the same
 * interpreted command cannot be written twice by accident (a double tap on
 * Confirm, or re-confirming the same summary after a slow save).
 *
 * Everything stays on the device; nothing is persisted or sent anywhere.
 */
export interface VoiceDuplicateGuard {
  isDuplicate(fingerprint: string): boolean;
  record(fingerprint: string, at?: number): void;
  reset(): void;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function createVoiceDuplicateGuard(
  ttlMs: number = DEFAULT_TTL_MS
): VoiceDuplicateGuard {
  const saved = new Map<string, number>();

  function prune(now: number) {
    for (const [key, at] of saved) {
      if (now - at >= ttlMs) saved.delete(key);
    }
  }

  return {
    isDuplicate(fingerprint: string): boolean {
      const now = Date.now();
      prune(now);
      return saved.has(fingerprint);
    },
    record(fingerprint: string, at: number = Date.now()): void {
      prune(at);
      saved.set(fingerprint, at);
    },
    reset(): void {
      saved.clear();
    },
  };
}

/** Shared guard used by the voice entry screen. */
export const voiceDuplicateGuard = createVoiceDuplicateGuard();
