import * as Speech from "expo-speech";
import { registerVoiceSpeaker } from "./speech";
import type {
  VoiceSpeechOptions,
  VoiceSpeaker,
  VoiceSpeakerEvent,
} from "./types";

/**
 * Reads text aloud using the device's built-in text-to-speech engine via
 * expo-speech. The engine uses voices installed on the device, so no text is
 * ever sent to a server.
 *
 * This module imports a native Expo module, so it is deliberately kept out of
 * the voice barrel file: only the app screens import it (through the
 * useVoicePlayback hook), which keeps the pure voice services loadable in Node
 * tests.
 */
class ExpoSpeechSpeaker implements VoiceSpeaker {
  readonly id = "expo-speech";
  readonly label = "On-device text-to-speech";
  readonly offline = true;

  private listeners = new Set<(event: VoiceSpeakerEvent) => void>();
  private speaking = false;

  async isAvailable(): Promise<boolean> {
    try {
      await Speech.getAvailableVoicesAsync();
      return true;
    } catch {
      return false;
    }
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  async speak(text: string, options?: VoiceSpeechOptions): Promise<void> {
    const clean = text.trim();
    if (!clean) return;

    this.speaking = true;
    this.emit({ type: "start", text: clean });

    await new Promise<void>((resolve) => {
      let settled = false;
      const settle = (event: VoiceSpeakerEvent) => {
        if (settled) return;
        settled = true;
        this.speaking = false;
        this.emit(event);
        resolve();
      };

      Speech.speak(clean, {
        // Slightly slower and softer than the default for a calm delivery.
        rate: options?.rate ?? 0.95,
        pitch: options?.pitch ?? 1,
        language: options?.language ?? "en-NG",
        onDone: () => settle({ type: "done", text: clean, interrupted: false }),
        onStopped: () => settle({ type: "stopped" }),
        onError: () =>
          settle({
            type: "error",
            error: {
              kind: "failed",
              message:
                "I couldn't read that out just now. The words are on screen.",
            },
          }),
      });
    });
  }

  async stop(): Promise<void> {
    try {
      await Speech.stop();
    } finally {
      this.speaking = false;
    }
  }

  subscribe(listener: (event: VoiceSpeakerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: VoiceSpeakerEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export const expoSpeechSpeaker = new ExpoSpeechSpeaker();

/** Makes the on-device engine the active speaker. Safe to call repeatedly. */
export function registerExpoSpeechSpeaker(): VoiceSpeaker {
  registerVoiceSpeaker(expoSpeechSpeaker);
  return expoSpeechSpeaker;
}
