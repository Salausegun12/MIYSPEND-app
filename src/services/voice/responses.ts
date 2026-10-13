import type { PlanningSaveStatus } from "./types";

/**
 * Gentle, non-judgemental copy for the voice assistant.
 *
 * The assistant never scolds, pressures or blames. Every message here is a
 * short, calm sentence that points to the next step without implying the user
 * did something wrong. The spoken save confirmations deliberately contain no
 * amounts: financial figures are only read aloud when the user explicitly asks
 * for them.
 */

export function voiceListeningAck(): string {
  return "I'm listening. Take your time.";
}

export function voiceNotHeard(): string {
  return "No worries — I didn't quite catch that. You can try again or type it instead.";
}

export function voiceCancelled(): string {
  return "No changes made. That's completely fine.";
}

export function voiceSaveFailed(): string {
  return "I wasn't able to save that just now. We can try again whenever you're ready.";
}

export function voiceReadyToReview(): string {
  return "Have a look whenever you're ready, and change anything that doesn't feel right.";
}

/** A gentle confirmation to show (and optionally speak) after a review step. */
export function voiceSavedConfirmation(): string {
  return "All set — I've saved that for you.";
}

export function voiceReadAloudUnavailable(): string {
  return "Reading aloud isn't available on this device right now, so I've put the words on screen for you.";
}

export function voiceReadAloudFailed(): string {
  return "I couldn't prepare that read-aloud just now. You can try again in a moment.";
}

export function voiceReadAloudStopped(): string {
  return "Stopped.";
}

export function voiceNothingToRead(): string {
  return "There's nothing recorded to read yet. Once you add some income or spending, I can read it back to you.";
}

/**
 * The gentle phrase to speak after a save attempt. Deliberately free of
 * amounts and figures, so a confirmation never blurts out sensitive numbers.
 */
export function voiceSpokenSaveConfirmation(
  status: PlanningSaveStatus | "saved" | "duplicate" | "incomplete"
): string {
  switch (status) {
    case "saved":
      return voiceSavedConfirmation();
    case "duplicate":
      return "That looks like something I saved a moment ago, so I left it as it is.";
    case "duplicate_goal":
      return "There's already a savings goal with that name, so nothing was changed.";
    case "unknown_goal":
      return "I couldn't find that savings goal. No rush — we can try another name.";
    default:
      return "We're still missing a detail or two. Whenever you're ready, we can finish it together.";
  }
}
