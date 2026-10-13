import { useCallback, useEffect, useMemo, useState } from "react";
import { expoSpeechSpeaker } from "./expoSpeechSpeaker";
import { getVoiceSpeaker, registerVoiceSpeaker } from "./speech";
import { voiceReadAloudUnavailable } from "./responses";

/**
 * Registers the on-device text-to-speech engine once and exposes a small
 * playback controller to the screens. Kept in its own module (importing a
 * native Expo module and React) so the pure voice services stay testable.
 */
let engineRegistered = false;

function ensureEngine() {
  if (!engineRegistered) {
    registerVoiceSpeaker(expoSpeechSpeaker);
    engineRegistered = true;
  }
  return getVoiceSpeaker();
}

export interface VoicePlaybackController {
  /** True while an utterance is playing, for showing a stop button. */
  speaking: boolean;
  /** Speaks the text, or reports the gentle unavailable message. */
  play: (text: string) => Promise<void>;
  stop: () => Promise<void>;
}

export interface UseVoicePlaybackOptions {
  /** Called with a gentle message when speech is unavailable or fails. */
  onUnavailable?: (message: string) => void;
}

export function useVoicePlayback(
  options: UseVoicePlaybackOptions = {}
): VoicePlaybackController {
  const { onUnavailable } = options;
  const [speaker] = useState(ensureEngine);
  const [speaking, setSpeaking] = useState(() => speaker.isSpeaking());

  useEffect(() => {
    return speaker.subscribe((event) => {
      if (event.type === "start") setSpeaking(true);
      else if (event.type === "done" || event.type === "stopped") {
        setSpeaking(false);
      } else if (event.type === "error") {
        setSpeaking(false);
        onUnavailable?.(event.error.message);
      }
    });
  }, [speaker, onUnavailable]);

  const play = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      const available = await speaker.isAvailable();
      if (!available) {
        onUnavailable?.(voiceReadAloudUnavailable());
        return;
      }
      try {
        await speaker.speak(clean);
      } catch (error) {
        const message = voiceReadAloudUnavailable();
        setSpeaking(false);
        onUnavailable?.(message);
      }
    },
    [speaker, onUnavailable]
  );

  const stop = useCallback(async () => {
    await speaker.stop();
    setSpeaking(false);
  }, [speaker]);

  return useMemo(() => ({ speaking, play, stop }), [speaking, play, stop]);
}
