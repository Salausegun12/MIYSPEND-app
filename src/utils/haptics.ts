import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

const supported = Platform.OS === "ios" || Platform.OS === "android";

async function run(fn: () => Promise<void>) {
  if (!supported) return;
  try {
    await fn();
  } catch {
    // Haptics are best-effort; never let them break a user action.
  }
}

export const haptics = {
  select: () =>
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  press: () =>
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),

  success: () =>
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),

  warning: () =>
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),

  error: () =>
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
