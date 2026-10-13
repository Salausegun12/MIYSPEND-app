import type {
  VoiceRecognitionError,
  VoiceRecognizer,
  VoiceRecognizerEvent,
} from "./types";

/**
 * A fully-offline recognizer whose transcript is supplied by the user through
 * on-screen dictation. It is the guaranteed-available fallback the app ships
 * with: recognition never touches the network and no audio leaves the device.
 *
 * A real on-device speech engine can be registered with
 * `registerVoiceRecognizer()` without changing the parser or the screens — as
 * long as it implements the same contract and reports `offline: true`.
 */
class OfflineTranscriptRecognizer implements VoiceRecognizer {
  readonly id = "offline-transcript";
  readonly label = "On-device dictation";
  readonly offline = true;

  private listeners = new Set<(event: VoiceRecognizerEvent) => void>();
  private listening = false;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async start(): Promise<void> {
    if (this.listening) return;
    this.listening = true;
    this.emit({ type: "listening" });
  }

  async stop(): Promise<void> {
    if (!this.listening) return;
    this.listening = false;
    this.emit({ type: "end" });
  }

  async cancel(): Promise<void> {
    const wasListening = this.listening;
    this.listening = false;
    if (wasListening) this.emit({ type: "end" });
  }

  subscribe(listener: (event: VoiceRecognizerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Feeds a transcript in as if the engine had just heard it. */
  submit(transcript: string): void {
    const text = transcript.trim();
    if (!text) {
      this.emit({
        type: "error",
        error: {
          kind: "no_speech",
          message: "I didn't catch that. Please try again.",
        },
      });
      return;
    }
    this.emit({ type: "transcript", text, isFinal: true });
    this.listening = false;
    this.emit({ type: "end" });
  }

  private emit(event: VoiceRecognizerEvent) {
    for (const listener of this.listeners) listener(event);
  }
}

export const offlineTranscriptRecognizer = new OfflineTranscriptRecognizer();

let activeRecognizer: VoiceRecognizer = offlineTranscriptRecognizer;

/**
 * Installs the recognizer the app should use. Intended for an on-device engine
 * bundled in a future milestone; the app falls back to the offline dictation
 * recognizer until then.
 */
export function registerVoiceRecognizer(recognizer: VoiceRecognizer): void {
  activeRecognizer = recognizer;
}

export function getVoiceRecognizer(): VoiceRecognizer {
  return activeRecognizer;
}

export function resetVoiceRecognizer(): void {
  activeRecognizer = offlineTranscriptRecognizer;
}

export function toRecognitionError(error: unknown): VoiceRecognitionError {
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "message" in error
  ) {
    return error as VoiceRecognitionError;
  }
  return { kind: "unknown", message: "Voice recognition failed. Please try again." };
}
