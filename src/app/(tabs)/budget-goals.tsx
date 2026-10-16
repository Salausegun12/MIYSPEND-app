import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter, Href } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedEntry } from "../../components/ui/AnimatedEntry";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { usePopup } from "../../components/popup/PopupProvider";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Spacing } from "../../constants/spacing";
import { Shadows } from "../../constants/shadows";
import { Pressed } from "../../constants/motion";
import { Typography } from "../../constants/typography";
import {
  deleteBudget,
  getBudgetsWithSpending,
  getCurrentBudgetPeriod,
} from "../../database/budget";
import { getGoalsWithBalances } from "../../database/savingsGoals";
import { formatShortDate, getMonthEnd, getMonthStart } from "../../utils/date";
import { formatKoboAmount } from "../../utils/money";
import {
  BudgetProgress,
  calculateBudgetProgress,
  getBudgetProgressFraction,
  getBudgetRemainingText,
  getBudgetStatusLabel,
} from "../../utils/budget";
import type {
  BudgetStatus,
  SavingsGoalWithBalance,
} from "../../types/database";

const STATUS_COLORS: Record<BudgetStatus, string> = {
  normal: Colors.success,
  near: Colors.warning,
  reached: Colors.warning,
  over: Colors.error,
};

const STATUS_GRADIENTS: Record<BudgetStatus, readonly [string, string]> = {
  normal: Colors.gradient.mint,
  near: Colors.gradient.gold,
  reached: Colors.gradient.sunset,
  over: Colors.gradient.danger,
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
  const fraction = getBudgetProgressFraction(percent);

  return (
    <Card style={styles.budgetCard}>
      {/* Card header */}
      <View style={styles.budgetCardHeader}>
        <View style={[styles.budgetIconWrap, { backgroundColor: color + "1F" }]}>
          <Text style={styles.budgetIcon}>{budget.category_icon}</Text>
        </View>
        <View style={styles.budgetTitles}>
          <Text style={styles.budgetCategoryName}>{budget.category_name}</Text>
          <Text style={styles.budgetSubtitle}>Monthly budget</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: color + "18" }]}>
          <Ionicons name={STATUS_ICONS[status]} size={11} color={color} />
          <Text style={[styles.statusBadgeText, { color }]}>
            {getBudgetStatusLabel(status)}
          </Text>
        </View>
      </View>

      {/* Amounts */}
      <Pressable
        onPress={onEdit}
        style={({ pressed }) => [styles.budgetBody, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${budget.category_name} budget`}
      >
        <View style={styles.amountRow}>
          <Text style={styles.spentAmount}>{formatKoboAmount(spent)}</Text>
          <Text style={styles.limitText}> / {formatKoboAmount(limit)}</Text>
        </View>
        <Text style={[styles.percentText, { color }]}>{percent}% used</Text>
      </Pressable>

      {/* Progress bar */}
      <View
        style={styles.progressTrack}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.min(percent, 100) }}
      >
        <LinearGradient
          colors={STATUS_GRADIENTS[status]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: `${fraction * 100}%` }]}
        />
      </View>

      {/* Footer */}
      <View style={styles.budgetFooter}>
        <Text style={styles.remainingText}>{getBudgetRemainingText(progress)}</Text>
        <Pressable
          onPress={onDelete}
          style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${budget.category_name} budget`}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={15} color={Colors.error} />
        </Pressable>
      </View>
    </Card>
  );
}

