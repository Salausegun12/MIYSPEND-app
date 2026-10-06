import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { AnimatedEntry } from "../components/ui/AnimatedEntry";
import { Card } from "../components/ui/Card";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Typography } from "../constants/typography";
import { Spacing } from "../constants/spacing";
import { Pressed } from "../constants/motion";
import { addExpense } from "../database/expenses";
import { getAllCategories } from "../database/categories";
import { nairaToKobo, parseNairaInput } from "../utils/money";
import type { Category, PaymentMethod } from "../types/database";
import { PAYMENT_METHODS } from "../types/database";

function getTodayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getNowTimeString(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

function dateStringToDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

function timeStringToDate(timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function formatDisplayDate(dateStr: string): string {
  const d = dateStringToDate(dateStr);
  return d.toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDisplayTime(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeString(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

export default function AddExpenseScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  );
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<
    PaymentMethod | ""
  >("");
  const [date, setDate] = useState(getTodayString());
  const [time, setTime] = useState(getNowTimeString());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  const [errors, setErrors] = useState<{
    amount?: string;
    description?: string;
    category?: string;
    paymentMethod?: string;
  }>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const cats = await getAllCategories(db);
        if (!cancelled) {
          setCategories(cats);
        }
      } catch (e) {
        console.warn("Failed to load categories:", e);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [db]);

  function clearError(field: keyof typeof errors) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function onDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (event.type === "set" && selectedDate) {
      setDate(toDateString(selectedDate));
    }
  }

  function onTimeChange(event: DateTimePickerEvent, selectedTime?: Date) {
    if (Platform.OS === "android") {
      setShowTimePicker(false);
    }
    if (event.type === "set" && selectedTime) {
      setTime(toTimeString(selectedTime));
    }
  }

  function validate(): boolean {
    const next: typeof errors = {};

    const parsed = parseNairaInput(amount);
    if (!amount.trim() || isNaN(parsed) || parsed <= 0) {
      next.amount = "Enter a valid amount";
    }
    if (!description.trim()) {
      next.description = "Enter what you bought";
    }
    if (!selectedCategory) {
      next.category = "Select a category";
    }
    if (!selectedPaymentMethod) {
      next.paymentMethod = "Select a payment method";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    if (loading) return;

    setLoading(true);
    try {
      const parsed = parseNairaInput(amount);
      const amountKobo = nairaToKobo(parsed);
      const dateTime = `${date} ${time}:00`;

      await addExpense(db, {
        amount: amountKobo,
        category_id: selectedCategory!.id,
        description: description.trim(),
        payment_method: selectedPaymentMethod as string,
        note: note.trim(),
        date: dateTime,
      });

      Alert.alert("Success", "Expense saved successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      console.warn("Save failed:", e);
      Alert.alert("Error", "Failed to save expense. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <AnimatedEntry delay={40}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityLabel="Go back"
              hitSlop={8}
            >
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Add Expense</Text>
          </View>
        </AnimatedEntry>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Text style={styles.label}>Amount</Text>
            <View style={styles.amountRow}>
              <Text style={styles.nairaSign}>₦</Text>
              <View style={styles.amountField}>
                <Input
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={(t) => {
                    setAmount(t);
                    clearError("amount");
                  }}
                  error={errors.amount}
                />
              </View>
            </View>
          </View>

          <View>
            <Input
              label="What did you buy?"
              placeholder="e.g. Lunch at work"
              value={description}
              onChangeText={(t) => {
                setDescription(t);
                clearError("description");
              }}
              error={errors.description}
            />
          </View>

          <View>
            <Text style={styles.label}>Category</Text>
            {errors.category ? (
              <Text style={styles.error}>{errors.category}</Text>
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {categories.map((cat) => {
                const active = selectedCategory?.id === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => {
                      setSelectedCategory(cat);
                      clearError("category");
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      active && {
                        borderColor: cat.color,
                        backgroundColor: cat.color + "15",
                      },
                      pressed && styles.chipPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={styles.chipIcon}>{cat.icon}</Text>
                    <Text
                      style={[
                        styles.chipLabel,
                        active && { color: cat.color, fontWeight: "600" },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View>
            <Text style={styles.label}>Payment Method</Text>
            {errors.paymentMethod ? (
              <Text style={styles.error}>{errors.paymentMethod}</Text>
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {PAYMENT_METHODS.map((m) => {
                const active = selectedPaymentMethod === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      setSelectedPaymentMethod(m);
                      clearError("paymentMethod");
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      active && styles.chipActive,
                      pressed && styles.chipPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        active && styles.chipLabelActive,
                      ]}
                    >
                      {m}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>Date</Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Choose date, ${formatDisplayDate(date)}`}
                style={({ pressed }) => [
                  pressed && styles.datePickerPressed,
                ]}
              >
                <Card style={styles.dateCard}>
                  <View style={styles.dateRow}>
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={Colors.primary}
                    />
                    <Text style={styles.dateValue}>
                      {formatDisplayDate(date)}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>Time</Text>
              <Pressable
                onPress={() => setShowTimePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Choose time, ${formatDisplayTime(time)}`}
                style={({ pressed }) => [
                  pressed && styles.datePickerPressed,
                ]}
              >
                <Card style={styles.dateCard}>
                  <View style={styles.dateRow}>
                    <Ionicons
                      name="time-outline"
                      size={18}
                      color={Colors.primary}
                    />
                    <Text style={styles.dateValue}>
                      {formatDisplayTime(time)}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            </View>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={dateStringToDate(date)}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onDateChange}
              maximumDate={new Date()}
            />
          )}

          {showTimePicker && (
            <DateTimePicker
              value={timeStringToDate(time)}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onTimeChange}
            />
          )}

          {Platform.OS === "ios" && showDatePicker && (
            <Pressable
              onPress={() => setShowDatePicker(false)}
              style={styles.pickerDone}
              accessibilityRole="button"
            >
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          )}

          {Platform.OS === "ios" && showTimePicker && (
            <Pressable
              onPress={() => setShowTimePicker(false)}
              style={styles.pickerDone}
              accessibilityRole="button"
            >
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          )}

          <View>
            <Input
              label="Note (optional)"
              placeholder="Any additional details..."
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              style={styles.noteInput}
            />
          </View>

          <AnimatedEntry delay={160}>
            <View style={styles.footer}>
              <Button
                title="Save Expense"
                onPress={handleSave}
                loading={loading}
                disabled={loading}
              />
            </View>
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
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginLeft: Spacing.md,
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xl,
    gap: Spacing.base,
  },
  label: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  error: {
    ...Typography.caption,
    color: Colors.error,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  nairaSign: {
    ...Typography.amount,
    color: Colors.primary,
  },
  amountField: {
    flex: 1,
  },
  chips: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.xs,
  },
  chipActive: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  chipPressed: Pressed.default,
  chipIcon: {
    fontSize: 16,
  },
  chipLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  chipLabelActive: {
    color: Colors.primary,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: Spacing.base,
  },
  half: {
    flex: 1,
    gap: Spacing.xs,
  },
  dateCard: {
    padding: Spacing.sm,
  },
  datePickerPressed: Pressed.subtle,
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dateValue: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
  },
  noteInput: {
    height: 80,
    textAlignVertical: "top",
    paddingTop: Spacing.md,
  },
  footer: {
    paddingVertical: Spacing.base,
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
