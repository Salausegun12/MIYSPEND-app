import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSQLiteContext } from "expo-sqlite";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { AnimatedEntry } from "../components/ui/AnimatedEntry";
import { Card } from "../components/ui/Card";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Shadows } from "../constants/shadows";
import { Typography } from "../constants/typography";
import { Spacing } from "../constants/spacing";
import { Pressed } from "../constants/motion";
import { INCOME_SOURCE_COLORS, INCOME_SOURCE_ICONS } from "../constants/income";
import {
  getIncomeById,
  updateIncome,
  deleteIncome,
} from "../database/income";
import {
  nairaToKobo,
  koboToNaira,
  parseNairaAmount,
  formatKoboAmount,
} from "../utils/money";
import type { Income, IncomeSource, PaymentMethod } from "../types/database";
import { INCOME_SOURCES, PAYMENT_METHODS } from "../types/database";

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
  return dateStringToDate(dateStr).toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDisplayTime(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return timeStr;
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

export default function IncomeDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [income, setIncome] = useState<Income | null>(null);
  const [editing, setEditing] = useState(false);

  const [amount, setAmount] = useState("");
  const [selectedSource, setSelectedSource] = useState<IncomeSource | "">("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<
    PaymentMethod | ""
  >("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [note, setNote] = useState("");

  const [errors, setErrors] = useState<{
    amount?: string;
    source?: string;
    paymentMethod?: string;
  }>({});

  const savingRef = useRef(false);

  const applyIncomeToForm = useCallback((record: Income) => {
    setAmount(String(koboToNaira(record.amount)));
    setSelectedSource(record.source as IncomeSource);
    setSelectedPaymentMethod(record.payment_method as PaymentMethod);
    setNote(record.note);
    setEditDate(record.income_date);
    setEditTime(record.income_time);
  }, []);

  const loadIncome = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const record = await getIncomeById(db, Number(id));
      if (record) {
        setIncome(record);
        applyIncomeToForm(record);
      }
    } catch (e) {
      console.warn("Failed to load income:", e);
    } finally {
      setLoading(false);
    }
  }, [db, id, applyIncomeToForm]);

  useEffect(() => {
    loadIncome();
  }, [loadIncome]);

  function clearError(field: keyof typeof errors) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function validate(): boolean {
    const next: typeof errors = {};
    const parsed = parseNairaAmount(amount);
    if (!amount.trim() || isNaN(parsed) || parsed <= 0 || nairaToKobo(parsed) <= 0) {
      next.amount = "Enter a valid amount";
    }
    if (!selectedSource) {
      next.source = "Select an income source";
    }
    if (!selectedPaymentMethod) {
      next.paymentMethod = "Select a payment method";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (savingRef.current) return;
    if (!income) return;
    if (!validate()) return;

    savingRef.current = true;
    setSaving(true);
    try {
      const amountKobo = nairaToKobo(parseNairaAmount(amount));

      // Updates the row in place. No INSERT, so the id and the record count
      // stay the same instead of creating a second income entry.
      await updateIncome(db, income.id, {
        amount: amountKobo,
        source: selectedSource as string,
        payment_method: selectedPaymentMethod as string,
        note: note.trim(),
        income_date: editDate,
        income_time: editTime,
      });

      setEditing(false);
      await loadIncome();
      Alert.alert("Success", "Income updated successfully");
    } catch (e) {
      console.warn("Failed to update income:", e);
      Alert.alert("Error", "Failed to update income. Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!income || deleting) return;
    Alert.alert(
      "Delete Income",
      "Are you sure you want to delete this income? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (deleting) return;
            setDeleting(true);
            try {
              await deleteIncome(db, income.id);
              router.back();
            } catch (e) {
              console.warn("Failed to delete income:", e);
              Alert.alert("Error", "Failed to delete income.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  function onDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (event.type === "set" && selectedDate) {
      setEditDate(toDateString(selectedDate));
    }
  }

  function onTimeChange(event: DateTimePickerEvent, selectedTime?: Date) {
    if (Platform.OS === "android") {
      setShowTimePicker(false);
    }
    if (event.type === "set" && selectedTime) {
      setEditTime(toTimeString(selectedTime));
    }
  }

  function cancelEdit() {
    if (!income) return;
    setEditing(false);
    applyIncomeToForm(income);
    setErrors({});
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!income) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Income</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.notFound}>Income not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const source = income.source as IncomeSource;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <AnimatedEntry delay={20}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Income Details</Text>
          <View style={styles.headerActions}>
            {!editing && (
              <Pressable
                onPress={() => setEditing(true)}
                style={styles.headerButton}
                accessibilityRole="button"
                accessibilityLabel="Edit income"
              >
                <Ionicons name="pencil-outline" size={20} color={Colors.primary} />
              </Pressable>
            )}
            <Pressable
              onPress={handleDelete}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel="Delete income"
            >
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
            </Pressable>
          </View>
        </View>
      </AnimatedEntry>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!editing ? (
          <>
            <AnimatedEntry delay={40}>
              <LinearGradient
                colors={Colors.gradient.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroSection}
              >
                <View style={styles.heroIconChip}>
                  <Ionicons
                    name={INCOME_SOURCE_ICONS[source] ?? "wallet-outline"}
                    size={28}
                    color={Colors.white}
                  />
                </View>
                <Text style={styles.heroAmount}>
                  {formatKoboAmount(income.amount)}
                </Text>
                <Text style={styles.heroSource}>{source}</Text>
              </LinearGradient>
            </AnimatedEntry>

            <AnimatedEntry delay={100}>
              <Card style={styles.detailsCard}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Source</Text>
                  <Text style={styles.detailValue}>{source}</Text>
                </View>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Payment Method</Text>
                  <Text style={styles.detailValue}>
                    {income.payment_method}
                  </Text>
                </View>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>
                    {formatDisplayDate(income.income_date)}
                  </Text>
                </View>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Time</Text>
                  <Text style={styles.detailValue}>
                    {formatDisplayTime(income.income_time)}
                  </Text>
                </View>
                {income.note ? (
                  <>
                    <View style={styles.detailDivider} />
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Note</Text>
                      <Text style={styles.detailValue}>{income.note}</Text>
                    </View>
                  </>
                ) : null}
              </Card>
            </AnimatedEntry>
          </>
        ) : (
          <>
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
              <Text style={styles.label}>Income Source</Text>
              {errors.source ? (
                <Text style={styles.error}>{errors.source}</Text>
              ) : null}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {INCOME_SOURCES.map((option) => {
                  const active = selectedSource === option;
                  const color = INCOME_SOURCE_COLORS[option];
                  return (
                    <Pressable
                      key={option}
                      onPress={() => {
                        setSelectedSource(option);
                        clearError("source");
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        active && {
                          borderColor: color,
                          backgroundColor: color + "15",
                        },
                        pressed && styles.chipPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Ionicons
                        name={INCOME_SOURCE_ICONS[option]}
                        size={16}
                        color={active ? color : Colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.chipLabel,
                          active && { color, fontWeight: "600" },
                        ]}
                      >
                        {option}
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
                  accessibilityLabel={`Choose date, ${formatDisplayDate(
                    editDate
                  )}`}
                  style={({ pressed }) => [pressed && styles.datePickerPressed]}
                >
                  <Card style={styles.dateCard}>
                    <View style={styles.dateRow}>
                      <Ionicons
                        name="calendar-outline"
                        size={18}
                        color={Colors.primary}
                      />
                      <Text style={styles.dateValue}>
                        {formatDisplayDate(editDate)}
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
                  accessibilityLabel={`Choose time, ${formatDisplayTime(
                    editTime
                  )}`}
                  style={({ pressed }) => [pressed && styles.datePickerPressed]}
                >
                  <Card style={styles.dateCard}>
                    <View style={styles.dateRow}>
                      <Ionicons
                        name="time-outline"
                        size={18}
                        color={Colors.primary}
                      />
                      <Text style={styles.dateValue}>
                        {formatDisplayTime(editTime)}
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              </View>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={dateStringToDate(editDate)}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onDateChange}
                maximumDate={new Date()}
              />
            )}

            {showTimePicker && (
              <DateTimePicker
                value={timeStringToDate(editTime)}
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
                accessibilityLabel="Done"
              >
                <Text style={styles.pickerDoneText}>Done</Text>
              </Pressable>
            )}

            {Platform.OS === "ios" && showTimePicker && (
              <Pressable
                onPress={() => setShowTimePicker(false)}
                style={styles.pickerDone}
                accessibilityRole="button"
                accessibilityLabel="Done"
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

            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={cancelEdit} />
              <Button
                title="Save Changes"
                onPress={handleSave}
                loading={saving}
                disabled={saving}
              />
            </View>
          </>
        )}
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
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.base,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  notFound: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  heroSection: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
    borderRadius: Radius.xxl,
    ...Shadows.md,
  },
  heroIconChip: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.white + "26",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAmount: {
    ...Typography.display,
    color: Colors.white,
  },
  heroSource: {
    ...Typography.bodyMedium,
    color: Colors.white + "CC",
  },
  detailsCard: {
    gap: Spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: Spacing.xs,
  },
  detailLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    flex: 2,
    textAlign: "right",
  },
  detailDivider: {
    height: 1,
    backgroundColor: Colors.border,
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
  chipLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  chipLabelActive: {
    color: Colors.primary,
    fontWeight: "600",
  },
  noteInput: {
    height: 80,
    textAlignVertical: "top",
    paddingTop: Spacing.md,
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
  pickerDone: {
    alignSelf: "flex-end",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.base,
  },
  pickerDoneText: {
    ...Typography.bodyMedium,
    color: Colors.primary,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.base,
    paddingVertical: Spacing.base,
  },
});
