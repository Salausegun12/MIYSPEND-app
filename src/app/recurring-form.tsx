import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
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
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Spacing } from "../constants/spacing";
import { Pressed } from "../constants/motion";
import { Typography } from "../constants/typography";
import {
  createRecurringTransaction,
  getRecurringById,
  updateRecurringTransaction,
  deleteRecurringTransaction,
  processDueRecurringTransactions,
} from "../database/recurring";
import { getAllCategories } from "../database/categories";
import { formatHistoryDate, getTodayString } from "../utils/date";
import {
  nairaToKobo,
  parseNairaAmount,
} from "../utils/money";
import type {
  Category,
  PaymentMethod,
  RecurringFrequency,
  RecurringTransaction,
  RecurringType,
} from "../types/database";
import { PAYMENT_METHODS, RECURRING_FREQUENCIES } from "../types/database";

const INCOME_SUGGESTIONS = [
  "Monthly salary",
  "Monthly allowance",
  "Regular freelance payment",
];

const EXPENSE_SUGGESTIONS = [
  "Rent",
  "Internet",
  "Electricity",
  "Subscriptions",
  "Loan repayment",
];

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateString(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

export default function RecurringFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const recurringId = id ? Number(id) : null;
  const isEditing = recurringId !== null && !Number.isNaN(recurringId);

  const [existing, setExisting] = useState<RecurringTransaction | null>(null);
  const [type, setType] = useState<RecurringType>("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [nextOccurrence, setNextOccurrence] = useState(getTodayString());
  const [endDate, setEndDate] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [errors, setErrors] = useState<{
    amount?: string;
    description?: string;
    category?: string;
    start?: string;
    end?: string;
  }>({});

  const load = useCallback(async () => {
    try {
      const cats = await getAllCategories(db);
      setCategories(cats);

      if (!isEditing || !recurringId) {
        return;
      }
      const existingRecord = await getRecurringById(db, recurringId);
      setExisting(existingRecord);
      if (existingRecord) {
        setType(existingRecord.type);
        setAmount((existingRecord.amount / 100).toString());
        setDescription(existingRecord.description);
        setPaymentMethod(
          (existingRecord.payment_method as PaymentMethod) || ""
        );
        setFrequency(existingRecord.frequency);
        setNextOccurrence(existingRecord.next_occurrence);
        setEndDate(existingRecord.end_date);
        setActive(existingRecord.is_active === 1);
        if (existingRecord.category_id) {
          const cat = cats.find((c) => c.id === existingRecord.category_id);
          setSelectedCategory(cat ?? null);
        } else {
          setSelectedCategory(null);
        }
      }
    } catch (e) {
      console.warn("Failed to load recurring form:", e);
    } finally {
      setLoading(false);
    }
  }, [db, isEditing, recurringId]);

  useEffect(() => {
    load();
  }, [load]);

  function clearError(field: keyof typeof errors) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function selectType(next: RecurringType) {
    setType(next);
    if (next === "income") {
      setSelectedCategory(null);
      clearError("category");
    }
  }

  function validate(): boolean {
    const next: typeof errors = {};

    const parsed = parseNairaAmount(amount);
    if (!amount.trim() || Number.isNaN(parsed) || parsed <= 0) {
      next.amount = "Enter a valid amount";
    }
    if (!description.trim()) {
      next.description =
        type === "income"
          ? "Enter the income source"
          : "Enter what this expense is for";
    }
    if (type === "expense" && !selectedCategory) {
      next.category = "Select a category";
    }
    if (!nextOccurrence) {
      next.start = "Choose the first occurrence";
    }
    if (endDate && endDate < nextOccurrence) {
      next.end = "End date must be on or after the first occurrence";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    if (saving) return;

    setSaving(true);
    try {
      const amountKobo = nairaToKobo(parseNairaAmount(amount));
      const payload = {
        type,
        amount: amountKobo,
        description: description.trim(),
        category_id: type === "expense" ? selectedCategory!.id : null,
        payment_method: paymentMethod as string,
        frequency,
        next_occurrence: nextOccurrence,
        end_date: endDate,
      };

      if (isEditing && recurringId) {
        await updateRecurringTransaction(db, recurringId, {
          ...payload,
          is_active: active ? 1 : 0,
        });
      } else {
        await createRecurringTransaction(db, payload);
      }

      await processDueRecurringTransactions(db);

      Alert.alert(
        isEditing ? "Recurring Updated" : "Recurring Created",
        isEditing
          ? "Your changes have been saved."
          : "MiySpend will record this automatically each time it's due.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e) {
      console.warn("Failed to save recurring:", e);
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Failed to save recurring transaction."
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!isEditing || !recurringId) return;
    Alert.alert(
      "Delete Recurring Transaction",
      `Delete "${description}"? Future occurrences won't be generated. Already-recorded transactions stay in your history.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteRecurringTransaction(db, recurringId);
              router.back();
            } catch (e) {
              console.warn("Failed to delete recurring:", e);
              Alert.alert("Error", "Could not delete this recurring transaction.");
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  function onStartChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") {
      setShowStartPicker(false);
    }
    if (event.type === "set" && selected) {
      setNextOccurrence(toDateString(selected));
      clearError("start");
      if (endDate && endDate < toDateString(selected)) {
        setEndDate(null);
      }
    }
  }

  function onEndChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") {
      setShowEndPicker(false);
    }
    if (event.type === "set" && selected) {
      setEndDate(toDateString(selected));
      clearError("end");
    }
  }

  const suggestions = type === "income" ? INCOME_SUGGESTIONS : EXPENSE_SUGGESTIONS;

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
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {isEditing ? "Edit Recurring" : "New Recurring"}
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
              <Text style={styles.label}>Type</Text>
              <View style={styles.segment}>
                {(["income", "expense"] as RecurringType[]).map((t) => {
                  const isIncome = t === "income";
                  const selected = type === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => selectType(t)}
                      style={({ pressed }) => [
                        styles.segmentButton,
                        selected && isIncome && styles.segmentIncome,
                        selected && !isIncome && styles.segmentExpense,
                        pressed && styles.pressedSegment,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={isIncome ? "Income" : "Expense"}
                    >
                      <Ionicons
                        name={isIncome ? "trending-up" : "trending-down"}
                        size={16}
                        color={
                          selected
                            ? isIncome
                              ? Colors.success
                              : Colors.error
                            : Colors.textSecondary
                        }
                      />
                      <Text
                        style={[
                          styles.segmentLabel,
                          selected && {
                            color: isIncome ? Colors.success : Colors.error,
                            fontWeight: "600",
                          },
                        ]}
                      >
                        {isIncome ? "Income" : "Expense"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Amount</Text>
                <View style={[styles.amountWrap, errors.amount && styles.wrapError]}>
                  <Text style={styles.currency}>₦</Text>
                  <Input
                    value={amount}
                    onChangeText={(t) => {
                      setAmount(t);
                      clearError("amount");
                    }}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    style={styles.amountInput}
                    accessibilityLabel="Amount in naira"
                  />
                </View>
                {errors.amount ? (
                  <Text style={styles.error}>{errors.amount}</Text>
                ) : null}
              </View>

              <View style={styles.field}>
                <Input
                  label={type === "income" ? "Source / description" : "Description"}
                  value={description}
                  onChangeText={(t) => {
                    setDescription(t);
                    clearError("description");
                  }}
                  placeholder={
                    type === "income"
                      ? "e.g. Monthly salary"
                      : "e.g. Rent"
                  }
                  error={errors.description}
                  autoCapitalize="sentences"
                  returnKeyType="done"
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}
                >
                  {suggestions.map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => {
                        setDescription(s);
                        clearError("description");
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        description === s && styles.chipActive,
                        pressed && styles.chipPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${s}`}
                    >
                      <Text
                        style={[
                          styles.chipLabel,
                          description === s && styles.chipLabelActive,
                        ]}
                      >
                        {s}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {type === "expense" ? (
                <View style={styles.field}>
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
              ) : null}

              <View style={styles.field}>
                <Text style={styles.label}>Payment method (optional)</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}
                >
                  <Pressable
                    onPress={() => setPaymentMethod("")}
                    style={({ pressed }) => [
                      styles.chip,
                      paymentMethod === "" && styles.chipClearActive,
                      pressed && styles.chipPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: paymentMethod === "" }}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        paymentMethod === "" && styles.chipClearLabel,
                      ]}
                    >
                      Any
                    </Text>
                  </Pressable>
                  {PAYMENT_METHODS.map((m) => {
                    const active = paymentMethod === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => setPaymentMethod(m)}
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

              <View style={styles.field}>
                <Text style={styles.label}>Frequency</Text>
                <View style={styles.segment}>
                  {RECURRING_FREQUENCIES.map((f) => {
                    const selected = frequency === f;
                    return (
                      <Pressable
                        key={f}
                        onPress={() => setFrequency(f)}
                        style={({ pressed }) => [
                          styles.segmentButton,
                          selected && styles.segmentFrequency,
                          pressed && styles.pressedSegment,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={FREQUENCY_LABELS[f]}
                      >
                        <Text
                          style={[
                            styles.segmentLabel,
                            selected && styles.segmentFrequencyLabel,
                          ]}
                        >
                          {FREQUENCY_LABELS[f]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
{frequency === "monthly" && type === "income" ? (
                    <Text style={styles.helper}>
                      {description
                        ? `"${description}" will repeat every ${formatHistoryDate(nextOccurrence)}`
                        : "Repeats on the same day each month."}
                    </Text>
                  ) : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>First occurrence</Text>
                <Pressable
                  onPress={() => setShowStartPicker(true)}
                  style={({ pressed }) => [
                    styles.dateButton,
                    pressed && styles.pressed,
                    errors.start && styles.wrapError,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose first occurrence, currently ${nextOccurrence}`}
                >
                  <Text style={styles.dateText}>
                    {formatHistoryDate(nextOccurrence)}
                  </Text>
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={Colors.primary}
                  />
                </Pressable>
                {errors.start ? (
                  <Text style={styles.error}>{errors.start}</Text>
                ) : null}
                {showStartPicker ? (
                  <DateTimePicker
                    value={parseDateString(nextOccurrence)}
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "default"}
                    onChange={onStartChange}
                  />
                ) : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>End date (optional)</Text>
                <Pressable
                  onPress={() => setShowEndPicker(true)}
                  style={({ pressed }) => [
                    styles.dateButton,
                    pressed && styles.pressed,
                    errors.end && styles.wrapError,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Choose end date"
                >
                  <Text style={styles.dateText}>
                    {endDate
                      ? formatHistoryDate(endDate)
                      : "No end date"}
                  </Text>
                  <View style={styles.dateActions}>
                    {endDate ? (
                      <Pressable
                        onPress={() => {
                          setEndDate(null);
                          clearError("end");
                        }}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Remove end date"
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
                {errors.end ? (
                  <Text style={styles.error}>{errors.end}</Text>
                ) : null}
                {showEndPicker ? (
                  <DateTimePicker
                    value={parseDateString(endDate ?? nextOccurrence)}
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "default"}
                    minimumDate={parseDateString(nextOccurrence)}
                    onChange={onEndChange}
                  />
                ) : null}
              </View>

              {isEditing ? (
                <View style={styles.field}>
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={styles.toggleTitle}>
                        {active ? "Active" : "Paused"}
                      </Text>
                      <Text style={styles.toggleDesc}>
                        {active
                          ? "Occurrences are generated when due."
                          : "Resuming skips occurrences missed while paused."}
                      </Text>
                    </View>
                    <Switch
                      value={active}
                      onValueChange={setActive}
                      trackColor={{
                        false: Colors.disabled,
                        true: Colors.primaryLight,
                      }}
                      thumbColor={Colors.surface}
                      accessibilityRole="switch"
                      accessibilityLabel="Recurring active"
                      accessibilityState={{ checked: active }}
                    />
                  </View>
                  {existing ? (
                    <Text style={styles.helper}>
                      Next occurrence: {formatHistoryDate(existing.next_occurrence)}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </Card>
          </AnimatedEntry>

          {isEditing ? (
            <AnimatedEntry delay={80}>
              <Button
                title="Delete"
                variant="destructive"
                onPress={confirmDelete}
                loading={deleting}
                disabled={deleting || saving}
              />
            </AnimatedEntry>
          ) : null}

          <AnimatedEntry delay={100}>
            <Button
              title={isEditing ? "Save Changes" : "Create Recurring"}
              onPress={handleSave}
              loading={saving}
              disabled={saving || deleting}
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
  segment: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  segmentButton: {
    flex: 1,
    minWidth: 80,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pressedSegment: Pressed.default,
  segmentIncome: {
    borderColor: Colors.success,
    backgroundColor: Colors.primarySoft,
  },
  segmentExpense: {
    borderColor: Colors.error,
    backgroundColor: Colors.error + "0F",
  },
  segmentFrequency: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  segmentLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  segmentFrequencyLabel: {
    color: Colors.primary,
    fontWeight: "600",
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
  chipPressed: Pressed.default,
  chipActive: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  chipClearActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  chipLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  chipLabelActive: {
    color: Colors.primary,
    fontWeight: "600",
  },
  chipClearLabel: {
    color: Colors.primary,
  },
  chipIcon: {
    fontSize: 16,
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
  error: {
    ...Typography.caption,
    color: Colors.error,
  },
  helper: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  toggleInfo: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  toggleDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  pressed: Pressed.default,
});