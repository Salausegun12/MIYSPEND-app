import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedEntry } from "../components/ui/AnimatedEntry";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Colors } from "../constants/colors";
import { Spacing } from "../constants/spacing";
import { Pressed } from "../constants/motion";
import { Radius } from "../constants/radius";
import { Typography } from "../constants/typography";
import {
  addBudget,
  deleteBudget,
  getBudgetsWithSpending,
  getCurrentBudgetPeriod,
  updateBudgetLimit,
} from "../database/budget";
import { getAllCategories } from "../database/categories";
import { getMonthEnd, getMonthStart } from "../utils/date";
import { formatKoboAmount, nairaToKobo, parseNairaAmount } from "../utils/money";
import {
  calculateBudgetProgress,
  getBudgetRemainingText,
} from "../utils/budget";
import type { BudgetWithCategory, Category } from "../types/database";

export default function BudgetFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const budgetId = id ? Number(id) : null;
  const isEditing = budgetId !== null && !Number.isNaN(budgetId);

  const [categories, setCategories] = useState<Category[]>([]);
  const [budget, setBudget] = useState<BudgetWithCategory | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  );
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; category?: string }>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cats, budgets] = await Promise.all([
        getAllCategories(db),
        getBudgetsWithSpending(
          db,
          getCurrentBudgetPeriod(getMonthStart(), getMonthEnd())
        ),
      ]);
      setCategories(cats);

      if (!isEditing) {
        // A category can only carry one limit, so only offer the ones that do
        // not already have a budget.
        const taken = new Set(budgets.map((b) => b.category_id));
        setCategories(cats.filter((c) => !taken.has(c.id)));
        return;
      }

      const existing = budgets.find((b) => b.id === budgetId) ?? null;
      setBudget(existing);
      if (existing) {
        setSelectedCategory(
          cats.find((c) => c.id === existing.category_id) ?? null
        );
        setAmount((existing.limit_amount / 100).toString());
      }
    } catch (e) {
      console.warn("Failed to load budget:", e);
    } finally {
      setLoading(false);
    }
  }, [db, budgetId, isEditing]);

  useEffect(() => {
    load();
  }, [load]);

  function validate(): boolean {
    const next: typeof errors = {};

    const parsed = parseNairaAmount(amount);
    if (!amount.trim() || Number.isNaN(parsed) || parsed <= 0) {
      next.amount = "Enter a valid monthly limit";
    }
    if (!selectedCategory) {
      next.category = "Select a category";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    if (saving) return;

    setSaving(true);
    try {
      const limitKobo = nairaToKobo(parseNairaAmount(amount));

      if (isEditing && budget) {
        await updateBudgetLimit(db, budget.id, limitKobo);
      } else {
        await addBudget(db, {
          category_id: selectedCategory!.id,
          limit_amount: limitKobo,
        });
      }

      const name = selectedCategory?.name ?? "";
      Alert.alert(
        isEditing ? "Budget Updated" : "Budget Created",
        isEditing
          ? "Your monthly limit has been saved."
          : `You can now track your ${name} spending each month.`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e) {
      console.warn("Failed to save budget:", e);
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Failed to save budget."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!budget) return;
    Alert.alert(
      "Delete Budget",
      "Remove this monthly limit? Your expenses will not be affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBudget(db, budget.id);
              router.back();
            } catch (e) {
              console.warn("Failed to delete budget:", e);
              Alert.alert("Error", "Failed to delete budget.");
            }
          },
        },
      ]
    );
  }

  function renderHeader(title: string) {
    return (
      <AnimatedEntry delay={40}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.closeButton}
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
      </AnimatedEntry>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {renderHeader(isEditing ? "Edit Budget" : "New Budget")}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (isEditing && !budget) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {renderHeader("Edit Budget")}
        <View style={styles.center}>
          <Text style={styles.missingText}>
            This budget no longer exists.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const progress = budget ? calculateBudgetProgress(budget) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {renderHeader(isEditing ? "Edit Budget" : "New Budget")}

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {progress && (
            <AnimatedEntry delay={60}>
              <Card>
                <Text style={styles.label}>Spent this month</Text>
                {progress.spent > 0 ? (
                  <>
                    <Text style={styles.spentAmount}>
                      {formatKoboAmount(progress.spent)}
                    </Text>
                    <Text style={styles.spentNote}>
                      {getBudgetRemainingText(progress)} of{" "}
                      {formatKoboAmount(progress.limit)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.spentNote}>
                    No spending recorded on this category yet this month.
                  </Text>
                )}
              </Card>
            </AnimatedEntry>
          )}

          <AnimatedEntry delay={80}>
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
                        setErrors((e) => ({ ...e, category: undefined }));
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
          </AnimatedEntry>

          <AnimatedEntry delay={100}>
            <View>
              <Text style={styles.label}>Monthly Limit</Text>
              <View style={styles.amountRow}>
                <Text style={styles.nairaSign}>₦</Text>
                <View style={styles.amountField}>
                  <Input
                    placeholder="80,000"
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={(t) => {
                      setAmount(t);
                      setErrors((e) => ({ ...e, amount: undefined }));
                    }}
                    error={errors.amount}
                    accessibilityLabel="Monthly limit"
                  />
                </View>
              </View>
            </View>
          </AnimatedEntry>

          <AnimatedEntry delay={140}>
            <Text style={styles.hint}>
              The limit is compared against what you have spent on this category
              since the first of the month. Spending resets automatically next
              month.
            </Text>
          </AnimatedEntry>

          <AnimatedEntry delay={160}>
            <Button
              title={isEditing ? "Save Changes" : "Create Budget"}
              onPress={handleSave}
              loading={saving}
            />
          </AnimatedEntry>

          {isEditing && (
            <AnimatedEntry delay={180}>
              <Button
                title="Delete Budget"
                onPress={handleDelete}
                variant="destructive"
              />
            </AnimatedEntry>
          )}
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
    paddingHorizontal: Spacing.base,
  },
  missingText: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xl,
    gap: Spacing.base,
  },
  label: {
    ...Typography.label,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  error: {
    ...Typography.caption,
    color: Colors.error,
  },
  spentAmount: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  spentNote: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
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
  },
  chipPressed: Pressed.default,
  chipIcon: {
    fontSize: 16,
    marginRight: Spacing.xs,
  },
  chipLabel: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
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
  hint: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
});
