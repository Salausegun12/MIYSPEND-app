import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Card } from "../../components/ui/Card";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import { getSetting, setSetting } from "../../database/settings";
import {
  requestNotificationPermission,
  getNotificationPermissionStatus,
  scheduleDailyReminder,
  cancelDailyReminder,
} from "../../utils/notifications";

function timeStringToDate(timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function toTimeString(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

function formatDisplayTime(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

const REMINDER_ENABLED_KEY = "daily_reminder_enabled";
const REMINDER_TIME_KEY = "reminder_time";
const DEFAULT_TIME = "20:00";

export default function SettingsScreen() {
  const db = useSQLiteContext();

  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState(DEFAULT_TIME);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      const [enabled, time] = await Promise.all([
        getSetting(db, REMINDER_ENABLED_KEY),
        getSetting(db, REMINDER_TIME_KEY),
      ]);
      setReminderEnabled(enabled === "true");
      setReminderTime(time ?? DEFAULT_TIME);

      const status = await getNotificationPermissionStatus();
      setPermissionDenied(status === "denied");
    } catch (e) {
      console.warn("Failed to load settings:", e);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings])
  );

  async function handleToggleReminder(value: boolean) {
    if (value) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        setPermissionDenied(true);
        Alert.alert(
          "Permission Required",
          "Notifications permission is needed for daily reminders. Please enable it in your device settings.",
          [{ text: "OK" }]
        );
        return;
      }
      setPermissionDenied(false);
      await scheduleDailyReminder(reminderTime);
      await setSetting(db, REMINDER_ENABLED_KEY, "true");
      setReminderEnabled(true);
    } else {
      await cancelDailyReminder();
      await setSetting(db, REMINDER_ENABLED_KEY, "false");
      setReminderEnabled(false);
    }
  }

  async function handleTimeChange(event: DateTimePickerEvent, selectedTime?: Date) {
    if (Platform.OS === "android") {
      setShowTimePicker(false);
    }
    if (event.type !== "set" || !selectedTime) return;

    const newTime = toTimeString(selectedTime);
    setReminderTime(newTime);
    await setSetting(db, REMINDER_TIME_KEY, newTime);

    if (reminderEnabled) {
      await scheduleDailyReminder(newTime);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandSection}>
          <View style={styles.brandIcon}>
            <Ionicons name="wallet" size={32} color={Colors.surface} />
          </View>
          <Text style={styles.brandName}>MiySpend</Text>
          <Text style={styles.brandTagline}>Track your spending wisely</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Reminders</Text>
          <Card style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons
                  name="notifications-outline"
                  size={22}
                  color={Colors.primary}
                />
                <View style={styles.settingText}>
                  <Text style={styles.settingTitle}>Daily Reminder</Text>
                  <Text style={styles.settingDesc}>
                    Get reminded to log your expenses
                  </Text>
                </View>
              </View>
              <Switch
                value={reminderEnabled}
                onValueChange={handleToggleReminder}
                trackColor={{ false: Colors.disabled, true: Colors.primaryLight }}
                thumbColor={reminderEnabled ? Colors.surface : Colors.surface}
              />
            </View>

            {reminderEnabled && (
              <>
                <View style={styles.settingDivider} />
                <Pressable
                  onPress={() => setShowTimePicker(true)}
                  style={styles.settingRow}
                >
                  <View style={styles.settingInfo}>
                    <Ionicons
                      name="time-outline"
                      size={22}
                      color={Colors.primary}
                    />
                    <View style={styles.settingText}>
                      <Text style={styles.settingTitle}>Reminder Time</Text>
                      <Text style={styles.settingDesc}>
                        {formatDisplayTime(reminderTime)} daily
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={Colors.textSecondary}
                  />
                </Pressable>
              </>
            )}

            {permissionDenied && (
              <>
                <View style={styles.settingDivider} />
                <View style={styles.permissionWarning}>
                  <Ionicons
                    name="warning-outline"
                    size={18}
                    color={Colors.warning}
                  />
                  <Text style={styles.permissionText}>
                    Notification permission denied. Enable it in device settings to use reminders.
                  </Text>
                </View>
              </>
            )}
          </Card>
        </View>

        {showTimePicker && (
          <DateTimePicker
            value={timeStringToDate(reminderTime)}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={handleTimeChange}
          />
        )}

        {Platform.OS === "ios" && showTimePicker && (
          <Pressable
            onPress={() => setShowTimePicker(false)}
            style={styles.pickerDone}
          >
            <Text style={styles.pickerDoneText}>Done</Text>
          </Pressable>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>About</Text>
          <Card style={styles.card}>
            <View style={styles.aboutRow}>
              <Ionicons
                name="information-circle-outline"
                size={22}
                color={Colors.primary}
              />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>MiySpend</Text>
                <Text style={styles.settingDesc}>Version 1.0.0</Text>
              </View>
            </View>
            <View style={styles.settingDivider} />
            <View style={styles.aboutRow}>
              <Ionicons
                name="server-outline"
                size={22}
                color={Colors.primary}
              />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Storage</Text>
                <Text style={styles.settingDesc}>
                  All data stored locally on your device
                </Text>
              </View>
            </View>
            <View style={styles.settingDivider} />
            <View style={styles.aboutRow}>
              <Ionicons
                name="shield-checkmark-outline"
                size={22}
                color={Colors.primary}
              />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Privacy</Text>
                <Text style={styles.settingDesc}>
                  No data leaves your device. No account required.
                </Text>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    ...Typography.h1,
    color: Colors.textPrimary,
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  brandSection: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  brandIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    ...Typography.h2,
    color: Colors.primary,
  },
  brandTagline: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  card: {
    padding: Spacing.sm,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.xs,
  },
  settingInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  settingText: {
    flex: 1,
    gap: 2,
  },
  settingTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  settingDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  settingDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  permissionWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  permissionText: {
    ...Typography.bodySmall,
    color: Colors.warning,
    flex: 1,
  },
  aboutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  pickerDone: {
    alignSelf: "flex-end",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.base,
  },
  pickerDoneText: {
    ...Typography.bodyMedium,
    color: Colors.primary,
  },
});
