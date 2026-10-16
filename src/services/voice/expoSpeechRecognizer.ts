import { Platform } from "react-native";
import { registerVoiceRecognizer } from "./recognizer";
import { mapExpoRecognitionError } from "./recognitionErrors";
import { PREFERRED_LOCALES, pickPreferredLocale } from "./language";
import type { VoiceRecognizer, VoiceRecognizerEvent } from "./types";

type SpeechRecognitionModule =
  typeof import("expo-speech-recognition")["ExpoSpeechRecognitionModule"];

const UNAVAILABLE_MESSAGE =
  "Voice needs the installed MiySpend app. You can type your command instead.";

let nativeModulePromise: Promise<SpeechRecognitionModule | null> | null = null;

/**
 * expo-speech-recognition wraps a native module that only exists in a
 * development or production build. It is NOT part of Expo Go, and importing it
 * at module scope throws "Cannot find native module 'ExpoSpeechRecognition'".
 * Because expo-router evaluates every route eagerly, that throw would take down
 * the entire app, so the module is loaded lazily and any failure degrades to the
 * typed dictation flow instead.
 */
async function loadNativeModule(): Promise<SpeechRecognitionModule | null> {
  if (Platform.OS === "web") return null;

  if (!nativeModulePromise) {
    nativeModulePromise = (async () => {
      try {
        const mod = await import("expo-speech-recognition");
        return mod.ExpoSpeechRecognitionModule ?? null;
      } catch {
        return null;
      }
    })();
  }

  return nativeModulePromise;
}

/**
 * Records through the device microphone using expo-speech-recognition (iOS
 * SFSpeechRecognizer / Android SpeechRecognizer). Recognition is delegated to
 * the platform recogniser, which may use the network when the device has no
 * offline model for the chosen language; only the resulting transcript reaches
 * the parser. The chosen language is one the device reports as supported, so a
 * missing offline model cannot fail recognition before the user speaks.
 *
 * This module imports a native Expo module, so it is deliberately kept out of
 * the voice barrel file: only the app screens import it (through a small hook),
 * which keeps the pure voice services loadable in Node tests.
 */
class ExpoSpeechRecognizer implements VoiceRecognizer {
  readonly id = "expo-speech-recognition";
  readonly label = "Device speech recognition";
  readonly offline = false;

  private listeners = new Set<(event: VoiceRecognizerEvent) => void>();
  private nativeListeners: { remove(): void }[] = [];
  private attached = false;
  private started = false;

  private attach(module: SpeechRecognitionModule): void {
    if (this.attached) return;
    this.attached = true;
    this.nativeListeners = [
      module.addListener("start", () => {
        this.started = true;
        this.emit({ type: "listening" });
      }),
      module.addListener("end", () => {
        this.started = false;
        this.emit({ type: "end" });
      }),
      module.addListener("result", (event) => {
        if (!event.isFinal) return;
        const transcript = event.results?.[0]?.transcript?.trim();
        if (!transcript) return;
        this.emit({ type: "transcript", text: transcript, isFinal: true });
        this.started = false;
        this.emit({ type: "end" });
      }),
      module.addListener("error", (event) => {
        this.started = false;
        this.emit({ type: "error", error: mapExpoRecognitionError(event.error) });
      }),
    ];
  }

  async isAvailable(): Promise<boolean> {
    try {
      const module = await loadNativeModule();
      if (!module) return false;
      return module.isRecognitionAvailable();
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    if (this.started) return;

    const module = await loadNativeModule();
    if (!module) {
      this.emitUnavailable();
      return;
    }
    this.attach(module);

    const available = await this.isAvailable();
    if (!available) {
      this.emitServiceUnavailable();
      return;
    }

    const permission = await module.requestPermissionsAsync();
    if (!permission.granted) {
      this.emit({
        type: "error",
        error: {
          kind: "permission_denied",
          message: "Microphone permission is needed to record by voice.",
        },
      });
      return;
    }

    try {
      module.start({
        lang: await resolveLanguage(module),
        continuous: false,
        interimResults: true,
        // Offline-only recognition fails on devices without the language model,
        // so allow the platform recogniser to use its online service.
        requiresOnDeviceRecognition: false,
      });
    } catch {
      this.started = false;
      this.emitUnavailable();
    }
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    try {
      const module = await loadNativeModule();
      module?.stop();
    } catch {
      this.started = false;
      this.emit({ type: "end" });
    }
  }

  async cancel(): Promise<void> {
    try {
      const module = await loadNativeModule();
      module?.abort();
    } finally {
      this.started = false;
    }
  }

  subscribe(listener: (event: VoiceRecognizerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitUnavailable(): void {
    this.emit({
      type: "error",
      error: { kind: "unavailable", message: UNAVAILABLE_MESSAGE },
    });
  }

  private emitServiceUnavailable(): void {
    this.emit({
      type: "error",
      error: {
        kind: "unavailable",
        message:
          "No speech recognition service is available on this device. You can type instead.",
      },
    });
  }

  private emit(event: VoiceRecognizerEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

/**
 * Chooses a language the device's recogniser supports, so a missing offline
 * model can't fail recognition before the user speaks. Falls back to the first
 * preferred locale when the device can't report its locales (Android 12 and
 * below `getSupportedLocales` returns an empty list).
 */
async function resolveLanguage(
  module: SpeechRecognitionModule,
): Promise<string> {
  try {
    const { locales } = await module.getSupportedLocales({});
    return pickPreferredLocale(locales ?? []);
  } catch {
    return PREFERRED_LOCALES[0];
  }
}

export const expoSpeechRecognizer = new ExpoSpeechRecognizer();

/** Makes the on-device engine the active recognizer. Safe to call repeatedly. */
export function registerExpoSpeechRecognizer(): VoiceRecognizer {
  registerVoiceRecognizer(expoSpeechRecognizer);
  return expoSpeechRecognizer;
}
