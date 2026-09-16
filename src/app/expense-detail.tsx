import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { IconContainer } from "../components/ui/IconContainer";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Typography } from "../constants/typography";
import { Spacing } from "../constants/spacing";
import {
  getExpenseById,
  updateExpense,
  deleteExpense,
} from "../database/expenses";
import { getAllCategories } from "../database/categories";
import { nairaToKobo, koboToNaira, parseNairaInput, formatKoboAmount } from "../utils/money";
import type { ExpenseWithCategory, Category, PaymentMethod } from "../types/database";
import { PAYMENT_METHODS } from "../types/database";

export default function ExpenseDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expense, setExpense] = useState<ExpenseWithCategory | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState(false);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | "">("");
  const [note, setNote] = useState("");

  const [errors, setErrors] = useState<{
    amount?: string;
    description?: string;
    category?: string;
    paymentMethod?: string;
  }>({});

  const loadExpense = useCallback(async () => {
    if (!id) return;
    try {
      const exp = await getExpenseById(db, Number(id));
      if (exp) {
        setExpense(exp);
        setAmount(String(koboToNaira(exp.amount)));
        setDescription(exp.description);
        setSelectedPaymentMethod(exp.payment_method as PaymentMethod);
        setNote(exp.note);
      }
      const cats = await getAllCategories(db);
      setCategories(cats);
      if (exp) {
        const cat = cats.find((c) => c.id === exp.category_id);
        if (cat) setSelectedCategory(cat);
      }
    } catch (e) {
      console.warn("Failed to load expense:", e);
    } finally {
      setLoading(false);
    }
  }, [db, id]);

  useEffect(() => {
    loadExpense();
  }, [loadExpense]);

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
    if (!validate() || !expense) return;
    if (saving) return;

    setSaving(true);
    try {
      const parsed = parseNairaInput(amount);
      const amountKobo = nairaToKobo(parsed);

      await updateExpense(db, expense.id, {
        amount: amountKobo,
        category_id: selectedCategory!.id,
        description: description.trim(),
        payment_method: selectedPaymentMethod as string,
        note: note.trim(),
      });

      setEditing(false);
      await loadExpense();
      Alert.alert("Success", "Expense updated successfully");
    } catch (e) {
      console.warn("Failed to update expense:", e);
      Alert.alert("Error", "Failed to update expense. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!expense) return;
    Alert.alert(
      "Delete Expense",
      "Are you sure you want to delete this expense? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteExpense(db, expense.id);
              router.back();
            } catch (e) {
              console.warn("Failed to delete expense:", e);
              Alert.alert("Error", "Failed to delete expense.");
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!expense) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Expense</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.notFound}>Expense not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Expense Details</Text>
        <View style={styles.headerActions}>
          {!editing && (
            <Pressable
              onPress={() => setEditing(true)}
              style={styles.headerButton}
            >
              <Ionicons name="pencil-outline" size={20} color={Colors.primary} />
            </Pressable>
          )}
          <Pressable onPress={handleDelete} style={styles.headerButton}>
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!editing ? (
          <>
            <View style={styles.heroSection}>
              <IconContainer
                size={56}
                backgroundColor={expense.category_color + "20"}
              >
                <Text style={styles.heroIcon}>{expense.category_icon}</Text>
              </IconContainer>
              <Text style={styles.heroAmount}>
                {formatKoboAmount(expense.amount)}
              </Text>
              <Text style={styles.heroCategory}>
                {expense.category_name}
              </Text>
            </View>

            <Card style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Description</Text>
                <Text style={styles.detailValue}>{expense.description}</Text>
              </View>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Payment Method</Text>
                <Text style={styles.detailValue}>{expense.payment_method}</Text>
              </View>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Date</Text>
                <Text style={styles.detailValue}>{expense.date}</Text>
              </View>
              {expense.note ? (
                <>
                  <View style={styles.detailDivider} />
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Note</Text>
                    <Text style={styles.detailValue}>{expense.note}</Text>
                  </View>
                </>
              ) : null}
            </Card>
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
                      style={[
                        styles.chip,
                        active && {
                          borderColor: cat.color,
                          backgroundColor: cat.color + "15",
                        },
                      ]}
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
                      style={[styles.chip, active && styles.chipActive]}
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
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => {
                  setEditing(false);
                  setAmount(String(koboToNaira(expense.amount)));
                  setDescription(expense.description);
                  setSelectedPaymentMethod(expense.payment_method as PaymentMethod);
                  setNote(expense.note);
                  const cat = categories.find((c) => c.id === expense.category_id);
                  if (cat) setSelectedCategory(cat);
                  setErrors({});
                }}
              />
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
  },
  heroIcon: {
    fontSize: 28,
  },
  heroAmount: {
    ...Typography.display,
    color: Colors.textPrimary,
  },
  heroCategory: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
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
    borderRadius: Radius.md,
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
  noteInput: {
    height: 80,
    textAlignVertical: "top",
    paddingTop: Spacing.md,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.base,
    paddingVertical: Spacing.base,
  },
});
