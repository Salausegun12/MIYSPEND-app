import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, Href } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedEntry } from "../components/ui/AnimatedEntry";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Spacing } from "../constants/spacing";
import { Typography } from "../constants/typography";
import {
  deleteBudget,
  getBudgetsWithSpending,
  getCurrentBudgetPeriod,
} from "../database/budget";
import { getMonthEnd, getMonthStart } from "../utils/date";
import { formatKoboAmount } from "../utils/money";
import {
  BudgetProgress,
  calculateBudgetProgress,
  getBudgetProgressFraction,
  getBudgetRemainingText,
  getBudgetStatusLabel,
} from "../utils/budget";
import type { BudgetStatus } from "../types/database";

const STATUS_COLORS: Record<BudgetStatus, string> = {
  normal: Colors.success,
  near: Colors.warning,
  reached: Colors.warning,
  over: Colors.error,
};

const STATUS_ICONS: Record<BudgetStatus, keyof typeof Ionicons.glyphMap> = {
  normal: "checkmark-circle",
  near: "alert-circle",
  reached: "warning",
  over: "warning",
};

function BudgetCard({
  progress,
  onEdit,
  onDelete,
}: {
  progress: BudgetProgress;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { budget, spent, limit, percent, status } = progress;
  const color = STATUS_COLORS[status];

  return (
    <Card>
      <View style={styles.cardTop}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>{budget.category_icon}</Text>
          <View style={styles.cardTitles}>
            <Text style={styles.cardTitle}>{budget.category_name}</Text>
            <Text style={styles.cardSubtitle}>Monthly budget</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: color + "1F" }]}>
            <Ionicons name={STATUS_ICONS[status]} size={12} color={color} />
            <Text style={[styles.badgeText, { color }]}>
              {getBudgetStatusLabel(status)}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={onEdit}
          style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${budget.category_name} budget`}
        >
          <View style={styles.amountRow}>
            <Text style={styles.spent}>{formatKoboAmount(spent)}</Text>
            <Text style={styles.limit}> / {formatKoboAmount(limit)}</Text>
          </View>
          <Text style={[styles.percent, { color }]}>{percent}% used</Text>
        </Pressable>

        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.min(percent, 100) }}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${getBudgetProgressFraction(percent) * 100}%`,
                backgroundColor: color,
              },
            ]}
          />
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.remaining}>
            {getBudgetRemainingText(progress)}
          </Text>
          <Pressable
            onPress={onDelete}
            style={({ pressed }) => [
              styles.deleteButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${budget.category_name} budget`}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.error} />
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

export default function BudgetScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [progresses, setProgresses] = useState<BudgetProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const period = getCurrentBudgetPeriod(getMonthStart(), getMonthEnd());
      const budgets = await getBudgetsWithSpending(db, period);
      setProgresses(budgets.map(calculateBudgetProgress));
    } catch (e) {
      console.warn("Failed to load budgets:", e);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function confirmDelete(progress: BudgetProgress) {
    const { budget } = progress;
    Alert.alert(
      "Delete Budget",
      `Remove the monthly budget for ${budget.category_name}? The limit will be deleted, your expenses will not.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBudget(db, budget.id);
              load();
            } catch (e) {
              console.warn("Failed to delete budget:", e);
              Alert.alert("Error", "Failed to delete budget.");
            }
          },
        },
      ]
    );
  }

  const totalLimit = progresses.reduce((sum, p) => sum + p.limit, 0);
  const totalSpent = progresses.reduce((sum, p) => sum + p.spent, 0);
  const overCount = progresses.filter((p) => p.status === "over").length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeButton}
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Budgets</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {progresses.length > 0 && (
            <AnimatedEntry delay={20}>
              <Card>
                <Text style={styles.summaryLabel}>This month</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summarySpent}>
                    {formatKoboAmount(totalSpent)}
                  </Text>
                  <Text style={styles.summaryLimit}>
                    {" "}
                    of {formatKoboAmount(totalLimit)} budgeted
                  </Text>
                </View>
                {overCount > 0 && (
                  <View style={styles.summaryWarning}>
                    <Ionicons
                      name="warning"
                      size={16}
                      color={Colors.error}
                    />
                    <Text style={styles.summaryWarningText}>
                      {overCount} {overCount === 1 ? "budget is" : "budgets are"}{" "}
                      over the limit
                    </Text>
                  </View>
                )}
              </Card>
            </AnimatedEntry>
          )}

          {progresses.length === 0 ? (
            <EmptyState
              title="No budgets yet"
              message="Set a monthly limit on a category to track how much of it you have spent."
              icon={
                <Ionicons
                  name="pie-chart-outline"
                  size={40}
                  color={Colors.primary}
                />
              }
            />
          ) : (
            progresses.map((progress, index) => (
              <AnimatedEntry key={progress.budget.id} delay={40 + index * 20}>
                <BudgetCard
                  progress={progress}
                  onEdit={() =>
                    router.push(
                      `/budget-form?id=${progress.budget.id}` as Href
                    )
                  }
                  onDelete={() => confirmDelete(progress)}
                />
              </AnimatedEntry>
            ))
          )}

          <AnimatedEntry delay={120}>
            <Button
              title="Add Budget"
              onPress={() => router.push("/budget-form" as Href)}
            />
          </AnimatedEntry>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
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
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xl,
    gap: Spacing.base,
  },
  pressed: {
    opacity: 0.65,
  },
  cardTop: {
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  cardIcon: {
    fontSize: 24,
  },
  cardTitles: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  cardSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  badgeText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  cardBody: {
    gap: 2,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  spent: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  limit: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  percent: {
    ...Typography.caption,
    fontWeight: "600",
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.disabledBackground,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  remaining: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  deleteButton: {
    padding: Spacing.xs,
  },
  summaryLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    marginTop: Spacing.xs,
  },
  summarySpent: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  summaryLimit: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  summaryWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  summaryWarningText: {
    ...Typography.caption,
    color: Colors.error,
    fontWeight: "500",
  },
});
