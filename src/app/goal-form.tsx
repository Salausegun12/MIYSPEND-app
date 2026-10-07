import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedEntry } from "../components/ui/AnimatedEntry";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { usePopup } from "../components/popup/PopupProvider";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Spacing } from "../constants/spacing";
import { Pressed } from "../constants/motion";
import { Typography } from "../constants/typography";
import {
  createGoal,
  getGoalById,
  updateGoal,
} from "../database/savingsGoals";
import { formatShortDate, getTodayString } from "../utils/date";
import { formatKoboAmount, nairaToKobo, parseNairaAmount } from "../utils/money";
import type { SavingsGoal } from "../types/database";

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateString(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

export default function GoalFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const popup = usePopup();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goalId = id ? Number(id) : null;
  const isEditing = goalId !== null && !Number.isNaN(goalId);

  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    amount?: string;
    date?: string;
  }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isEditing || !goalId) {
      setLoading(false);
      return;
    }
    try {
      const existing = await getGoalById(db, goalId);
      setGoal(existing);
      if (existing) {
        setName(existing.name);
        setAmount((existing.target_amount / 100).toString());
        setTargetDate(existing.target_date);
        setNote(existing.note);
      }
    } catch (e) {
      console.warn("Failed to load goal:", e);
    } finally {
      setLoading(false);
    }
  }, [db, goalId, isEditing]);

  useEffect(() => {
    load();
  }, [load]);

  function validate(): boolean {
    const next: typeof errors = {};

    if (!name.trim()) {
      next.name = "Enter a goal name";
    }
    const parsed = parseNairaAmount(amount);
    if (!amount.trim() || Number.isNaN(parsed) || parsed <= 0) {
      next.amount = "Enter a valid target amount";
    }
    if (targetDate && targetDate < getTodayString()) {
      next.date = "Target date cannot be in the past";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    if (saving) return;

    setSaving(true);
    try {
      const targetKobo = nairaToKobo(parseNairaAmount(amount));

      if (isEditing && goalId) {
        await updateGoal(db, goalId, {
          name: name.trim(),
          target_amount: targetKobo,
          target_date: targetDate,
          note: note.trim(),
        });
      } else {
        await createGoal(db, {
          name: name.trim(),
          target_amount: targetKobo,
          target_date: targetDate,
          note: note.trim(),
        });
      }

      popup.success(
        isEditing
          ? "Your changes have been saved."
          : "Goal created. Add contributions as you save towards it."
      );
      router.back();
    } catch (e) {
      console.warn("Failed to save goal:", e);
      popup.error(e instanceof Error ? e.message : "Failed to save goal.");
    } finally {
      setSaving(false);
    }
  }

  function onDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (event.type === "set" && selected) {
      setTargetDate(toDateString(selected));
      setErrors((e) => ({ ...e, date: undefined }));
    }
  }

  function clearDate() {
    setTargetDate(null);
    setErrors((e) => ({ ...e, date: undefined }));
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeButton}
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {isEditing ? "Edit Goal" : "New Goal"}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <AnimatedEntry delay={40}>
            <Card>
              <Input
                label="Goal name"
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
                }}
                placeholder="Emergency Fund"
                error={errors.name}
                autoCapitalize="sentences"
                returnKeyType="next"
              />

              <View style={styles.field}>
                <Text style={styles.label}>Target amount</Text>
                <View
                  style={[styles.amountWrap, errors.amount && styles.wrapError]}
                >
                  <Text style={styles.currency}>₦</Text>
                  <Input
                    value={amount}
                    onChangeText={(t) => {
                      setAmount(t);
                      if (errors.amount)
                        setErrors((e) => ({ ...e, amount: undefined }));
                    }}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    style={styles.amountInput}
                    accessibilityLabel="Target amount in naira"
                  />
                </View>
                {errors.amount ? (
                  <Text style={styles.error}>{errors.amount}</Text>
                ) : null}
                {isEditing && goal ? (
                  <Text style={styles.helper}>
                    Currently {formatKoboAmount(goal.current_amount)} saved of{" "}
                    {formatKoboAmount(goal.target_amount)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Target date (optional)</Text>
                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  style={({ pressed }) => [
                    styles.dateButton,
                    pressed && styles.pressed,
                    errors.date && styles.wrapError,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Choose target date"
                >
                  <Text style={styles.dateText}>
                    {targetDate ? formatShortDate(targetDate) : "No target date"}
                  </Text>
                  <View style={styles.dateActions}>
                    {targetDate ? (
                      <Pressable
                        onPress={clearDate}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Remove target date"
                      >
                        <Ionicons
                          name="close-circle"
                          size={20}
                          color={Colors.textSecondary}
                        />
                      </Pressable>
                    ) : null}
                    <Ionicons
                      name="calendar-outline"
                      size={20}
                      color={Colors.primary}
                    />
                  </View>
                </Pressable>
                {errors.date ? (
                  <Text style={styles.error}>{errors.date}</Text>
                ) : null}
                {showDatePicker ? (
                  <DateTimePicker
                    value={
                      targetDate
                        ? parseDateString(targetDate)
                        : new Date()
                    }
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "default"}
                    minimumDate={new Date()}
                    onChange={onDateChange}
                  />
                ) : null}
              </View>

              <Input
                label="Note (optional)"
                value={note}
                onChangeText={setNote}
                placeholder="Anything worth remembering"
                autoCapitalize="sentences"
                multiline
                numberOfLines={3}
                style={styles.noteInput}
              />
            </Card>
          </AnimatedEntry>

          <AnimatedEntry delay={80}>
            <Button
              title={isEditing ? "Save Changes" : "Create Goal"}
              onPress={handleSave}
              loading={saving}
              disabled={saving}
            />
          </AnimatedEntry>
        </ScrollView>
      </KeyboardAvoidingView>
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
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginLeft: Spacing.md,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xl,
    gap: Spacing.base,
  },
  field: {
    marginTop: Spacing.base,
    gap: Spacing.xs,
  },
  label: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  amountWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
  },
  wrapError: {
    borderColor: Colors.error,
  },
  currency: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
  },
  amountInput: {
    flex: 1,
    borderWidth: 0,
    paddingVertical: Spacing.sm,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  dateText: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  dateActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  error: {
    ...Typography.caption,
    color: Colors.error,
  },
  helper: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  pressed: Pressed.default,
});
