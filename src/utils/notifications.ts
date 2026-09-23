import { Platform } from "react-native";

const REMINDER_NOTIFICATION_ID = "miyspend-daily-reminder";

type NotificationsModule = typeof import("expo-notifications");

let modulePromise: Promise<NotificationsModule | null> | null = null;

/**
 * expo-notifications is not available in Expo Go on Android from SDK 53
 * (importing it throws at module load). Load it lazily and swallow the error
 * so the rest of the app still works; feature calls then report unavailability.
 */
async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (Platform.OS === "web") {
    return null;
  }

  if (!modulePromise) {
    modulePromise = (async () => {
      try {
        const mod = await import("expo-notifications");
        mod.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
        return mod;
      } catch (e) {
        console.warn("Notifications unavailable:", e);
        return null;
      }
    })();
  }

  return modulePromise;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const mod = await getNotificationsModule();
  if (!mod) return false;

  const { status: existing } = await mod.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await mod.requestPermissionsAsync();
  return status === "granted";
}

export async function getNotificationPermissionStatus(): Promise<string> {
  const mod = await getNotificationsModule();
  if (!mod) return "unsupported";

  const { status } = await mod.getPermissionsAsync();
  return status;
}

export async function scheduleDailyReminder(timeHHmm: string): Promise<void> {
  const mod = await getNotificationsModule();
  if (!mod) {
    throw new Error("Notifications are not supported in this build.");
  }

  await mod
    .cancelScheduledNotificationAsync(REMINDER_NOTIFICATION_ID)
    .catch(() => {});

  const [hours, minutes] = timeHHmm.split(":").map(Number);

  await mod.scheduleNotificationAsync({
    identifier: REMINDER_NOTIFICATION_ID,
    content: {
      title: "MiySpend Reminder",
      body: "\uD83D\uDCB0 Don't forget your spending today.",
      sound: true,
    },
    trigger: {
      type: mod.SchedulableTriggerInputTypes.DAILY,
      hour: hours,
      minute: minutes,
    },
  });
}

export async function cancelDailyReminder(): Promise<void> {
  const mod = await getNotificationsModule();
  if (!mod) return;

  await mod
    .cancelScheduledNotificationAsync(REMINDER_NOTIFICATION_ID)
    .catch(() => {});
}

export async function getScheduledReminderTime(): Promise<string | null> {
  const mod = await getNotificationsModule();
  if (!mod) return null;

  const scheduled = await mod.getAllScheduledNotificationsAsync();
  const reminder = scheduled.find(
    (n) => n.identifier === REMINDER_NOTIFICATION_ID
  );
  if (!reminder) return null;

  const trigger = reminder.trigger as { hour?: number; minute?: number };
  if (trigger.hour !== undefined && trigger.minute !== undefined) {
    const h = String(trigger.hour).padStart(2, "0");
    const m = String(trigger.minute).padStart(2, "0");
    return `${h}:${m}`;
  }
  return null;
}