function GoalCard({ goal }: { goal: SavingsGoalWithBalance }) {
  const router = useRouter();
  const percent = goal.percent_complete;
  const fraction = Math.min(percent, 100) / 100;
  const done = goal.is_reached;
  const color = done ? Colors.success : Colors.primary;

  return (
    <Pressable
      onPress={() => router.push(`/goal-detail?id=${goal.id}` as Href)}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
      accessibilityRole="button"
      accessibilityLabel={`${goal.name}, ${percent} percent complete`}
    >
      <Card style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <View style={[styles.goalIconWrap, { backgroundColor: color + "1F" }]}>
            <Ionicons
              name={done ? "checkmark-circle" : "flag-outline"}
              size={20}
              color={color}
            />
          </View>
          <View style={styles.budgetTitles}>
            <Text style={styles.budgetCategoryName} numberOfLines={1}>{goal.name}</Text>
            <Text style={styles.budgetSubtitle}>
              {goal.target_date ? `Target ${formatShortDate(goal.target_date)}` : "No target date"}
            </Text>
          </View>
          <View style={styles.goalPercWrap}>
            <Text style={[styles.goalPercText, { color }]}>{percent}%</Text>
          </View>
        </View>

        <View style={styles.goalAmounts}>
          <Text style={styles.spentAmount}>{formatKoboAmount(goal.balance)}</Text>
          <Text style={styles.limitText}> / {formatKoboAmount(goal.target_amount)}</Text>
        </View>
        <Text style={styles.completeLabel}>saved</Text>

        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.min(percent, 100) }}
        >
          <LinearGradient
            colors={done ? Colors.gradient.mint : Colors.gradient.growth}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${fraction * 100}%` }]}
          />
        </View>

        <View style={styles.goalFooter}>
          <Text style={styles.remainingText}>
            {goal.remaining > 0
              ? `${formatKoboAmount(goal.remaining)} to go`
              : "🎉 Target reached!"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        </View>
      </Card>
    </Pressable>
  );
}

export default function BudgetGoalsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const popup = usePopup();
  const [progresses, setProgresses] = useState<BudgetProgress[]>([]);
  const [goals, setGoals] = useState<SavingsGoalWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const period = getCurrentBudgetPeriod(getMonthStart(), getMonthEnd());
      const [budgets, goalList] = await Promise.all([
        getBudgetsWithSpending(db, period),
        getGoalsWithBalances(db),
      ]);
      setProgresses(budgets.map(calculateBudgetProgress));
      setGoals(goalList);
    } catch (e) {
      console.warn("Failed to load budgets and goals:", e);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  async function confirmDelete(progress: BudgetProgress) {
    const { budget } = progress;
    const confirmed = await popup.confirm(
      "Delete Budget",
      `Remove the monthly budget for ${budget.category_name}? The limit will be deleted, your expenses will not.`,
      { destructive: true, confirmText: "Delete" }
    );
    if (!confirmed) return;

    try {
      await deleteBudget(db, budget.id);
      load();
    } catch (e) {
      console.warn("Failed to delete budget:", e);
      popup.error("Failed to delete budget.");
    }
  }

  const totalLimit = progresses.reduce((sum, p) => sum + p.limit, 0);
  const totalSpent = progresses.reduce((sum, p) => sum + p.spent, 0);
  const overCount = progresses.filter((p) => p.status === "over").length;

  const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.balance, 0);
  const completed = goals.filter((g) => g.is_reached).length;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Budget & Goals</Text>
        </View>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Budget & Goals</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Budgets section ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionDot, { backgroundColor: Colors.primary }]} />
            <Text style={styles.sectionLabel}>Budgets</Text>
          </View>

          {progresses.length > 0 && (
            <AnimatedEntry delay={20}>
              <LinearGradient
                colors={Colors.gradient.hero}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryHeroCard}
              >
                <View style={styles.summaryHeroBubble} />
                <Text style={styles.summaryHeroLabel}>This month&apos;s spending</Text>
                <Text style={styles.summaryHeroAmount}>{formatKoboAmount(totalSpent)}</Text>
                <Text style={styles.summaryHeroSub}>of {formatKoboAmount(totalLimit)} budgeted</Text>
                {overCount > 0 && (
                  <View style={styles.warningBadge}>
                    <Ionicons name="warning" size={13} color={Colors.white} />
                    <Text style={styles.warningBadgeText}>
                      {overCount} {overCount === 1 ? "budget" : "budgets"} over limit
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </AnimatedEntry>
          )}

          {progresses.length === 0 ? (
            <EmptyState
              title="No budgets yet"
              message="Set a monthly limit on a category to track how much you have spent."
              icon={<Ionicons name="pie-chart-outline" size={40} color={Colors.primary} />}
            />
          ) : (
            progresses.map((progress, index) => (
              <AnimatedEntry key={progress.budget.id} delay={40 + index * 20}>
                <BudgetCard
                  progress={progress}
                  onEdit={() =>
                    router.push(`/budget-form?id=${progress.budget.id}` as Href)
                  }
                  onDelete={() => confirmDelete(progress)}
                />
              </AnimatedEntry>
            ))
          )}

          <AnimatedEntry delay={140}>
            <Button
              title="+ Add Budget"
              onPress={() => router.push("/budget-form" as Href)}
            />
          </AnimatedEntry>
        </View>

        {/* ── Goals section ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionDot, { backgroundColor: Colors.accent.gold }]} />
            <Text style={styles.sectionLabel}>Savings Goals</Text>
          </View>

          {goals.length > 0 && (
            <AnimatedEntry delay={20}>
              <Card style={styles.goalsSummaryCard}>
                <View style={styles.goalsSummaryRow}>
                  <View style={styles.goalsSummaryStat}>
                    <Text style={styles.goalsSummaryStatLabel}>Total saved</Text>
                    <Text style={styles.goalsSummaryStatValue}>{formatKoboAmount(totalSaved)}</Text>
                  </View>
                  <View style={styles.goalsSummaryDivider} />
                  <View style={styles.goalsSummaryStat}>
                    <Text style={styles.goalsSummaryStatLabel}>Target</Text>
                    <Text style={styles.goalsSummaryStatValue}>{formatKoboAmount(totalTarget)}</Text>
                  </View>
                  <View style={styles.goalsSummaryDivider} />
                  <View style={styles.goalsSummaryStat}>
                    <Text style={styles.goalsSummaryStatLabel}>Completed</Text>
                    <Text style={[styles.goalsSummaryStatValue, { color: Colors.accent.violet }]}>{completed}</Text>
                  </View>
                </View>
              </Card>
            </AnimatedEntry>
          )}

          {goals.length === 0 ? (
            <EmptyState
              title="No goals yet"
              message="Create a goal to start tracking money you are saving up for."
              icon={<Ionicons name="flag-outline" size={40} color={Colors.primary} />}
            />
          ) : (
            goals.map((goal, index) => (
              <AnimatedEntry key={goal.id} delay={40 + index * 20}>
                <GoalCard goal={goal} />
              </AnimatedEntry>
            ))
          )}

          <AnimatedEntry delay={140}>
            <Button
              title="+ New Goal"
              onPress={() => router.push("/goal-form" as Href)}
            />
          </AnimatedEntry>
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
  header: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h1,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.xl,
  },
  section: {
    gap: Spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingLeft: 2,
  },
  sectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sectionLabel: {
    ...Typography.h3,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  pressed: Pressed.default,

  // Summary hero gradient
  summaryHeroCard: {
    borderRadius: Radius.xxl,
    padding: Spacing.xl,
    gap: Spacing.xs,
    overflow: "hidden",
    ...Shadows.md,
  },
  summaryHeroBubble: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(167,139,250,0.25)",
    top: -30,
    right: -30,
  },
  summaryHeroLabel: {
    ...Typography.caption,
    color: "rgba(255,255,255,0.65)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryHeroAmount: {
    fontSize: 30,
    fontFamily: "Poppins_700Bold",
    color: Colors.white,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  summaryHeroSub: {
    ...Typography.bodySmall,
    color: "rgba(255,255,255,0.65)",
  },
  warningBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "rgba(220,38,38,0.35)",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    marginTop: Spacing.xs,
  },
  warningBadgeText: {
    ...Typography.caption,
    color: Colors.white,
    fontFamily: "Poppins_600SemiBold",
  },

  // Budget card
  budgetCard: {
    gap: Spacing.sm,
  },
  budgetCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  budgetIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  budgetIcon: {
    fontSize: 22,
    fontFamily: "Poppins_400Regular",
  },
  budgetTitles: {
    flex: 1,
    gap: 2,
  },
  budgetCategoryName: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontFamily: "Poppins_600SemiBold",
  },
  budgetSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  statusBadgeText: {
    ...Typography.caption,
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
  },
  budgetBody: {
    gap: 2,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  spentAmount: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  limitText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  percentText: {
    ...Typography.caption,
    fontFamily: "Poppins_700Bold",
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.borderLight,
    overflow: "hidden",
    marginTop: 2,
  },
  progressFill: {
    height: "100%",
    borderRadius: 5,
  },
  budgetFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  remainingText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  deleteBtn: {
    padding: Spacing.xs,
    borderRadius: Radius.sm,
  },

  // Goal card
  goalCard: {
    gap: Spacing.sm,
  },
  goalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  goalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  goalPercWrap: {
    // empty wrapper for percent text
  },
  goalPercText: {
    ...Typography.bodyMedium,
    fontFamily: "Poppins_700Bold",
  },
  goalAmounts: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: Spacing.xs,
  },
  completeLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  goalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },

  // Goals summary card
  goalsSummaryCard: {
    padding: Spacing.base,
    backgroundColor: Colors.successSoft,
    borderColor: "#B8EDD0",
  },
  goalsSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  goalsSummaryStat: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  goalsSummaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#C9F2DC",
  },
  goalsSummaryStatLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.2,
  },
  goalsSummaryStatValue: {
    ...Typography.h3,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
});