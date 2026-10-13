import type {
  VoiceSpeechError,
  VoiceSpeechOptions,
  VoiceSpeaker,
  VoiceSpeakerEvent,
} from "./types";

/**
 * The speaker used when no on-device text-to-speech engine is available. It is
 * the guaranteed fallback the app ships with: it produces no audio, reports
 * itself as unavailable, and rejects `speak()` with a gentle message so the
 * screens can show the words on screen instead.
 */
class UnavailableVoiceSpeaker implements VoiceSpeaker {
  readonly id = "unavailable";
  readonly label = "Text on screen";
  readonly offline = true;

  async isAvailable(): Promise<boolean> {
    return false;
  }

  isSpeaking(): boolean {
    return false;
  }

  async speak(
    _text: string,
    _options?: VoiceSpeechOptions
  ): Promise<void> {
    throw {
      kind: "unavailable",
      message:
        "Reading aloud isn't available on this device right now. The words are on screen for you.",
    } satisfies VoiceSpeechError;
  }

  async stop(): Promise<void> {
    /* nothing is playing */
  }

  subscribe(_listener: (event: VoiceSpeakerEvent) => void): () => void {
    return () => {};
  }
}

export const unavailableVoiceSpeaker = new UnavailableVoiceSpeaker();

/**
 * A deterministic, fully-offline speaker used by tests and as an optional
 * "queued utterance" engine. `speak()` resolves when the utterance finishes,
 * is stopped, or is interrupted by the next `speak()`.
 */
class InMemoryVoiceSpeakerImpl implements VoiceSpeaker {
  readonly id = "in-memory";
  readonly label = "In-memory (test)";
  readonly offline = true;

  private listeners = new Set<(event: VoiceSpeakerEvent) => void>();
  private speaking = false;
  private utterances: string[] = [];
  private settleCurrent: (() => void) | null = null;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  /** Every utterance handed to `speak()`, in order. */
  get spoken(): string[] {
    return [...this.utterances];
  }

  async speak(text: string, _options?: VoiceSpeechOptions): Promise<void> {
    const clean = text.trim();
    if (!clean) return;

    // A new utterance interrupts whatever was playing.
    if (this.speaking) this.finishCurrent("interrupted");

    this.utterances.push(clean);
    this.speaking = true;
    this.emit({ type: "start", text: clean });

    await new Promise<void>((resolve) => {
      this.settleCurrent = resolve;
    });
  }

  /** Simulates the device finishing the current utterance. */
  finish(interrupted = false): void {
    if (!this.speaking) return;
    this.finishCurrent(interrupted ? "interrupted" : "done");
  }

  async stop(): Promise<void> {
    if (!this.speaking) return;
    this.finishCurrent("stopped");
  }

  subscribe(listener: (event: VoiceSpeakerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private finishCurrent(reason: "done" | "stopped" | "interrupted"): void {
    const text = this.utterances[this.utterances.length - 1] ?? "";
    this.speaking = false;
    if (reason === "stopped") {
      this.emit({ type: "stopped" });
    } else {
      this.emit({ type: "done", text, interrupted: reason === "interrupted" });
    }
    const settle = this.settleCurrent;
    this.settleCurrent = null;
    settle?.();
  }

  private emit(event: VoiceSpeakerEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

/** Test-facing view of the in-memory speaker with its playback controls. */
export interface InMemoryVoiceSpeaker extends VoiceSpeaker {
  /** Every utterance handed to `speak()`, in order. */
  readonly spoken: string[];
  /** Simulates the device finishing the current utterance. */
  finish(interrupted?: boolean): void;
}

/** Creates a fresh in-memory speaker. Intended for tests and previews. */
export function createInMemoryVoiceSpeaker(): InMemoryVoiceSpeaker {
  return new InMemoryVoiceSpeakerImpl();
}

let activeSpeaker: VoiceSpeaker = unavailableVoiceSpeaker;

/**
 * Installs the speaker the app should use. The native engine is registered at
 * startup; until then speech reports itself as unavailable.
 */
export function registerVoiceSpeaker(speaker: VoiceSpeaker): void {
  activeSpeaker = speaker;
}

export function getVoiceSpeaker(): VoiceSpeaker {
  return activeSpeaker;
}

export function resetVoiceSpeaker(): void {
  activeSpeaker = unavailableVoiceSpeaker;
}

export function toSpeechError(error: unknown): VoiceSpeechError {
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "message" in error
  ) {
    return error as VoiceSpeechError;
  }
  return {
    kind: "failed",
    message: "I couldn't read that out just now. The words are on screen.",
  };
}
