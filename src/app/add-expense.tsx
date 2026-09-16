import React, { useState, useCallback } from "react";
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { Screen } from "../components/ui";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Typography } from "../constants/typography";
import { Spacing } from "../constants/spacing";
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

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
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

export default function AddExpenseScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | "">("");
  const [date, setDate] = useState(getTodayString());
  const [time, setTime] = useState(getNowTimeString());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const [errors, setErrors] = useState<{
    amount?: string;
    description?: string;
    category?: string;
    paymentMethod?: string;
  }>({});

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  const loadCategories = useCallback(async () => {
    if (categoriesLoaded) return;
    try {
      const cats = await getAllCategories(db);
      setCategories(cats);
      setCategoriesLoaded(true);
    } catch {
      setCategoriesLoaded(true);
    }
  }, [db, categoriesLoaded]);

  React.useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    const parsedAmount = parseNairaInput(amount);
    if (!amount.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      newErrors.amount = "Please enter a valid amount greater than zero";
    }

    if (!description.trim()) {
      newErrors.description = "Please enter what you bought";
    }

    if (!selectedCategory) {
      newErrors.category = "Please select a category";
    }

    if (!selectedPaymentMethod) {
      newErrors.paymentMethod = "Please select a payment method";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    if (loading) return;

    setLoading(true);
    try {
      const parsedAmount = parseNairaInput(amount);
      const amountKobo = nairaToKobo(parsedAmount);
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
    } catch {
      Alert.alert("Error", "Failed to save expense. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen scrollable={false}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityLabel="Go back"
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Add Expense</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.amountSection}>
            <Text style={styles.amountLabel}>Amount</Text>
            <View style={styles.amountInputRow}>
              <Text style={styles.currencySymbol}>₦</Text>
              <Input
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={(text) => {
                  setAmount(text);
                  if (errors.amount) setErrors((prev) => ({ ...prev, amount: undefined }));
                }}
                error={errors.amount}
                style={styles.amountInput}
              />
            </View>
          </View>

          <Input
            label="What did you buy?"
            placeholder="e.g. Lunch at work"
            value={description}
            onChangeText={(text) => {
              setDescription(text);
              if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
            }}
            error={errors.description}
          />

          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>Category</Text>
            {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipContainer}
            >
              {categories.map((cat) => {
                const isSelected = selectedCategory?.id === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => {
                      setSelectedCategory(cat);
                      if (errors.category) setErrors((prev) => ({ ...prev, category: undefined }));
                    }}
                    style={[
                      styles.chip,
                      isSelected && styles.chipSelected,
                      isSelected && { borderColor: cat.color, backgroundColor: cat.color + "15" },
                    ]}
                  >
                    <Text style={styles.chipIcon}>{cat.icon}</Text>
                    <Text
                      style={[
                        styles.chipText,
                        isSelected && { color: cat.color, fontWeight: "600" },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>Payment Method</Text>
            {errors.paymentMethod && (
              <Text style={styles.errorText}>{errors.paymentMethod}</Text>
            )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipContainer}
            >
              {PAYMENT_METHODS.map((method) => {
                const isSelected = selectedPaymentMethod === method;
                return (
                  <Pressable
                    key={method}
                    onPress={() => {
                      setSelectedPaymentMethod(method);
                      if (errors.paymentMethod)
                        setErrors((prev) => ({ ...prev, paymentMethod: undefined }));
                    }}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isSelected && styles.chipTextSelected,
                      ]}
                    >
                      {method}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>Date</Text>
              <Card style={styles.dateCard}>
                <Pressable
                  onPress={() => {
                    Alert.alert("Change Date", "Date picker will be available in a future update.", [
                      { text: "OK" },
                    ]);
                  }}
                  style={styles.datePressable}
                >
                  <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                  <Text style={styles.dateText}>{formatDisplayDate(date)}</Text>
                </Pressable>
              </Card>
            </View>

            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>Time</Text>
              <Card style={styles.dateCard}>
                <Pressable
                  onPress={() => {
                    Alert.alert("Change Time", "Time picker will be available in a future update.", [
                      { text: "OK" },
                    ]);
                  }}
                  style={styles.datePressable}
                >
                  <Ionicons name="time-outline" size={18} color={Colors.primary} />
                  <Text style={styles.dateText}>{formatDisplayTime(time)}</Text>
                </Pressable>
              </Card>
            </View>
          </View>

          <Input
            label="Note (optional)"
            placeholder="Any additional details..."
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            style={styles.noteInput}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title="Save Expense"
            onPress={handleSave}
            loading={loading}
            disabled={loading}
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xl,
    gap: Spacing.base,
  },
  amountSection: {
    gap: Spacing.xs,
  },
  amountLabel: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  currencySymbol: {
    ...Typography.amount,
    color: Colors.primary,
  },
  amountInput: {
    flex: 1,
  },
  fieldSection: {
    gap: Spacing.xs,
  },
  fieldLabel: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
  },
  chipContainer: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.xs,
  },
  chipSelected: {
    borderWidth: 1.5,
  },
  chipIcon: {
    fontSize: 16,
  },
  chipText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  chipTextSelected: {
    color: Colors.primary,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: Spacing.base,
  },
  halfField: {
    flex: 1,
    gap: Spacing.xs,
  },
  dateCard: {
    padding: Spacing.sm,
  },
  datePressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dateText: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
  },
  noteInput: {
    height: 80,
    textAlignVertical: "top",
    paddingTop: Spacing.md,
  },
  footer: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.sm,
  },
});
