import type { VoiceRecognitionError } from "./types";

/**
 * Maps a speech-engine error into the app's gentle, privacy-conscious error
 * contract. Kept pure (no native imports) so it can be tested in Node.
 *
 * @param code Web Speech API style error code from expo-speech-recognition.
 * @param fallback Message when the engine reports something unexpected.
 */
export function mapExpoRecognitionError(
  code: string,
  fallback = "I couldn't hear you clearly. Please try again.",
): VoiceRecognitionError {
  switch (code) {
    case "not-allowed":
      return {
        kind: "permission_denied",
        message: "Microphone permission is needed to record by voice.",
      };
    case "no-speech":
    case "speech-timeout":
      return {
        kind: "no_speech",
        message: "I didn't catch that. Please try again.",
      };
    case "aborted":
      return {
        kind: "unknown",
        message: "Voice entry was cancelled.",
      };
    case "network":
      return {
        kind: "unavailable",
        message:
          "Speech recognition needs an internet connection. Check your connection and try again.",
      };
    case "service-not-allowed":
      return {
        kind: "unavailable",
        message:
          "This device has no speech recognition service available. You can type instead.",
      };
    case "audio-capture":
      return {
        kind: "unavailable",
        message:
          "I couldn't start the microphone. Please check your device's mic settings.",
      };
    case "busy":
      return {
        kind: "unavailable",
        message: "The recognizer is busy right now. Please try again in a moment.",
      };
    case "language-not-supported":
      return {
        kind: "unavailable",
        message:
          "Your device's speech recogniser doesn't support that language. Try again, or type instead.",
      };
    case "interrupted":
      return {
        kind: "unavailable",
        message: "Voice entry was interrupted. Please try again.",
      };
    default:
      return { kind: "unknown", message: fallback };
  }
}