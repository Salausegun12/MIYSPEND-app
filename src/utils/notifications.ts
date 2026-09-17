import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const REMINDER_NOTIFICATION_ID = "miyspend-daily-reminder";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function getNotificationPermissionStatus(): Promise<string> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export async function scheduleDailyReminder(timeHHmm: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    REMINDER_NOTIFICATION_ID
  ).catch(() => {});

  const [hours, minutes] = timeHHmm.split(":").map(Number);

  const now = new Date();
  const trigger = new Date();
  trigger.setHours(hours, minutes, 0, 0);

  if (trigger <= now) {
    trigger.setDate(trigger.getDate() + 1);
  }

  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_NOTIFICATION_ID,
    content: {
      title: "MiySpend Reminder",
      body: "\uD83D\uDCB0 Don't forget your spending today.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hours,
      minute: minutes,
    },
  });
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    REMINDER_NOTIFICATION_ID
  ).catch(() => {});
}

export async function getScheduledReminderTime(): Promise<string | null> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const reminder = scheduled.find((n) => n.identifier === REMINDER_NOTIFICATION_ID);
  if (!reminder) return null;

  const trigger = reminder.trigger as { hour?: number; minute?: number };
  if (trigger.hour !== undefined && trigger.minute !== undefined) {
    const h = String(trigger.hour).padStart(2, "0");
    const m = String(trigger.minute).padStart(2, "0");
    return `${h}:${m}`;
  }
  return null;
}
