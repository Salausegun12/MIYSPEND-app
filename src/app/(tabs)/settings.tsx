import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSQLiteContext } from "expo-sqlite";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Card } from "../../components/ui/Card";
import { AnimatedEntry } from "../../components/ui/AnimatedEntry";
import { usePopup } from "../../components/popup/PopupProvider";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Shadows } from "../../constants/shadows";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import { Pressed } from "../../constants/motion";
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

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  desc?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  noPressable?: boolean;
}

function SettingRow({ icon, iconColor = Colors.primary, title, desc, right, onPress, noPressable }: SettingRowProps) {
  const inner = (
    <View style={rowStyles.inner}>
      <View style={[rowStyles.iconWrap, { backgroundColor: iconColor + "18" }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={rowStyles.text}>
        <Text style={rowStyles.title}>{title}</Text>
        {desc ? <Text style={rowStyles.desc}>{desc}</Text> : null}
      </View>
      {right ? <View style={rowStyles.right}>{right}</View> : null}
    </View>
  );

  if (noPressable || !onPress) {
    return <View style={rowStyles.row}>{inner}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [rowStyles.row, pressed && rowStyles.rowPressed]}
      accessibilityRole="button"
    >
      {inner}
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  rowPressed: Pressed.default,
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  desc: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  right: {
    // placeholder
  },
});

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const popup = usePopup();
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState(DEFAULT_TIME);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [notificationsAvailable, setNotificationsAvailable] = useState(true);
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
      if (status === "unsupported") {
        setNotificationsAvailable(false);
        setPermissionDenied(false);
      } else {
        setNotificationsAvailable(true);
        setPermissionDenied(status === "denied");
      }
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
    if (value && !notificationsAvailable) {
      setPermissionDenied(false);
      popup.alert(
        "Reminders Unavailable",
        "Daily reminders require a development build and aren't available in Expo Go on Android.",
        { type: "warning" }
      );
      return;
    }

    if (value) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        setPermissionDenied(true);
        popup.alert(
          "Permission Required",
          "Notifications permission is needed for daily reminders. Please enable it in your device settings.",
          { type: "warning" }
        );
        return;
      }
      setPermissionDenied(false);
      try {
        await scheduleDailyReminder(reminderTime);
        await setSetting(db, REMINDER_ENABLED_KEY, "true");
        setReminderEnabled(true);
      } catch (e) {
        console.warn("Failed to schedule reminder:", e);
        popup.error(
          "Could not enable reminders on this device. Please try again."
        );
      }
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

    if (reminderEnabled && notificationsAvailable) {
      try {
        await scheduleDailyReminder(newTime);
      } catch (e) {
        console.warn("Failed to reschedule reminder:", e);
      }
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
      <AnimatedEntry delay={20}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
      </AnimatedEntry>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Brand hero card ── */}
        <AnimatedEntry delay={40}>
          <LinearGradient
            colors={Colors.gradient.hero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandCard}
          >
            <View style={styles.brandBubble1} />
            <View style={styles.brandBubble2} />
            <LinearGradient
              colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0.10)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandIcon}
            >
              <Ionicons name="wallet" size={30} color={Colors.white} />
            </LinearGradient>
            <Text style={styles.brandName}>MiySpend</Text>
            <Text style={styles.brandTagline}>Track your spending wisely</Text>
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>v1.0.0</Text>
            </View>
          </LinearGradient>
        </AnimatedEntry>

        {/* ── Reminders section ── */}
        <AnimatedEntry delay={60}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Reminders</Text>
            <Card style={styles.card}>
              <SettingRow
                icon="notifications-outline"
                title="Daily Reminder"
                desc="Get reminded to log your expenses"
                noPressable
                right={
                  <Switch
                    value={reminderEnabled}
                    onValueChange={handleToggleReminder}
                    disabled={!notificationsAvailable}
                    trackColor={{ false: Colors.disabled, true: Colors.primaryLight }}
                    thumbColor={Colors.surface}
                    accessibilityRole="switch"
                    accessibilityLabel="Daily reminder"
                    accessibilityHint="Choose whether to receive a daily reminder to log expenses"
                    accessibilityState={{
                      checked: reminderEnabled,
                      disabled: !notificationsAvailable,
                    }}
                  />
                }
              />

              {!notificationsAvailable && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.warningRow}>
                    <View style={[styles.warningIcon, { backgroundColor: Colors.warningSoft }]}>
                      <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                    </View>
                    <Text style={styles.warningText}>
                      Daily reminders aren't available in Expo Go on Android. Install a development build.
                    </Text>
                  </View>
                </>
              )}

              {reminderEnabled && (
                <>
                  <View style={styles.divider} />
                  <SettingRow
                    icon="time-outline"
                    title="Reminder Time"
                    desc={`${formatDisplayTime(reminderTime)} daily`}
                    onPress={() => setShowTimePicker(true)}
                    right={<Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />}
                  />
                </>
              )}

              {permissionDenied && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.warningRow}>
                    <View style={[styles.warningIcon, { backgroundColor: Colors.warningSoft }]}>
                      <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                    </View>
                    <Text style={styles.warningText}>
                      Notification permission denied. Enable it in device settings to use reminders.
                    </Text>
                  </View>
                </>
              )}
            </Card>
          </View>
        </AnimatedEntry>

        {/* ── About section ── */}
        <AnimatedEntry delay={80}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>About</Text>
            <Card style={styles.card}>
              <SettingRow
                icon="information-circle-outline"
                title="MiySpend"
                desc="Version 1.0.0"
                noPressable
              />
              <View style={styles.divider} />
              <SettingRow
                icon="server-outline"
                title="Storage"
                desc="All data stored locally on your device"
                noPressable
              />
              <View style={styles.divider} />
              <SettingRow
                icon="shield-checkmark-outline"
                iconColor={Colors.success}
                title="Privacy"
                desc="No data leaves your device. No account required."
                noPressable
              />
            </Card>
          </View>
        </AnimatedEntry>

        {/* ── Built with ── */}
        <AnimatedEntry delay={100}>
          <View style={styles.builtWith}>
            <Ionicons name="heart" size={12} color={Colors.error} />
            <Text style={styles.builtWithText}>Built with ❤️ for your financial wellbeing</Text>
          </View>
        </AnimatedEntry>
      </ScrollView>

      {showTimePicker && (
        <DateTimePicker
          value={timeStringToDate(reminderTime)}
          mode="time"
          is24Hour={false}
          onChange={handleTimeChange}
        />
      )}
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

  // Brand hero
  brandCard: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    borderRadius: Radius.xxl,
    overflow: "hidden",
    ...Shadows.lg,
  },
  brandBubble1: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(255,255,255,0.06)",
    top: -30,
    right: -30,
  },
  brandBubble2: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.05)",
    bottom: -20,
    left: -20,
  },
  brandIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    ...Shadows.md,
  },
  brandName: {
    ...Typography.h2,
    color: Colors.white,
    marginTop: Spacing.xs,
  },
  brandTagline: {
    ...Typography.bodySmall,
    color: "rgba(255,255,255,0.7)",
  },
  brandBadge: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    marginTop: Spacing.xs,
  },
  brandBadgeText: {
    ...Typography.caption,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
  },

  // Sections
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: Spacing.xs,
  },
  card: {
    padding: 0,
    overflow: "hidden",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginHorizontal: Spacing.base,
  },

  // Warning row
  warningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  warningIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  warningText: {
    ...Typography.caption,
    color: Colors.warning,
    flex: 1,
    lineHeight: 18,
  },

  // Built with
  builtWith: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
  },
  builtWithText: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
});
